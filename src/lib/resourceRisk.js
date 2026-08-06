// Automatic happiness / risk colour for a resource (employee), computed purely
// from live signals — no manual colour picker. The row colour is the WORST
// active driver, so when a driver resolves (grievance closed, note flipped to
// positive, a fresh 1:1) it stops contributing and the colour lifts on its own.
//
// Drivers:
//   RED   — an open grievance for a while, latest review rating < 3, or the
//           manager's note sentiment is 'concern'.
//   AMBER — a recently opened grievance, latest rating == 3, or engagement has
//           gone stale (had 1:1s/feedback before, none in 90 days).
//   GREEN — none of the above. Recent recognition / positive note / strong
//           rating are noted as positive signals.

import { parseISO } from './calendar.js'
import { isReview, latestByDate } from './aggregate.js'

const RED = 2
const AMBER = 1
const GREEN = 0
const NAME = { 2: 'red', 1: 'amber', 0: 'green' }

const GRIEVANCE_STALE_DAYS = 14 // open longer than this → red
const ENGAGEMENT_STALE_DAYS = 90 // no 1:1/feedback in this window → amber

function daysSince(iso, today) {
  const d = parseISO(iso)
  if (!d) return Infinity
  return Math.floor((today - d) / 86400000)
}

export function computeResourceRisk(
  { performance = [], grievances = [], recognitions = [], feedback = [], oneOnOnes = [] },
  analysis,
  today = new Date(),
) {
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  let level = GREEN
  const drivers = [] // { lvl, why }
  const bump = (lvl, why) => {
    if (lvl > level) level = lvl
    drivers.push({ lvl, why })
  }

  // Open grievances — older ones weigh heavier.
  for (const g of grievances.filter((g) => g.status && g.status !== 'Resolved')) {
    const age = daysSince(g.dateRaised, t)
    if (age > GRIEVANCE_STALE_DAYS) bump(RED, `Grievance "${g.category}" open ${Number.isFinite(age) ? `${age}d` : 'a while'}`)
    else bump(AMBER, `Grievance "${g.category}" recently opened`)
  }

  // Latest performance review rating.
  const reviews = performance.filter(isReview)
  const latestRating = reviews.length ? Number(latestByDate(reviews, 'date').rating) : null
  if (latestRating != null) {
    if (latestRating < 3) bump(RED, `Latest review rating ${latestRating}/5`)
    else if (latestRating === 3) bump(AMBER, 'Latest review rating 3/5')
  }

  // Manager's private note sentiment.
  const sentiment = analysis?.sentiment
  if (sentiment === 'concern') bump(RED, 'You flagged a concern in your notes')

  // Engagement staleness — only if there IS history that has since gone quiet
  // (so brand-new employees aren't flagged for having nothing yet).
  const touches = [...feedback.map((f) => f.date), ...oneOnOnes.map((o) => o.date)]
    .map((d) => daysSince(d, t))
    .filter((n) => Number.isFinite(n))
  if (touches.length) {
    const lastTouch = Math.min(...touches)
    if (lastTouch > ENGAGEMENT_STALE_DAYS) bump(AMBER, `No 1:1 or feedback in ${lastTouch}d`)
  }

  // Positive signals — surfaced for context; they don't override a real driver.
  const positives = []
  if (recognitions.some((r) => daysSince(r.date, t) <= 90)) positives.push('Recent recognition')
  if (sentiment === 'positive') positives.push('Your note is positive')
  if (latestRating != null && latestRating >= 4) positives.push('Strong latest rating')

  const reasons =
    level === GREEN
      ? positives.length
        ? positives
        : ['No concerns']
      : drivers
          .filter((d) => d.lvl > 0)
          .sort((a, b) => b.lvl - a.lvl)
          .map((d) => d.why)

  return { level: NAME[level], reasons }
}
