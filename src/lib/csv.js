// Minimal CSV parser — handles quoted fields (with embedded commas/quotes) without
// pulling in a dependency. Good enough for admin-authored bulk-upload files.
export function parseCsv(text) {
  const lines = text.split(/\r\n|\n|\r/).filter((l) => l.trim() !== '')
  if (lines.length === 0) return []

  function parseLine(line) {
    const cells = []
    let cur = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (inQuotes) {
        if (ch === '"') {
          if (line[i + 1] === '"') {
            cur += '"'
            i++
          } else {
            inQuotes = false
          }
        } else {
          cur += ch
        }
      } else if (ch === '"') {
        inQuotes = true
      } else if (ch === ',') {
        cells.push(cur)
        cur = ''
      } else {
        cur += ch
      }
    }
    cells.push(cur)
    return cells.map((c) => c.trim())
  }

  const headers = parseLine(lines[0]).map((h) => h.toLowerCase())
  return lines.slice(1).map((line) => {
    const cells = parseLine(line)
    const row = {}
    headers.forEach((h, i) => {
      row[h] = cells[i] ?? ''
    })
    return row
  })
}

export const BULK_UPLOAD_TEMPLATE =
  'name,email,password,department,managerName,dateOfJoining\n' +
  'Jane Doe,jane.doe@example.com,TempPass123,Engineering,John Smith,2026-01-15\n'

// Quote a value only when it could break CSV structure (comma, quote, newline).
// Doubles embedded quotes per RFC 4180.
function csvCell(value) {
  const s = value == null ? '' : String(value)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

// rows is an array of arrays (already ordered to match headers).
export function buildCsv(headers, rows) {
  const lines = [headers.map(csvCell).join(',')]
  for (const row of rows) lines.push(row.map(csvCell).join(','))
  return lines.join('\r\n')
}

export function downloadTextFile(filename, content, mimeType = 'text/csv') {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
