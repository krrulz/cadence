import {
  collection,
  doc,
  addDoc,
  updateDoc,
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
