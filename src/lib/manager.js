// Manager scoping. An employee "belongs" to an admin when their managerUid
// points at that admin. For legacy records created before managerUid existed we
// fall back to matching the typed managerName against the admin's name, so
// existing rosters don't vanish the moment scoping is switched on.

function norm(s) {
  return (s || '').trim().toLowerCase()
}

// True if `employee` reports to `admin` ({ uid, name }).
export function isManagedBy(employee, admin) {
  if (!admin) return false
  if (employee.managerUid) return employee.managerUid === admin.uid
  // Legacy fallback: name match, only when no explicit link is set.
  return !!norm(employee.managerName) && norm(employee.managerName) === norm(admin.name)
}

// True when the employee has no manager at all (no uid link and no name).
export function hasNoManager(employee) {
  return !employee.managerUid && !norm(employee.managerName)
}

// True when the employee has some manager info but it isn't this admin — i.e.
// it belongs to (or is claimable by) someone else.
export function isUnassignedFor(employee, admin) {
  return !isManagedBy(employee, admin) && hasNoManager(employee)
}
