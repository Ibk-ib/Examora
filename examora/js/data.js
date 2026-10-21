// Short-lived in-memory cache for full list loads. This is a performance cache only (never persisted,
// never a source of truth); it is cleared on sign-out and invalidated after every mutation.
import { api } from './api.js';

const store = new Map();
const TTL = 30_000;

function cached(key, loader) {
  const hit = store.get(key);
  if (hit && Date.now() - hit.t < TTL) return hit.p;
  const p = loader().catch((e) => { store.delete(key); throw e; });
  store.set(key, { t: Date.now(), p });
  return p;
}

export function invalidate(...prefixes) {
  for (const k of [...store.keys()]) if (prefixes.some((p) => k.startsWith(p))) store.delete(k);
}
export const clearCache = () => store.clear();

/** A 404 from a "by-student" endpoint means "nothing yet". */
const orEmpty = async (promise) => {
  try { return (await promise) ?? []; } catch (e) { if (e?.status === 404) return []; throw e; }
};

export const data = {
  courses: () => cached('courses', () => api.fetchAll('/api/Courses')),
  students: () => cached('students', () => api.fetchAll('/api/Students')),
  enrollments: () => cached('enrollments', () => api.fetchAll('/api/Enrollments')),
  questions: () => cached('questions', () => api.fetchAll('/api/Questions')),
  attempts: () => cached('attempts', () => api.fetchAll('/api/ExamAttempts')),
  results: () => cached('results', () => api.fetchAll('/api/Results')),
  courseQuestions: (courseId) => cached(`questions:${courseId}`, () => orEmpty(api.fetchAll(`/api/Questions/by-course/${courseId}`))),
  myAttempts: (studentId) => cached(`attempts:${studentId}`, () => orEmpty(api.attempts.byStudent(studentId))),
  myResults: (studentId) => cached(`results:${studentId}`, () => orEmpty(api.results.byStudent(studentId))),
  // The list endpoint is filtered by studentId here as well, so the UI is correct whichever scope the API returns.
  myEnrollments: async (studentId) => (await cached('enrollments:all', () => api.fetchAll('/api/Enrollments'))).filter((e) => e.studentId === studentId),
  me: (matricNumber) => cached(`me:${matricNumber}`, () => api.students.byMatric(matricNumber)),
};
