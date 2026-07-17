import { useMemo, useState } from 'react'
import Modal from './Modal.jsx'
import { REPORTS, buildReportRows } from '../lib/reports.js'
import { buildCsv, downloadTextFile } from '../lib/csv.js'

// `scopeEmployees` is the list of employees the report covers (selected rows, or
// the whole team). `records` holds every collection keyed by section name.
export default function ReportModal({ scopeEmployees, records, onClose }) {
  const [section, setSection] = useState('performance')

  const employeesById = useMemo(
    () => Object.fromEntries(scopeEmployees.map((e) => [e.id, e])),
    [scopeEmployees],
  )
  const scopeIds = useMemo(() => new Set(scopeEmployees.map((e) => e.id)), [scopeEmployees])

  const matching = useMemo(
    () => (records[section] || []).filter((r) => scopeIds.has(r.employeeId)),
    [records, section, scopeIds],
  )

  function handleDownload() {
    const { headers, rows } = buildReportRows(section, matching, employeesById)
    const csv = buildCsv(headers, rows)
    const stamp = new Date().toISOString().slice(0, 10)
    const scope = scopeEmployees.length === 1 ? scopeEmployees[0].name.replace(/\s+/g, '-') : `${scopeEmployees.length}-employees`
    downloadTextFile(`${section}-${scope}-${stamp}.csv`, csv)
  }

  return (
    <Modal title="Download Report" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-slate-500">
          {scopeEmployees.length} employee{scopeEmployees.length === 1 ? '' : 's'} in scope.
        </p>

        <label className="block text-sm">
          <span className="font-medium text-slate-700">Section</span>
          <select value={section} onChange={(e) => setSection(e.target.value)} className="input mt-1">
            {Object.entries(REPORTS).map(([key, def]) => (
              <option key={key} value={key}>
                {def.label}
              </option>
            ))}
          </select>
        </label>

        <p className="text-sm text-slate-500">
          {matching.length} record{matching.length === 1 ? '' : 's'} to export.
        </p>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button type="button" onClick={handleDownload} disabled={matching.length === 0} className="btn-primary">
            Download CSV
          </button>
        </div>
      </div>
    </Modal>
  )
}
