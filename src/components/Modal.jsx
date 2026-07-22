import { X } from 'lucide-react'

export default function Modal({ title, onClose, children, wide = false }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div
        className={`animate-fade-in-up w-full ${wide ? 'max-w-2xl' : 'max-w-md'} rounded-2xl border border-surface-border bg-surface-2 shadow-2xl`}
      >
        <div className="flex items-center justify-between border-b border-surface-border px-5 py-4">
          <h2 className="text-lg font-semibold text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-ink-faint transition-colors hover:bg-white/10 hover:text-ink"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  )
}
