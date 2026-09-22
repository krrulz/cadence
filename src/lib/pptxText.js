// Client-side PPTX text extraction. A .pptx is just a zip of XML files
// (Office Open XML) — we don't need a full presentation library to pull out
// the visible text, only JSZip and a regex over each slide's <a:t> runs.
// Used by the Deck Data Prep admin tab to read an uploaded monthly
// resource-update deck before sending its text to the AI extraction endpoint.

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

function extractTextFromSlideXml(xml) {
  // Text runs live in <a:t>...</a:t>; paragraphs are <a:p>. Insert a
  // newline between paragraphs so bullet structure survives as line breaks
  // for the AI to read, rather than one run-on string.
  const paragraphs = xml.split(/<a:p[ >]/).slice(1)
  const lines = paragraphs
    .map((p) => {
      const runs = [...p.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => decodeXmlEntities(m[1]))
      return runs.join('').trim()
    })
    .filter(Boolean)
  return lines.join('\n')
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

/**
 * Extract per-slide visible text from an uploaded .pptx file.
 * @param {File|Blob|ArrayBuffer} file
 * @returns {Promise<Array<{index:number, text:string}>>} one entry per
 *   slide, in on-screen order, skipping slides with no text at all.
 */
export async function extractPptxSlideText(file) {
  const zip = await JSZip.loadAsync(file)
  const slidePaths = await resolveSlideOrder(zip)
  const paths =
    slidePaths ||
    Object.keys(zip.files)
      .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
      .sort((a, b) => {
        const na = Number(a.match(/slide(\d+)\.xml/)[1])
        const nb = Number(b.match(/slide(\d+)\.xml/)[1])
        return na - nb
      })

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
