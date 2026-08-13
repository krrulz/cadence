// Links Project Status Updates (client-delivery milestones) into the
// employee's "Client Delivery" goal so each milestone shows up as a completed
// key result there, without the employee having to enter it twice.

export const CLIENT_DELIVERY_OBJECTIVE = 'Client Delivery'

// Given the employee's existing "Client Delivery" goal (or null if they don't
// have one yet) and a milestone { title }, return what to write to `goals`:
// either a brand-new goal doc, or a patch adding one more completed key result
// to the existing one. Pure — the caller does the actual Firestore read/write.
export function applyMilestoneToGoal(goal, milestone, { employeeId, ownerName, createdByUid, createdByRole } = {}) {
  const now = new Date().toISOString()
  const krText = (milestone?.title || '').trim()
  if (!goal) {
    return {
      isNew: true,
      data: {
        employeeId,
        objective: CLIENT_DELIVERY_OBJECTIVE,
        description: 'Auto-tracked from Project Status Updates.',
        status: 'In Progress',
        dueDate: '',
        progress: 0,
        keyResults: [{ text: krText, done: true }],
        ownerName: ownerName || '',
        createdByUid: createdByUid || '',
        createdByRole: createdByRole || '',
        createdAt: now,
        updatedAt: now,
      },
    }
  }
  return {
    isNew: false,
    data: {
      keyResults: [...(goal.keyResults || []), { text: krText, done: true }],
      updatedAt: now,
    },
  }
}
