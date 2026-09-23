// Client-side PPTX text extraction. A .pptx is just a zip of XML files
// (Office Open XML) — we don't need a full presentation library to pull out
// the visible text, only JSZip and a couple of regexes over each slide's
// <a:tbl>/<a:p>/<a:t> structure.
//
// The monthly resource-update decks are laid out as tables: each table's
// first row holds one resource name per column, and the row(s) below hold
// that resource's bullet points in the matching column (one <a:p> per
// bullet) — a slide can contain several such tables side by side. That
// layout fully determines which bullets belong to which person, so it's
// parsed deterministically here rather than left for an AI to guess from
// flattened text (which merges everyone's bullets together and loses the
// name association entirely).

import JSZip from 'jszip'

// Slides are stored as ppt/slides/slideN.xml, but N is a file-naming index,
// not necessarily the on-screen order — the real order lives in
// ppt/presentation.xml (sldIdLst, referencing rIds) resolved through
// ppt/_rels/presentation.xml.rels. We reproduce that resolution so slide
// text comes back in the order a viewer would see it.
async function resolveSlideOrder(zip) {
  const presentationXml = await zip.file('ppt/presentation.xml')?.async('string')
  const relsXml = await zip.file('ppt/_rels/presentation.xml.rels')?.async('string')
  if (!presentationXml || !relsXml) return null

  const rIds = [...presentationXml.matchAll(/<p:sldId[^>]*r:id="(rId\d+)"/g)].map((m) => m[1])
  // Targets in presentation.xml.rels are relative to the `ppt/` folder (the
  // parent of `ppt/_rels/`), e.g. "slides/slide1.xml" — not the zip root.
  const relMap = new Map(
    [...relsXml.matchAll(/<Relationship[^>]*Id="(rId\d+)"[^>]*Target="([^"]*slides\/slide\d+\.xml)"/g)].map((m) => [
      m[1],
      `ppt/${m[2].replace(/^\.?\//, '')}`,
    ]),
  )
  const ordered = rIds.map((id) => relMap.get(id)).filter(Boolean)
  return ordered.length ? ordered : null
}

function decodeXmlEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#8217;/g, '’')
    .replace(/&#8211;/g, '–')
    .replace(/&#8212;/g, '—')
    .replace(/&#8203;/g, '')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
}

function textOfParagraph(pXml) {
  return decodeXmlEntities([...pXml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]).join('')).trim()
}

function extractTextFromSlideXml(xml) {
  // Text runs live in <a:t>...</a:t>; paragraphs are <a:p>. Insert a
  // newline between paragraphs so bullet structure survives as line breaks,
  // rather than one run-on string.
  const paragraphs = xml.split(/<a:p[ >]/).slice(1)
  const lines = paragraphs.map((p) => textOfParagraph(p)).filter(Boolean)
  return lines.join('\n')
}

// --- Table-aware extraction ------------------------------------------

function extractTables(xml) {
  return [...xml.matchAll(/<a:tbl>[\s\S]*?<\/a:tbl>/g)].map((m) => m[0])
}

// One row per <a:tr>, one cell per <a:tc>, one bullet per <a:p> within a
// cell. Merged cells (hMerge/vMerge) carry no text of their own — treated
// as empty so columns stay aligned rather than shifting.
function parseTableGrid(tblXml) {
  const rows = [...tblXml.matchAll(/<a:tr[ >][\s\S]*?<\/a:tr>/g)].map((m) => m[0])
  return rows.map((row) => {
    const cells = [...row.matchAll(/<a:tc[ >][\s\S]*?<\/a:tc>/g)].map((m) => m[0])
    return cells.map((cell) => {
      if (/hMerge="1"|vMerge="1"/.test(cell.slice(0, cell.indexOf('>') + 1))) return []
      const paras = [...cell.matchAll(/<a:p>[\s\S]*?<\/a:p>/g)].map((m) => m[0])
      return paras.map((p) => textOfParagraph(p)).filter(Boolean)
    })
  })
}

// A table's first row is the resource names (one per column); every row
// below contributes that column's bullets. Returns one entry per non-empty
// column.
function resourcesFromTable(tblXml) {
  const grid = parseTableGrid(tblXml)
  if (grid.length < 2) return []
  const nameRow = grid[0]
  const numCols = nameRow.length
  const resources = []
  for (let col = 0; col < numCols; col++) {
    const name = (nameRow[col] || []).join('').trim()
    if (!name) continue
    const bullets = []
    for (let row = 1; row < grid.length; row++) {
      const cellParas = grid[row][col] || []
      bullets.push(...cellParas)
    }
    resources.push({ name, bullets })
  }
  return resources
}

// The squad/team name lives in whatever text sits outside the tables,
// usually paired with a "Monthly Update" label — either as one run
// ("Monthly Update – QA Daily Banking") or as a separate run next to it
// ("Mobile" + "Monthly Update"). Best-effort; an empty squad is fine.
function squadFromNonTableText(xml) {
  const withoutTables = xml.replace(/<a:tbl>[\s\S]*?<\/a:tbl>/g, '')
  const paragraphs = withoutTables.split(/<a:p[ >]/).slice(1)
  const texts = paragraphs.map((p) => textOfParagraph(p)).filter(Boolean)

  const clean = texts.filter((t) => !/expleo/i.test(t) && !/^\d+$/.test(t.trim()) && t.trim().toUpperCase() !== 'CCEI')
  const muIdx = clean.findIndex((t) => /monthly update/i.test(t))
  if (muIdx === -1) return ''

  const muText = clean[muIdx]
  const dashParts = muText
    .split(/[–—-]/)
    .map((s) => s.trim())
    .filter((s) => s && !/monthly update/i.test(s))
  if (dashParts.length) return dashParts.join(' - ')

  // Squad name and "Monthly Update" can share one run, e.g. "Mobile Monthly
  // Update" — strip the label out rather than expecting a separate run.
  const stripped = muText.replace(/monthly update/i, '').trim()
  if (stripped) return stripped

  const others = clean.filter((t, i) => i !== muIdx && t.trim().toLowerCase() !== 'monthly update')
  return others.join(' ').trim()
}

// Deterministic bullet -> {label, description} split: a bullet with a
// natural "Topic: detail" shape (short phrase before a colon) splits there;
// otherwise the first few words become the label and the full bullet is
// kept as the description.
export function bulletToItem(bullet) {
  const text = bullet.trim()
  const colonIdx = text.indexOf(':')
  if (colonIdx > 0 && colonIdx <= 40) {
    const label = text.slice(0, colonIdx).trim()
    const description = text.slice(colonIdx + 1).trim()
    if (label && description) return { label, description }
  }
  const words = text.split(/\s+/)
  const label = words.slice(0, 5).join(' ') + (words.length > 5 ? '…' : '')
  return { label, description: text }
}

/**
 * Extract per-resource updates from an uploaded monthly resource-update
 * .pptx, using each slide's table structure to associate bullets with the
 * correct person.
 * @param {File|Blob|ArrayBuffer} file
 * @returns {Promise<Array<{name:string, squad:string, items:Array<{label:string, description:string}>}>>}
 */
export async function extractPptxResourceUpdates(file) {
  const zip = await JSZip.loadAsync(file)
  const paths = await resolveSlidePaths(zip)

  const results = []
  for (const path of paths) {
    const entry = zip.file(path)
    if (!entry) continue
    const xml = await entry.async('string')
    const squad = squadFromNonTableText(xml)
    for (const tblXml of extractTables(xml)) {
      for (const { name, bullets } of resourcesFromTable(tblXml)) {
        const items = bullets.map(bulletToItem)
        if (items.length) results.push({ name, squad, items })
      }
    }
  }
  return results
}

async function resolveSlidePaths(zip) {
  const slidePaths = await resolveSlideOrder(zip)
  return (
    slidePaths ||
    Object.keys(zip.files)
      .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
      .sort((a, b) => Number(a.match(/slide(\d+)\.xml/)[1]) - Number(b.match(/slide(\d+)\.xml/)[1]))
  )
}

/**
 * Extract per-slide visible text from an uploaded .pptx file (flattened,
 * loses table column structure — kept for callers that just need raw text).
 * @param {File|Blob|ArrayBuffer} file
 * @returns {Promise<Array<{index:number, text:string}>>} one entry per
 *   slide, in on-screen order, skipping slides with no text at all.
 */
export async function extractPptxSlideText(file) {
  const zip = await JSZip.loadAsync(file)
  const paths = await resolveSlidePaths(zip)

  const slides = []
  for (let i = 0; i < paths.length; i++) {
    const entry = zip.file(paths[i])
    if (!entry) continue
    const xml = await entry.async('string')
    const text = extractTextFromSlideXml(xml)
    if (text) slides.push({ index: i, text })
  }
  return slides
}
