import crypto from 'node:crypto'

const CERT_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com'

// Google rotates these ~daily and sends max-age; cache so we don't refetch per request.
let certCache = { certs: null, expiresAt: 0 }

async function getGoogleCerts() {
  if (certCache.certs && Date.now() < certCache.expiresAt) return certCache.certs

  const res = await fetch(CERT_URL)
  if (!res.ok) throw new Error(`Could not fetch Google signing certs (${res.status})`)
  const certs = await res.json()

  const cacheControl = res.headers.get('cache-control') || ''
  const maxAge = Number(/max-age=(\d+)/.exec(cacheControl)?.[1]) || 3600
  certCache = { certs, expiresAt: Date.now() + maxAge * 1000 }
  return certs
}

function base64UrlDecode(str) {
  return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
}

/**
 * Verifies a Firebase Auth ID token without pulling in firebase-admin.
 * Firebase ID tokens are RS256 JWTs signed by Google; we check the signature
 * against Google's published certs plus the standard iss/aud/exp claims.
 * Returns the decoded payload, or throws.
 */
export async function verifyFirebaseToken(idToken, projectId) {
  if (!idToken) throw new Error('Missing token')

  const parts = idToken.split('.')
  if (parts.length !== 3) throw new Error('Malformed token')
  const [headerB64, payloadB64, signatureB64] = parts

  const header = JSON.parse(base64UrlDecode(headerB64).toString('utf8'))
  const payload = JSON.parse(base64UrlDecode(payloadB64).toString('utf8'))

  if (header.alg !== 'RS256') throw new Error('Unexpected token algorithm')

  const certs = await getGoogleCerts()
  const cert = certs[header.kid]
  if (!cert) throw new Error('Unknown token key id')

  const verifier = crypto.createVerify('RSA-SHA256')
  verifier.update(`${headerB64}.${payloadB64}`)
  verifier.end()
  if (!verifier.verify(cert, base64UrlDecode(signatureB64))) {
    throw new Error('Invalid token signature')
  }

  const now = Math.floor(Date.now() / 1000)
  if (payload.exp <= now) throw new Error('Token expired')
  if (payload.iat > now + 60) throw new Error('Token issued in the future')
  if (payload.aud !== projectId) throw new Error('Token audience mismatch')
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) throw new Error('Token issuer mismatch')
  if (!payload.sub) throw new Error('Token missing subject')

  return payload
}
