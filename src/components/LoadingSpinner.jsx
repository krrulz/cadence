export default function LoadingSpinner({ label = 'Loading…' }) {
  return (
    <div className="flex h-full min-h-[200px] w-full items-center justify-center gap-3 text-slate-500">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-brand" />
      <span>{label}</span>
    </div>
  )
}
