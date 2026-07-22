import { useCallback, useEffect, useMemo, useState } from 'react'
import Layout from '../components/Layout.jsx'
import LoadingSpinner from '../components/LoadingSpinner.jsx'
import Modal from '../components/Modal.jsx'
import Section from '../components/Section.jsx'
import { LabeledInput, FormActions } from '../components/FormFields.jsx'
import { useAuth } from '../contexts/AuthContext.jsx'
import { getAllRecords, addRecord, updateRecord, deleteRecord } from '../lib/firestoreHelpers.js'

const DEFAULT_CATEGORY = 'General'

// Normalise a user-entered URL so bare "example.com" still opens correctly and
// we never render a link that could be interpreted as a relative path.
function normalizeUrl(url) {
  const trimmed = (url || '').trim()
  if (!trimmed) return ''
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

function hostOf(url) {
  try {
    return new URL(normalizeUrl(url)).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

export default function Links() {
  const { isAdmin } = useAuth()
  const [loading, setLoading] = useState(true)
  const [bookmarks, setBookmarks] = useState([])
  const [modal, setModal] = useState(null) // null | { type:'add' } | { type:'edit', data }

  const loadData = useCallback(async () => {
    setLoading(true)
    const items = await getAllRecords('bookmarks')
    setBookmarks(items)
    setLoading(false)
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Group by category, categories and links each sorted alphabetically.
  const grouped = useMemo(() => {
    const map = new Map()
    for (const b of bookmarks) {
      const cat = b.category?.trim() || DEFAULT_CATEGORY
      if (!map.has(cat)) map.set(cat, [])
      map.get(cat).push(b)
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([cat, items]) => [cat, items.sort((a, b) => (a.title || '').localeCompare(b.title || ''))])
  }, [bookmarks])

  async function handleDelete(id) {
    await deleteRecord('bookmarks', id)
    loadData()
  }

  if (loading) {
    return (
      <Layout>
        <LoadingSpinner label="Loading links…" />
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">Useful Links</h1>
          <p className="text-sm text-ink-muted">Shared bookmarks for the team.</p>
        </div>
        {isAdmin && (
          <button type="button" onClick={() => setModal({ type: 'add' })} className="btn-primary">
            + Add Link
          </button>
        )}
      </div>

      {grouped.length === 0 ? (
        <div className="mt-6 card text-center text-ink-faint">
          No links yet.{isAdmin ? ' Use “Add Link” to create the first one.' : ''}
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {grouped.map(([category, items]) => (
            <Section key={category} title={category}>
              <ul className="divide-y divide-white/5">
                {items.map((b) => (
                  <li key={b.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <a
                        href={normalizeUrl(b.url)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-mint hover:underline"
                      >
                        {b.title}
                      </a>
                      {b.description && (
                        <p className="truncate text-sm text-ink-muted">{b.description}</p>
                      )}
                      <p className="truncate text-xs text-ink-faint">{hostOf(b.url)}</p>
                    </div>
                    {isAdmin && (
                      <div className="flex shrink-0 gap-3 text-sm">
                        <button
                          type="button"
                          onClick={() => setModal({ type: 'edit', data: b })}
                          className="text-ink-muted hover:text-mint hover:underline"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(b.id)}
                          className="text-ink-faint hover:text-rose-400 hover:underline"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </Section>
          ))}
        </div>
      )}

      {modal && (
        <BookmarkModal
          bookmark={modal.type === 'edit' ? modal.data : null}
          existingCategories={grouped.map(([c]) => c)}
          onClose={() => setModal(null)}
          onSaved={loadData}
        />
      )}
    </Layout>
  )
}

function BookmarkModal({ bookmark, existingCategories, onClose, onSaved }) {
  const [form, setForm] = useState({
    title: bookmark?.title || '',
    url: bookmark?.url || '',
    category: bookmark?.category || '',
    description: bookmark?.description || '',
  })
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    const data = {
      title: form.title.trim(),
      url: normalizeUrl(form.url),
      category: form.category.trim() || DEFAULT_CATEGORY,
      description: form.description.trim(),
    }
    if (bookmark) await updateRecord('bookmarks', bookmark.id, data)
    else await addRecord('bookmarks', { ...data, createdAt: new Date().toISOString() })
    setSubmitting(false)
    onSaved()
    onClose()
  }

  return (
    <Modal title={bookmark ? 'Edit Link' : 'Add Link'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <LabeledInput label="Title" required value={form.title} onChange={(v) => setForm((f) => ({ ...f, title: v }))} placeholder="e.g. HR Handbook" />
        <LabeledInput label="URL" required value={form.url} onChange={(v) => setForm((f) => ({ ...f, url: v }))} placeholder="https://…" />
        <LabeledInput
          label="Category"
          value={form.category}
          onChange={(v) => setForm((f) => ({ ...f, category: v }))}
          placeholder={DEFAULT_CATEGORY}
          list="bookmark-categories"
        />
        <datalist id="bookmark-categories">
          {existingCategories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <LabeledInput label="Description (optional)" value={form.description} onChange={(v) => setForm((f) => ({ ...f, description: v }))} />
        <FormActions submitting={submitting} onCancel={onClose} />
      </form>
    </Modal>
  )
}
