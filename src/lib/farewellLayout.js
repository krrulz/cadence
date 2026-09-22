// Column-based masonry layout for the farewell wall collage (like a
// Pinterest board, not a spreadsheet grid). The canvas is split into a
// handful of columns of varying width; each wish is dropped into whichever
// of the two shortest columns has room (classic masonry bin-packing), sized
// mostly by its own word count — longer messages stack MUCH taller, not
// wider. Each column is then independently stretched to fill the canvas
// height exactly, so there's no leftover blank band the way a shared-row
// layout leaves when most notes in a row are short. Because columns grow
// independently (not in lockstep rows), and each gets its own fill-scale,
// neighboring notes end up genuinely different sizes and vertical
// alignments — not just shuffled placement within a shared grid. Still a
// real packing (not random-placement retry), so it's overlap-free by
// construction — verified in tests. Pure/DOM-free; the canvas renderer does
// the real text wrapping with actual font metrics and clips (with an
// ellipsis) in the rare case a message still doesn't fit its box.

const FONT_FAMILIES = [
  "'Caveat', cursive",
  "'Kalam', cursive",
  "'Patrick Hand', cursive",
  "'Shadows Into Light', cursive",
  "'Gochi Hand', cursive",
  "'Architects Daughter', cursive",
]

export const WORD_LIMIT = 20

// Number of decorative "word art" treatments the renderer cycles through
// (see FarewellAdmin.jsx's drawStyledLine) — kept here so the layout and the
// renderer agree on the range without duplicating the number.
export const WORDART_STYLE_COUNT = 5

// How much a column's boxes may grow (uniformly, preserving each box's own
// shape) to stretch that column to fill the canvas height exactly. Also
// used to size the rotation-safety gap, since a box can end up this much
// bigger than its pre-stretch size.
const COLUMN_GROWTH_CAP = 2.2

export function wordCount(text) {
  return (text || '').trim().split(/\s+/).filter(Boolean).length
}

export function truncateToWords(text, limit = WORD_LIMIT) {
  const words = (text || '').trim().split(/\s+/).filter(Boolean)
  if (words.length <= limit) return (text || '').trim()
  return words.slice(0, limit).join(' ')
}

// Small deterministic PRNG so a given seed always reproduces the same
// layout — "Regenerate" in the admin UI just picks a new seed.
function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n))
}

// Rough characters-per-line estimate for a given font size, used only to
// guess how many lines a message needs before real text wrapping happens in
// the canvas — deliberately conservative (assumes wide characters) so the
// real wrap very rarely needs more lines than this predicted.
function estimateLines(message, boxW, fontSize) {
  const charsPerLine = Math.max(6, Math.floor(boxW / (fontSize * 0.58)))
  const words = (message || '').trim().split(/\s+/).filter(Boolean)
  let lines = 1
  let lineLen = 0
  for (const w of words) {
    const add = (lineLen === 0 ? 0 : 1) + w.length
    if (lineLen + add > charsPerLine) {
      lines++
      lineLen = w.length
    } else {
      lineLen += add
    }
  }
  return Math.max(1, lines)
}

// Largest font size (within [minFont, maxFont]) whose estimated wrapped
// text fits inside a `boxW` x `boxH` box. `text` is the message with the
// signature already appended (e.g. "...take care! — Priya Nair") — the name
// flows inline at the end rather than reserving a separate line for it.
function fitFontSize(text, boxW, boxH, { lineH, maxFont, minFont }) {
  for (let f = maxFont; f >= minFont; f -= 1) {
    const lines = estimateLines(text, boxW, f)
    if (lines * f * lineH <= boxH) return f
  }
  return minFont
}

/**
 * Compute a column-masonry, non-overlapping layout for a list of wishes
 * onto a `width` x `height` pixel canvas.
 *
 * @param {Array<{id:string, name:string, message:string}>} wishes
 * @param {{width:number, height:number, seed?:number, margin?:number}} opts
 * @returns {Array<{id,name,message,x,y,w,h,rotation,fontMsg,fontName,lineH,fontFamily,inkVariant}>}
 */
export function computeFarewellLayout(wishes, { width, height, seed = 1, margin = 0.02 }) {
  if (!wishes.length) return []
  const rng = mulberry32(seed)

  const marginPx = Math.round(Math.min(width, height) * margin)
  const innerW = width - marginPx * 2
  const innerH = height - marginPx * 2

  const order = [...wishes].sort(() => rng() - 0.5)

  // Column count from note count + canvas shape — few notes get few (wide)
  // columns; many notes get more (narrower) columns.
  const numCols = clamp(Math.round(Math.sqrt(order.length * (innerW / innerH) * 0.55)), 2, 9)

  // Asymmetric column widths (not a uniform grid): random relative weights,
  // normalized so columns + gaps exactly fill innerW once `gap` is known.
  const maxRotationDeg = 6
  const sinMaxTheta = Math.sin(((maxRotationDeg / 2) * Math.PI) / 180)
  const colWeights = Array.from({ length: numCols }, () => 0.72 + rng() * 0.7)
  const weightSum = colWeights.reduce((s, w) => s + w, 0)

  // Per-note shape: word count drives HEIGHT (length), not width — a short
  // wish is compact, a 20-word wish stacks much taller in its column. A
  // random jitter on both keeps notes with equal word counts from looking
  // identical.
  const specs = order.map((wish) => {
    const words = clamp(wordCount(wish.message), 1, WORD_LIMIT)
    const t = words / WORD_LIMIT
    const heightWeight = (0.55 + 1.5 * t) * (0.85 + rng() * 0.4) // ~0.47x .. ~2.6x of the base unit
    const widthFrac = 0.62 + rng() * 0.3 // fraction of its column's width, 0.62..0.92
    return { wish, heightWeight, widthFrac }
  })
  const totalHeightWeight = specs.reduce((s, x) => s + x.heightWeight, 0)
  // Natural (pre-stretch) height unit: sized so that, spread over `numCols`
  // columns, a column's natural content height is in the right ballpark
  // before the exact per-column stretch-to-fit corrects it precisely.
  const heightUnit = (innerH * numCols) / totalHeightWeight

  // The gap must be big enough that a rotated corner can never reach a
  // neighbor, even after a column stretches a box by up to
  // COLUMN_GROWTH_CAP. Size it off the largest box plausible (max column
  // width x max natural height x growth cap), not a flat canvas fraction —
  // a handful of big notes need far more breathing room than fifty small
  // ones.
  const maxColWidth = (Math.max(...colWeights) / weightSum) * innerW
  const maxNaturalH = Math.max(...specs.map((s) => s.heightWeight)) * heightUnit
  const maxBoxSpan = (maxColWidth + maxNaturalH) * COLUMN_GROWTH_CAP
  const gap = Math.max(6, Math.round(Math.min(innerW, innerH) * 0.012), Math.round(0.5 * maxBoxSpan * sinMaxTheta * 1.5))

  const colWidths = colWeights.map((w) => (w / weightSum) * (innerW - (numCols - 1) * gap))
  const colX = []
  {
    let x = 0
    for (const w of colWidths) {
      colX.push(x)
      x += w + gap
    }
  }

  // Masonry placement: each note goes into the currently shortest column —
  // the standard, safe masonry heuristic. It keeps columns from running
  // away in height (which would otherwise force an unsafe shrink later);
  // asymmetry still comes from the column-width variance, per-note size
  // jitter, per-column stretch, horizontal jitter and rotation below.
  const colCursorY = new Array(numCols).fill(0)
  const colItems = Array.from({ length: numCols }, () => [])

  for (const { wish, heightWeight, widthFrac } of specs) {
    let col = 0
    for (let i = 1; i < numCols; i++) {
      if (colCursorY[i] < colCursorY[col]) col = i
    }

    const h = heightWeight * heightUnit
    const w = colWidths[col] * widthFrac
    const slackX = colWidths[col] - w
    const x = colX[col] + slackX / 2 + (rng() - 0.5) * slackX * 0.6
    const y = colCursorY[col]

    colItems[col].push({ wish, x, y, w, h })
    colCursorY[col] = y + h + gap
  }

  // Stretch each column independently to fill the canvas height exactly —
  // this is what eliminates leftover blank space at the bottom of a light
  // column, and (since columns fill by different amounts naturally) gives
  // each column its own scale, so notes in different columns end up
  // genuinely different sizes rather than uniformly grid-scaled.
  const placed = []
  for (let c = 0; c < numCols; c++) {
    const items = colItems[c]
    if (!items.length) continue
    const contentH = colCursorY[c] - gap
    // Uniformly scaling y/h/gap together by the same factor preserves the
    // no-overlap invariant whether it grows or shrinks a column (a smaller
    // box needs proportionally less rotation clearance too) — so shrinking
    // is safe; only the upper bound matters, capping how far a column can
    // grow beyond what the rotation-safety gap was sized for.
    const scale = contentH > 0 ? clamp(innerH / contentH, 0.15, COLUMN_GROWTH_CAP) : 1
    for (const it of items) {
      placed.push({ wish: it.wish, x: it.x, y: it.y * scale, w: it.w, h: it.h * scale })
    }
  }

  return placed.map((p) => {
    const w = p.w
    const h = p.h
    let x = marginPx + p.x
    let y = marginPx + p.y
    const rotation = (rng() - 0.5) * maxRotationDeg
    const lineH = 1.24

    // Belt-and-braces: pull any box whose rotated corners would poke past
    // the canvas edge back in. Safe — every neighbor is already a full
    // `gap` away, so nudging one box toward canvas-center only increases
    // its distance from the others, never decreases it below `gap`.
    const rad = (rotation * Math.PI) / 180
    const halfExtentX = (w / 2) * Math.abs(Math.cos(rad)) + (h / 2) * Math.abs(Math.sin(rad))
    const halfExtentY = (w / 2) * Math.abs(Math.sin(rad)) + (h / 2) * Math.abs(Math.cos(rad))
    const cx = clamp(x + w / 2, halfExtentX, width - halfExtentX)
    const cy = clamp(y + h / 2, halfExtentY, height - halfExtentY)
    x = cx - w / 2
    y = cy - h / 2

    const signedText = `${p.wish.message} — ${p.wish.name}`
    const fontMsg = fitFontSize(signedText, w * 0.92, h * 0.9, {
      lineH,
      maxFont: clamp(Math.round(h * 0.16), 12, 44),
      minFont: 10,
    })
    const fontFamily = FONT_FAMILIES[Math.floor(rng() * FONT_FAMILIES.length)]
    const inkVariant = Math.floor(rng() * 2)
    // Which decorative "word art" treatment the renderer gives this note's
    // message (outline, gradient fill, 3D echo, marker highlight, ...) — a
    // different one per note is what makes the wall read as lively/varied
    // rather than a page of uniform handwriting.
    const wordArtStyle = Math.floor(rng() * WORDART_STYLE_COUNT)

    return {
      id: p.wish.id,
      name: p.wish.name,
      message: p.wish.message,
      // The name appended inline at the end, e.g. "...take care! — Priya
      // Nair" — the renderer wraps and draws this as one continuous block
      // rather than putting the name on its own line.
      signedText,
      x,
      y,
      w,
      h,
      rotation,
      fontMsg,
      lineH,
      fontFamily,
      inkVariant,
      wordArtStyle,
    }
  })
}
