export default function LoadingSpinner({ label = 'Loading…' }) {
  return (
    <div className="flex h-full min-h-[200px] w-full items-center justify-center gap-3 text-ink-muted">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/15 border-t-mint" />
      <span>{label}</span>
    </div>
  )
}
