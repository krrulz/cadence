// Deterministic initials avatar. Same key always yields the same on-palette
// colour, so a person looks consistent across the app.
const COLORS = [
  'bg-brand-100 text-brand-800',
  'bg-accent-100 text-accent-800',
  'bg-emerald-100 text-emerald-800',
  'bg-violet-100 text-violet-800',
  'bg-teal-100 text-teal-800',
  'bg-fuchsia-100 text-fuchsia-800',
]

function initials(name) {
  const parts = (name || '').trim().split(/\s+/)
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?'
}

function colorFor(key) {
  let hash = 0
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0
  return COLORS[hash % COLORS.length]
}

export default function Avatar({ name, colorKey, size = 'md' }) {
  const dims = size === 'lg' ? 'h-14 w-14 text-lg' : size === 'sm' ? 'h-8 w-8 text-xs' : 'h-10 w-10 text-sm'
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold ${dims} ${colorFor(colorKey || name || '')}`}
    >
      {initials(name)}
    </div>
  )
}
