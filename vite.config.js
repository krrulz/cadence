import fs from 'node:fs'
import path from 'node:path'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Runs the Vercel serverless functions in `api/` during `npm run dev`.
 *
 * Vite's dev server doesn't know about `api/` — without this, /api/* 404s with an
 * empty body locally and you'd have to run `npx vercel dev` instead. In production
 * Vercel serves these files itself and this plugin isn't involved.
 */
function apiDevServer(env) {
  return {
    name: 'api-dev-server',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next()

        const route = req.url.split('?')[0].slice('/api/'.length)
        // Only route to real top-level handlers; `_`-prefixed files are helpers.
        if (!route || route.includes('/') || route.startsWith('_')) return next()

        const file = path.resolve(process.cwd(), 'api', `${route}.js`)
        if (!fs.existsSync(file)) return next()

        // Vercel injects .env.local into the function's process.env. Vite only puts
        // VITE_* on import.meta.env, so pass the server-side vars through here.
        // This runs in the dev server only — it never reaches the client bundle.
        for (const [key, value] of Object.entries(env)) {
          if (!key.startsWith('VITE_') && process.env[key] === undefined) {
            process.env[key] = value
          }
        }

        try {
          let raw = ''
          for await (const chunk of req) raw += chunk
          try {
            req.body = raw ? JSON.parse(raw) : {}
          } catch {
            req.body = {}
          }

          // Shim the Express-style response helpers Vercel handlers expect.
          res.status = (code) => {
            res.statusCode = code
            return res
          }
          res.json = (payload) => {
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(payload))
            return res
          }

          const mod = await server.ssrLoadModule(file)
          await mod.default(req, res)
        } catch (err) {
          server.config.logger.error(`[api-dev-server] ${route}: ${err.stack || err.message}`)
          if (!res.writableEnded) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: `Dev handler crashed: ${err.message}` }))
          }
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  // '' prefix = load every var, not just VITE_*, so the dev API server can see
  // CF_ACCOUNT_ID etc. These are only handed to the middleware above.
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), apiDevServer(env)],
  }
})
