import { useCallback, useEffect, useState } from 'react'
import { getSubRecords, addSubRecord, deleteSubRecord } from '../lib/firestoreHelpers.js'
import { sortByDateDesc } from '../lib/aggregate.js'

// A lightweight author-tagged comment thread stored under
// `${parentCollection}/${parentId}/comments`. `viewer` = { uid, name, role }.
// Anyone who can see this component may post; a comment can be removed by its
// author or an admin (enforced in firestore.rules too).
export default function CommentThread({ parentCollection, parentId, viewer }) {
  const [comments, setComments] = useState([])
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const rows = await getSubRecords(parentCollection, parentId, 'comments')
    // Oldest first so a thread reads top-to-bottom.
    setComments(sortByDateDesc(rows, 'createdAt').reverse())
    setLoading(false)
  }, [parentCollection, parentId])

  useEffect(() => {
    load()
  }, [load])

  async function addComment(e) {
    e.preventDefault()
    if (!text.trim()) return
    await addSubRecord(parentCollection, parentId, 'comments', {
      authorUid: viewer.uid,
      authorName: viewer.name,
      authorRole: viewer.role,
      text: text.trim(),
      createdAt: new Date().toISOString(),
    })
    setText('')
    load()
  }

  async function removeComment(c) {
    await deleteSubRecord(parentCollection, parentId, 'comments', c.id)
    load()
  }

  return (
    <div>
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Comments</p>
      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : (
        <div className="space-y-2">
          {comments.map((c) => (
            <div key={c.id} className="rounded-md bg-slate-50 p-2 text-sm">
              <div className="mb-0.5 flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-600">
                  {c.authorName}
                  <span className="ml-1 text-slate-400">· {c.authorRole}</span>
                  {c.createdAt && (
                    <span className="ml-1 text-slate-400">· {c.createdAt.slice(0, 10)}</span>
                  )}
                </span>
                {(c.authorUid === viewer.uid || viewer.role === 'admin') && (
                  <button
                    type="button"
                    onClick={() => removeComment(c)}
                    className="text-xs text-slate-400 hover:text-red-600"
                    aria-label="Delete comment"
                  >
                    ✕
                  </button>
                )}
              </div>
              <p className="whitespace-pre-wrap text-slate-700">{c.text}</p>
            </div>
          ))}
          {comments.length === 0 && <p className="text-sm text-slate-400">No comments yet.</p>}
        </div>
      )}
      <form onSubmit={addComment} className="mt-2 flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a comment…"
          className="input text-sm"
        />
        <button type="submit" className="btn-secondary text-xs">
          Post
        </button>
      </form>
    </div>
  )
}
