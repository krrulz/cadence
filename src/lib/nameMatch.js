// Match a name as written on a slide (which may have extra whitespace,
// nicknames, or be missing entirely) against the Cadence employee roster, so
// the Deck Data Prep review table can pre-select a likely match instead of
// making the admin pick every resource by hand. Pure/DOM-free — the review
// UI still lets the admin override any guess.

function normalize(name) {
  return (name || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip accents
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokenSet(name) {
  return new Set(normalize(name).split(' ').filter(Boolean))
}

/**
 * Score how well `candidateName` matches `employeeName`, 0 (no match) to 1
 * (exact). Exact normalized match scores 1; otherwise scored by the
 * fraction of the shorter name's tokens found in the longer one (so
 * "Vaibhav Sharma" matches "Vaibhav" or "V. Sharma" partially, but two
 * unrelated names score near 0).
 */
export function nameSimilarity(candidateName, employeeName) {
  const a = normalize(candidateName)
  const b = normalize(employeeName)
  if (!a || !b) return 0
  if (a === b) return 1

  const tokensA = tokenSet(candidateName)
  const tokensB = tokenSet(employeeName)
  if (tokensA.size === 0 || tokensB.size === 0) return 0

  const [smaller, larger] = tokensA.size <= tokensB.size ? [tokensA, tokensB] : [tokensB, tokensA]
  let overlap = 0
  for (const t of smaller) {
    if (larger.has(t) || [...larger].some((lt) => lt.length > 2 && t.length > 2 && (lt.startsWith(t) || t.startsWith(lt)))) {
      overlap++
    }
  }
  return overlap / smaller.size
}

/**
 * Best-matching employee for a name extracted from a slide, or null if
 * nothing scores above `threshold`.
 * @param {string} candidateName
 * @param {Array<{id:string, name:string}>} employees
 * @param {number} threshold
 */
export function bestEmployeeMatch(candidateName, employees, threshold = 0.5) {
  let best = null
  let bestScore = 0
  for (const emp of employees) {
    const score = nameSimilarity(candidateName, emp.name)
    if (score > bestScore) {
      bestScore = score
      best = emp
    }
  }
  return bestScore >= threshold ? { employee: best, score: bestScore } : null
}
