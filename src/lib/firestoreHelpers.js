import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
} from 'firebase/firestore'
import { db } from '../firebase.js'

// --- users -----------------------------------------------------------

export async function getAllUsers() {
  const snap = await getDocs(collection(db, 'users'))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export async function getUserDoc(uid) {
  const snap = await getDoc(doc(db, 'users', uid))
  return snap.exists() ? { id: snap.id, ...snap.data() } : null
}

export function createUserProfile(uid, data) {
  return setDoc(doc(db, 'users', uid), data)
}

export function updateUserProfile(uid, data) {
  return updateDoc(doc(db, 'users', uid), data)
}

// --- generic subcollections -------------------------------------------
// performance, grievances, recognitions, feedback, leaves all share the
// shape { employeeId, ... } stored as top-level collections.

export async function getAllRecords(collectionName) {
  const snap = await getDocs(collection(db, collectionName))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export async function getRecordsForEmployee(collectionName, employeeId) {
  const q = query(collection(db, collectionName), where('employeeId', '==', employeeId))
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export async function getRecordsByField(collectionName, field, value) {
  const q = query(collection(db, collectionName), where(field, '==', value))
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export function addRecord(collectionName, data) {
  return addDoc(collection(db, collectionName), data)
}

export function updateRecord(collectionName, id, data) {
  return updateDoc(doc(db, collectionName, id), data)
}

export function deleteRecord(collectionName, id) {
  return deleteDoc(doc(db, collectionName, id))
}

// --- subcollections ---------------------------------------------------
// Used by the 1:1 module, where each note / action item is its own document
// under oneOnOnes/{parentId}/{subName}/{id} so per-author rules can apply.

export async function getSubRecords(parentCollection, parentId, subName) {
  const snap = await getDocs(collection(db, parentCollection, parentId, subName))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export function addSubRecord(parentCollection, parentId, subName, data) {
  return addDoc(collection(db, parentCollection, parentId, subName), data)
}

export function updateSubRecord(parentCollection, parentId, subName, subId, data) {
  return updateDoc(doc(db, parentCollection, parentId, subName, subId), data)
}

export function deleteSubRecord(parentCollection, parentId, subName, subId) {
  return deleteDoc(doc(db, parentCollection, parentId, subName, subId))
}
