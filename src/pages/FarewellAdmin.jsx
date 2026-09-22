import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Layout from '../components/Layout.jsx'
import LoadingSpinner from '../components/LoadingSpinner.jsx'
import Section from '../components/Section.jsx'
import { useAuth } from '../contexts/AuthContext.jsx'
import { getAllRecords, getDocById, setRecordById, updateRecord, deleteRecord } from '../lib/firestoreHelpers.js'
import { computeFarewellLayout, wordCount, WORDART_STYLE_COUNT } from '../lib/farewellLayout.js'
import { FAREWELL_BACKGROUNDS } from './FarewellWall.jsx'

const HONOREE_NAME = 'Ragunathan Palanisamy'

const HANDWRITING_FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Caveat:wght@600&family=Kalam:wght@400;700&family=Patrick+Hand&family=Shadows+Into+Light&family=Gochi+Hand&family=Architects+Daughter&display=swap'
const FONT_LOAD_SPECS = [
  '600 40px Caveat',
  '700 40px Kalam',
  '400 40px "Patrick Hand"',
  '400 40px "Shadows Into Light"',
  '400 40px "Gochi Hand"',
  '400 40px "Architects Daughter"',
]

function useGoogleFonts() {
  useEffect(() => {
    if (document.querySelector(`link[href="${HANDWRITING_FONTS_HREF}"]`)) return
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = HANDWRITING_FONTS_HREF
    document.head.appendChild(link)
  }, [])
}

async function waitForFonts() {
  if (!document.fonts) return
  try {
    await Promise.all(FONT_LOAD_SPECS.map((spec) => document.fonts.load(spec)))
    await document.fonts.ready
  } catch {
    // best-effort — canvas falls back to a system font if a face never loads
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

// Draw `img` into the rect (x,y,w,h) the way CSS `background-size: cover` would.
function drawCover(ctx, img, x, y, w, h) {
  const imgRatio = img.width / img.height
  const boxRatio = w / h
  let sx, sy, sw, sh
  if (imgRatio > boxRatio) {
    sh = img.height
    sw = sh * boxRatio
    sx = (img.width - sw) / 2
    sy = 0
  } else {
    sw = img.width
    sh = sw / boxRatio
    sx = 0
    sy = (img.height - sh) / 2
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h)
}

function wrapLines(ctx, text, maxWidth) {
  const words = (text || '').split(/\s+/).filter(Boolean)
  const lines = []
  let line = ''
  for (const word of words) {
    const test = line ? `${line} ${word}` : word
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line)
      line = word
    } else {
      line = test
    }
  }
  if (line) lines.push(line)
  return lines
}

// Ink palettes per background mode + a small per-note variant for texture —
// text is written directly onto the background (no card behind it), so
// contrast is what carries legibility: a soft shadow does the rest. The
// accent pair doubles as each style's "pop" color (outline, gradient end,
// echo, highlight) — reusing the name colors keeps every note's palette
// internally consistent.
const INK = {
  dark: { message: ['#FFFFFF', '#F4ECFF'], name: ['#CFC2FF', '#BEE0FF'] },
  light: { message: ['#0C0814', '#241857'], name: ['#6846C6', '#3860BE'] },
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

// Five decorative "word art" treatments for one line of message text, so
// neighboring notes on the wall don't all read as the same flat handwriting.
// 0 classic (plain fill), 1 outline pop, 2 gradient fill, 3 3D echo,
// 4 marker highlight. The name/signature line always stays plain (style 0)
// for quick scanning, regardless of the message's style.
function drawStyledLine(ctx, line, x, y, fontSizePx, style, ink, accent) {
  switch (style % WORDART_STYLE_COUNT) {
    case 1: {
      ctx.lineJoin = 'round'
      ctx.miterLimit = 2
      ctx.strokeStyle = accent
      ctx.lineWidth = Math.max(1.5, fontSizePx * 0.075)
      ctx.strokeText(line, x, y)
      ctx.fillStyle = ink
      ctx.fillText(line, x, y)
      return
    }
    case 2: {
      const w = ctx.measureText(line).width
      const grad = ctx.createLinearGradient(x, 0, x + Math.max(1, w), 0)
      grad.addColorStop(0, ink)
      grad.addColorStop(1, accent)
      ctx.fillStyle = grad
      ctx.fillText(line, x, y)
      return
    }
    case 3: {
      const off = Math.max(1.5, fontSizePx * 0.07)
      ctx.fillStyle = accent
      ctx.fillText(line, x + off, y + off)
      ctx.fillStyle = ink
      ctx.fillText(line, x, y)
      return
    }
    case 4: {
      const w = ctx.measureText(line).width
      ctx.save()
      ctx.globalAlpha = 0.3
      ctx.fillStyle = accent
      roundRectPath(ctx, x - fontSizePx * 0.08, y - fontSizePx * 0.78, w + fontSizePx * 0.16, fontSizePx * 0.94, fontSizePx * 0.12)
      ctx.fill()
      ctx.restore()
      ctx.fillStyle = ink
      ctx.fillText(line, x, y)
      return
    }
    default: {
      ctx.fillStyle = ink
      ctx.fillText(line, x, y)
    }
  }
}

function wrapLinesClamped(ctx, text, maxWidth, maxLines) {
  const lines = wrapLines(ctx, text, maxWidth)
  if (lines.length <= maxLines) return lines
  const clamped = lines.slice(0, maxLines)
  let last = clamped[maxLines - 1]
  while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) {
    last = last.slice(0, -1)
  }
  clamped[maxLines - 1] = `${last}…`
  return clamped
}

const HEADER_FRACTION = 0.13

async function renderCollage(canvas, { wishes, background, seed, width, height }) {
  const ctx = canvas.getContext('2d')
  canvas.width = width
  canvas.height = height

  await waitForFonts()

  const bgImg = await loadImage(background.src)
  drawCover(ctx, bgImg, 0, 0, width, height)

  const headerH = Math.round(height * HEADER_FRACTION)
  const titleColor = background.dark ? '#FFFFFF' : '#0C0814'

  // Soft scrim behind the header text so it reads on any background.
  const scrim = ctx.createLinearGradient(0, 0, 0, headerH * 1.3)
  scrim.addColorStop(0, background.dark ? 'rgba(12,8,20,0.55)' : 'rgba(255,255,255,0.65)')
  scrim.addColorStop(1, background.dark ? 'rgba(12,8,20,0)' : 'rgba(255,255,255,0)')
  ctx.fillStyle = scrim
  ctx.fillRect(0, 0, width, headerH * 1.3)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = titleColor
  ctx.font = `700 ${Math.round(headerH * 0.4)}px 'Architects Daughter', cursive`
  ctx.fillText(`Wishing you all the best, ${HONOREE_NAME}!`, width / 2, headerH * 0.62)
  ctx.font = `400 ${Math.round(headerH * 0.18)}px 'Patrick Hand', cursive`
  ctx.globalAlpha = 0.85
  ctx.fillText('From the whole team — we’ll miss you!', width / 2, headerH * 0.9)
  ctx.globalAlpha = 1

  const layout = computeFarewellLayout(wishes, { width, height: height - headerH, seed })
  const mode = background.dark ? 'dark' : 'light'
  const shadowColor = background.dark ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.8)'

  for (const note of layout) {
    const cx = note.x + note.w / 2
    const cy = note.y + headerH + note.h / 2
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate((note.rotation * Math.PI) / 180)
    // The outline/echo/highlight styles already carry their own sense of
    // depth — layering the soft blur shadow on top of those just looks
    // muddy, so only the classic (style 0) treatment gets it.
    const isClassic = note.wordArtStyle % WORDART_STYLE_COUNT === 0
    if (isClassic) {
      ctx.shadowColor = shadowColor
      ctx.shadowBlur = note.fontMsg * 0.3
      ctx.shadowOffsetY = note.fontMsg * 0.04
    }

    const ink = INK[mode].message[note.inkVariant]
    const accent = INK[mode].name[note.inkVariant]

    const padX = note.w * 0.04
    const padY = note.h * 0.06
    const innerW = note.w - padX * 2
    const maxLines = Math.max(1, Math.floor((note.h - padY * 2) / (note.fontMsg * note.lineH)))

    // The name is appended to the end of the message text itself (e.g.
    // "...take care! — Priya Nair") and wraps as part of the same block,
    // rather than sitting on its own line — so it just flows wherever the
    // text naturally ends.
    ctx.textAlign = 'left'
    ctx.font = `400 ${note.fontMsg}px ${note.fontFamily}`
    const lines = wrapLinesClamped(ctx, note.signedText, innerW, maxLines)
    let ly = -note.h / 2 + padY + note.fontMsg * 0.9
    for (const line of lines) {
      drawStyledLine(ctx, line, -note.w / 2 + padX, ly, note.fontMsg, note.wordArtStyle, ink, accent)
      ly += note.fontMsg * note.lineH
    }

    ctx.shadowColor = 'transparent'
    ctx.restore()
  }
}

export default function FarewellAdmin() {
  useGoogleFonts()
  const { profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [settings, setSettings] = useState(null)
  const [wishes, setWishes] = useState([])
  const [seed, setSeed] = useState(1)
  const [rendering, setRendering] = useState(false)
  const [overrideBackground, setOverrideBackground] = useState('')
  const [toggling, setToggling] = useState(false)
  const [error, setError] = useState('')
  const canvasRef = useRef(null)
  const printCanvasRef = useRef(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    const [settingsDoc, wishDocs] = await Promise.all([
      getDocById('farewellSettings', 'config'),
      getAllRecords('farewellWishes'),
    ])
    setSettings(settingsDoc)
    setWishes(wishDocs)
    setLoading(false)
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const isOpen = settings?.isOpen !== false
  const visibleWishes = useMemo(() => wishes.filter((w) => !w.hidden), [wishes])

  const tally = useMemo(() => {
    const counts = Object.fromEntries(FAREWELL_BACKGROUNDS.map((b) => [b.id, 0]))
    for (const w of visibleWishes) if (counts[w.backgroundId] !== undefined) counts[w.backgroundId]++
    return counts
  }, [visibleWishes])

  const topBackgroundId = useMemo(() => {
    let best = FAREWELL_BACKGROUNDS[0].id
    let bestCount = -1
    for (const b of FAREWELL_BACKGROUNDS) {
      if (tally[b.id] > bestCount) {
        best = b.id
        bestCount = tally[b.id]
      }
    }
    return best
  }, [tally])

  const chosenBackground = FAREWELL_BACKGROUNDS.find((b) => b.id === (overrideBackground || topBackgroundId))

  const draw = useCallback(
    async (canvas, width, height) => {
      if (!canvas || visibleWishes.length === 0 || !chosenBackground) return
      setRendering(true)
      try {
        await renderCollage(canvas, { wishes: visibleWishes, background: chosenBackground, seed, width, height })
      } finally {
        setRendering(false)
      }
    },
    [visibleWishes, chosenBackground, seed],
  )

  useEffect(() => {
    // On-screen preview at a modest resolution — full print resolution is
    // only rendered on demand into an off-screen canvas for download.
    draw(canvasRef.current, 1200, Math.round(1200 / 1.4142))
  }, [draw])

  async function handleToggle() {
    setToggling(true)
    setError('')
    try {
      await setRecordById('farewellSettings', 'config', {
        isOpen: !isOpen,
        honoreeName: HONOREE_NAME,
        ...(isOpen ? { closedAt: new Date().toISOString(), closedBy: profile?.name || '' } : { reopenedAt: new Date().toISOString() }),
      })
      await loadData()
    } catch (err) {
      setError(err.message || 'Could not update the activity state.')
    } finally {
      setToggling(false)
    }
  }

  async function handleToggleHide(wish) {
    await updateRecord('farewellWishes', wish.id, { hidden: !wish.hidden })
    loadData()
  }

  async function handleDelete(wish) {
    if (!window.confirm(`Delete ${wish.name}’s wish? This can’t be undone.`)) return
    await deleteRecord('farewellWishes', wish.id)
    loadData()
  }

  async function handleDownload() {
    const canvas = printCanvasRef.current
    // A4 landscape at 300 DPI: 297mm x 210mm.
    const width = Math.round((297 / 25.4) * 300)
    const height = Math.round((210 / 25.4) * 300)
    await draw(canvas, width, height)
    canvas.toBlob((blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `send-off-wall-${HONOREE_NAME.replace(/\s+/g, '-')}.png`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }, 'image/png')
  }

  if (loading) {
    return (
      <Layout>
        <LoadingSpinner label="Loading send-off wall…" />
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">Send-off Wall</h1>
          <p className="text-sm text-ink-muted">For {HONOREE_NAME} — manage the activity and generate the printable wall.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-xs font-medium ${isOpen ? 'bg-mint/15 text-mint' : 'bg-amber-500/15 text-amber-300'}`}>
            {isOpen ? 'Open' : 'Closed'}
          </span>
          <button type="button" onClick={handleToggle} disabled={toggling} className="btn-secondary text-sm">
            {toggling ? 'Saving…' : isOpen ? 'Close activity' : 'Reopen activity'}
          </button>
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="card">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">Submissions</p>
          <p className="mt-1 text-2xl font-bold text-ink">{visibleWishes.length}</p>
        </div>
        <div className="card">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">Hidden</p>
          <p className="mt-1 text-2xl font-bold text-ink">{wishes.length - visibleWishes.length}</p>
        </div>
        <div className="card col-span-2 sm:col-span-2">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">Top background</p>
          <p className="mt-1 text-lg font-semibold text-ink">{chosenBackground?.label}</p>
        </div>
      </div>

      <Section title="Background votes">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {FAREWELL_BACKGROUNDS.map((bg) => (
            <button
              key={bg.id}
              type="button"
              onClick={() => setOverrideBackground(bg.id)}
              className={`overflow-hidden rounded-xl border-2 text-left transition-colors ${
                (overrideBackground || topBackgroundId) === bg.id ? 'border-mint' : 'border-transparent hover:border-white/20'
              }`}
            >
              <img src={bg.src} alt={bg.label} className="aspect-[3/2] w-full object-cover" />
              <p className="bg-white/5 px-2 py-1.5 text-xs font-medium text-ink-muted">
                {bg.label}
                <span className="ml-1 text-ink-faint">· {tally[bg.id]} vote{tally[bg.id] === 1 ? '' : 's'}</span>
              </p>
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-ink-faint">
          Click any background to use it for the collage instead of the top-voted one. Currently using{' '}
          <strong className="text-ink">{chosenBackground?.label}</strong>.
        </p>
      </Section>

      <Section title="Collage preview">
        {visibleWishes.length === 0 ? (
          <p className="text-sm text-ink-faint">No submissions yet — the preview will appear once people start adding wishes.</p>
        ) : (
          <>
            <div className="overflow-hidden rounded-xl border border-surface-border">
              <canvas ref={canvasRef} className="w-full" style={{ aspectRatio: '1.4142' }} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => setSeed((s) => s + 1)} disabled={rendering} className="btn-secondary text-sm">
                {rendering ? 'Rendering…' : 'Regenerate arrangement'}
              </button>
              <button type="button" onClick={handleDownload} className="btn-primary text-sm">
                Download print-quality PNG (A4 landscape, 300 DPI)
              </button>
            </div>
          </>
        )}
        <canvas ref={printCanvasRef} className="hidden" />
      </Section>

      <Section title={`Submissions (${wishes.length})`}>
        {wishes.length === 0 ? (
          <p className="text-sm text-ink-faint">No submissions yet.</p>
        ) : (
          <div className="max-h-[420px] space-y-1.5 overflow-y-auto pr-1">
            {wishes.map((w) => (
              <div key={w.id} className={`flex items-center gap-3 rounded-lg border border-white/5 p-2 ${w.hidden ? 'opacity-50' : ''}`}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">
                    {w.name} <span className="text-xs font-normal text-ink-faint">· {wordCount(w.message)} words · {FAREWELL_BACKGROUNDS.find((b) => b.id === w.backgroundId)?.label || w.backgroundId}</span>
                  </p>
                  <p className="truncate text-xs text-ink-muted">{w.message}</p>
                </div>
                <div className="flex shrink-0 gap-3 text-xs">
                  <button type="button" onClick={() => handleToggleHide(w)} className="text-ink-muted hover:text-mint hover:underline">
                    {w.hidden ? 'Unhide' : 'Hide'}
                  </button>
                  <button type="button" onClick={() => handleDelete(w)} className="text-ink-faint hover:text-rose-400 hover:underline">
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </Layout>
  )
}
