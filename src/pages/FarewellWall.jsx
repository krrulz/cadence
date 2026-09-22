import { useEffect, useMemo, useState } from 'react'
import bgAurora from '../assets/farewell/bg-aurora.svg'
import bgConfetti from '../assets/farewell/bg-confetti.svg'
import bgConstellation from '../assets/farewell/bg-constellation.svg'
import bgJourney from '../assets/farewell/bg-journey.svg'
import bgBotanical from '../assets/farewell/bg-botanical.svg'
import { wordCount, truncateToWords, WORD_LIMIT } from '../lib/farewellLayout.js'

// Public, no-login send-off wall. A colleague picks a background, writes a
// short wish, and can preview only their own card — the page never reads
// Firestore directly, every call goes through api/farewell.js (Admin SDK,
// passcode-gated), so there is no path for a submitter to see anyone else's
// message. Editable up until the admin closes the activity.

export const FAREWELL_BACKGROUNDS = [
  { id: 'aurora', label: 'Aurora Flow', src: bgAurora, dark: true },
  { id: 'confetti', label: 'Confetti Celebration', src: bgConfetti, dark: false },
  { id: 'constellation', label: 'Constellation Journey', src: bgConstellation, dark: true },
  { id: 'journey', label: 'Paper Plane Journey', src: bgJourney, dark: false },
  { id: 'botanical', label: 'Botanical Wreath', src: bgBotanical, dark: false },
]

const HANDWRITING_FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Caveat:wght@600&family=Kalam:wght@400;700&family=Patrick+Hand&family=Shadows+Into+Light&family=Gochi+Hand&family=Architects+Daughter&display=swap'

function useGoogleFonts() {
  useEffect(() => {
    if (document.querySelector(`link[href="${HANDWRITING_FONTS_HREF}"]`)) return
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = HANDWRITING_FONTS_HREF
    document.head.appendChild(link)
  }, [])
}

function getToken() {
  let token = localStorage.getItem('farewellToken')
  if (!token) {
    token = (crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/-/g, '')
    localStorage.setItem('farewellToken', token)
  }
  return token
}

export default function FarewellWall() {
  useGoogleFonts()
  const [step, setStep] = useState('passcode') // passcode | closed | form | done
  const [passcode, setPasscode] = useState('')
  const [passcodeError, setPasscodeError] = useState('')
  const [checking, setChecking] = useState(false)
  const [honoreeName, setHonoreeName] = useState('')

  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const [backgroundId, setBackgroundId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const words = wordCount(message)
  const overLimit = words > WORD_LIMIT
  const background = FAREWELL_BACKGROUNDS.find((b) => b.id === backgroundId)

  async function checkPasscode(e) {
    e.preventDefault()
    setPasscodeError('')
    setChecking(true)
    try {
      const token = getToken()
      const res = await fetch(`/api/farewell?passcode=${encodeURIComponent(passcode)}&token=${token}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not verify passcode.')
      setHonoreeName(data.honoreeName || '')
      if (data.mySubmission) {
        setName(data.mySubmission.name || '')
        setMessage(data.mySubmission.message || '')
        setBackgroundId(data.mySubmission.backgroundId || '')
      }
      setStep(data.isOpen ? 'form' : 'closed')
    } catch (err) {
      setPasscodeError(err.message)
    } finally {
      setChecking(false)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitError('')
    if (!name.trim()) return setSubmitError('Please add your name.')
    if (!message.trim()) return setSubmitError('Please write a wish.')
    if (overLimit) return setSubmitError(`Please keep your message to ${WORD_LIMIT} words or fewer.`)
    if (!backgroundId) return setSubmitError('Pick a background you’d like your wish to appear on.')
    setSubmitting(true)
    try {
      const res = await fetch('/api/farewell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode, token: getToken(), name: name.trim(), message: message.trim(), backgroundId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not submit.')
      setStep('done')
    } catch (err) {
      setSubmitError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-surface px-4 py-10">
      <div
        className="animate-floaty pointer-events-none fixed -left-16 top-[8%] h-72 w-72 rounded-full blur-3xl"
        style={{ background: 'rgba(104, 70, 198, 0.22)' }}
        aria-hidden="true"
      />
      <div
        className="animate-floaty-slow pointer-events-none fixed -right-20 bottom-[8%] h-80 w-80 rounded-full blur-3xl"
        style={{ background: 'rgba(56, 96, 190, 0.22)' }}
        aria-hidden="true"
      />

      <div className="relative mx-auto w-full max-w-3xl">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">Send-off Wall</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {honoreeName ? `A few words for ${honoreeName}.` : 'A few words for a departing teammate.'}
          </p>
        </div>

        {step === 'passcode' && (
          <div className="mx-auto max-w-sm rounded-2xl border border-surface-border bg-surface-2/85 p-6 shadow-2xl backdrop-blur-xl sm:p-8">
            <p className="mb-4 text-center text-sm text-ink-muted">Enter the access code you were given.</p>
            <form onSubmit={checkPasscode} className="space-y-4">
              <input
                type="password"
                required
                autoFocus
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="Access code"
                className="input text-center"
              />
              {passcodeError && <p className="text-center text-sm text-rose-400">{passcodeError}</p>}
              <button type="submit" disabled={checking} className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60" style={{ background: 'linear-gradient(135deg,#6846C6,#3860BE)' }}>
                {checking ? 'Checking…' : 'Continue'}
              </button>
            </form>
          </div>
        )}

        {step === 'closed' && (
          <div className="mx-auto max-w-sm rounded-2xl border border-surface-border bg-surface-2/85 p-6 text-center shadow-2xl backdrop-blur-xl sm:p-8">
            <p className="text-xl font-bold text-ink">This has closed</p>
            <p className="mt-2 text-sm text-ink-muted">The send-off wall is no longer accepting new wishes. Thanks for stopping by!</p>
          </div>
        )}

        {step === 'form' && (
          <div className="space-y-4">
            <form onSubmit={handleSubmit} className="card space-y-4">
              <label className="block text-sm">
                <span className="font-medium text-ink">Your name</span>
                <input value={name} onChange={(e) => setName(e.target.value)} className="input mt-1" placeholder="e.g. Priya Nair" required />
              </label>

              <label className="block text-sm">
                <span className="flex items-baseline justify-between font-medium text-ink">
                  <span>Your wish</span>
                  <span className={overLimit ? 'text-rose-400' : 'text-ink-faint'}>{words}/{WORD_LIMIT} words</span>
                </span>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={4}
                  className="input mt-1"
                  placeholder="Wishing you every success in your next chapter..."
                  required
                />
                {overLimit && (
                  <button
                    type="button"
                    onClick={() => setMessage(truncateToWords(message))}
                    className="mt-1 text-xs text-mint hover:underline"
                  >
                    Trim to {WORD_LIMIT} words
                  </button>
                )}
              </label>

              <div>
                <span className="mb-2 block text-sm font-medium text-ink">Choose a background</span>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {FAREWELL_BACKGROUNDS.map((bg) => (
                    <button
                      key={bg.id}
                      type="button"
                      onClick={() => setBackgroundId(bg.id)}
                      className={`overflow-hidden rounded-xl border-2 text-left transition-colors ${
                        backgroundId === bg.id ? 'border-mint' : 'border-transparent hover:border-white/20'
                      }`}
                    >
                      <img src={bg.src} alt={bg.label} className="aspect-[3/2] w-full object-cover" />
                      <p className="bg-white/5 px-2 py-1.5 text-xs font-medium text-ink-muted">{bg.label}</p>
                    </button>
                  ))}
                </div>
              </div>

              {submitError && <p className="text-sm text-rose-400">{submitError}</p>}

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg,#6846C6,#3860BE)' }}
              >
                {submitting ? 'Submitting…' : 'Submit my wish'}
              </button>
              <p className="text-center text-xs text-ink-faint">
                Only you can see this preview — nobody else's wishes are shown here.
              </p>
            </form>

            {(name.trim() || message.trim()) && background && (
              <WishPreview name={name} message={message} background={background} />
            )}
          </div>
        )}

        {step === 'done' && (
          <div className="mx-auto max-w-sm rounded-2xl border border-surface-border bg-surface-2/85 p-6 text-center shadow-2xl backdrop-blur-xl sm:p-8">
            <p className="text-xl font-bold text-ink">✓ Thank you!</p>
            <p className="mt-2 text-sm text-ink-muted">Your wish has been added to the send-off wall.</p>
            <button type="button" onClick={() => setStep('form')} className="btn-secondary mt-5 w-full">
              Edit my wish
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function WishPreview({ name, message, background }) {
  const fonts = useMemo(
    () => ["'Caveat', cursive", "'Kalam', cursive", "'Patrick Hand', cursive", "'Shadows Into Light', cursive", "'Gochi Hand', cursive"],
    [],
  )
  const font = useMemo(() => fonts[Math.abs(hashCode(name || 'x')) % fonts.length], [fonts, name])
  const textColor = background.dark ? '#FFFFFF' : '#0C0814'

  return (
    <div>
      <p className="mb-2 text-center text-xs font-medium uppercase tracking-wide text-ink-faint">Preview of your card</p>
      <div
        className="relative mx-auto aspect-[3/2] w-full max-w-md overflow-hidden rounded-xl shadow-xl"
        style={{ backgroundImage: `url(${background.src})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
      >
        <div className="absolute inset-0 flex items-center justify-center p-8">
          <div
            className="max-w-full rounded-lg px-5 py-4 text-center"
            style={{ background: background.dark ? 'rgba(12,8,20,0.35)' : 'rgba(255,255,255,0.55)', backdropFilter: 'blur(2px)' }}
          >
            <p style={{ fontFamily: font, color: textColor, fontSize: '1.6rem', lineHeight: 1.25 }}>
              {message || 'Your wish will appear here...'}
            </p>
            <p className="mt-2 text-sm font-semibold" style={{ color: textColor, opacity: 0.85 }}>
              — {name || 'Your name'}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function hashCode(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h << 5) - h + str.charCodeAt(i)
  return h
}
