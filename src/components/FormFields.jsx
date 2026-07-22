export function LabeledInput({ label, required, ...props }) {
  return (
    <label className="block text-sm">
      <span className="font-medium text-ink">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      <input
        required={required}
        {...props}
        onChange={(e) => props.onChange(e.target.value)}
        className="input mt-1"
      />
    </label>
  )
}

export function LabeledTextarea({ label, required, value, onChange }) {
  return (
    <label className="block text-sm">
      <span className="font-medium text-ink">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      <textarea
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className="input mt-1"
      />
    </label>
  )
}

export function FormActions({ submitting, onCancel, submitLabel = 'Save' }) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <button type="button" onClick={onCancel} className="btn-secondary">
        Cancel
      </button>
      <button type="submit" disabled={submitting} className="btn-primary">
        {submitting ? 'Saving…' : submitLabel}
      </button>
    </div>
  )
}
