/**
 * Domain services over the API. Endpoint paths come straight from the Swagger file.
 * Short-lived in-memory cache for "load everything" lookups; any mutation clears it.
 * (Memory only: nothing is persisted to browser storage.)
 */
import { api, fetchAllPages, ApiError } from './api.js';

const TTL_MS = 20000;
const cache = new Map();
export const invalidate = () => cache.clear();

async function cachedAll(path) {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.t < TTL_MS) return hit.v;
  const v = await fetchAllPages(path);
  cache.set(path, { t: Date.now(), v });
  return v;
}

async function mutate(promise) {
  try { return await promise; } finally { invalidate(); }
}

const data = (env) => env.data;
/** Lists that 404 when empty are treated as empty. */
export async function orEmpty(promise) {
  try { return (await promise) ?? []; } catch (e) { if (e instanceof ApiError && e.status === 404) return []; throw e; }
}

export const courses = {
  all: () => cachedAll('/api/Courses').then((r) => r.items),
  allMeta: () => cachedAll('/api/Courses'),
  get: (id) => api.get(`/api/Courses/${id}`).then(data),
  create: (dto) => mutate(api.post('/api/Courses', dto)),
  update: (id, dto) => mutate(api.put(`/api/Courses/${id}`, dto)),
  remove: (id) => mutate(api.del(`/api/Courses/${id}`)),
};

export const students = {
  all: () => cachedAll('/api/Students').then((r) => r.items),
  getByMatric: (matricNumber) => api.get('/api/Students/get-by-matric-number', { matricNumber }).then(data),
  create: (dto) => mutate(api.post('/api/Students', dto)),
  update: (id, dto) => mutate(api.put(`/api/Students/${id}`, dto)),
  remove: (id) => mutate(api.del(`/api/Students/${id}`)),
};

export const enrollments = {
  all: () => cachedAll('/api/Enrollments').then((r) => r.items),
  mine: (studentId) => orEmpty(cachedAll(`/api/Enrollments/student/${studentId}`).then((r) => r.items)),
  create: (dto) => mutate(api.post('/api/Enrollments', dto)),
  remove: (id) => mutate(api.del(`/api/Enrollments/${id}`)),
};

export const questions = {
  all: () => cachedAll('/api/Questions').then((r) => r.items),
  byCourse: (courseId) => fetchAllPages(`/api/Questions/by-course/${courseId}`).then((r) => r.items),
  countForCourse: (courseId) => api.get(`/api/Questions/by-course/${courseId}`, { pageNumber: 1, pageSize: 1 }).then((e) => e.data?.totalCount ?? 0),
  get: (id) => api.get(`/api/Questions/${id}`).then(data),
  create: (dto) => mutate(api.post('/api/Questions', dto)),
  update: (id, dto) => mutate(api.put(`/api/Questions/${id}`, dto)),
  remove: (id) => mutate(api.del(`/api/Questions/${id}`)),
};

export const attempts = {
  all: () => cachedAll('/api/ExamAttempts').then((r) => r.items),
  allMeta: () => cachedAll('/api/ExamAttempts'),
  byStudent: (studentId) => orEmpty(api.get(`/api/ExamAttempts/by-student/${studentId}`).then(data)),
  get: (id) => api.get(`/api/ExamAttempts/${id}`).then(data),
  create: (dto) => mutate(api.post('/api/ExamAttempts', dto)),
  submit: (id) => mutate(api.post(`/api/ExamAttempts/${id}/submit`)),
};

export const answers = {
  byAttempt: (attemptId) => orEmpty(api.get(`/api/ExamAnswers/by-attempt/${attemptId}`).then(data)),
  create: (dto) => api.post('/api/ExamAnswers', dto),
  update: (id, dto) => api.put(`/api/ExamAnswers/${id}`, dto),
};

export const results = {
  all: () => cachedAll('/api/Results').then((r) => r.items),
  allMeta: () => cachedAll('/api/Results'),
  byStudent: (studentId) => orEmpty(api.get(`/api/Results/by-student/${studentId}`).then(data)),
  get: (id) => api.get(`/api/Results/${id}`).then(data),
  /** The backend computes the official result from the submitted attempt. */
  generate: (examAttemptId) => mutate(api.post('/api/Results/generate', { examAttemptId })).then(data),
};

/* ---------- Derived helpers ---------- */

/** Status of a student's exam for one course, from their attempts. */
export function examStatus(attemptList, courseId) {
  const mine = attemptList.filter((a) => a.courseId === courseId)
    .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
  const open = mine.find((a) => !a.isSubmitted);
  if (open) return { state: 'in-progress', attempt: open };
  const done = mine.find((a) => a.isSubmitted);
  if (done) return { state: 'completed', attempt: done };
  return { state: 'available', attempt: null };
}

/** Find the attempt just created: the API only returns a Boolean on POST /ExamAttempts. */
export async function findOpenAttempt(studentId, courseId) {
  const st = examStatus(await attempts.byStudent(studentId), courseId);
  return st.state === 'in-progress' ? st.attempt : null;
}

/** Wrap a promise so a failure becomes { error } instead of rejecting. */
export const settle = (p) => p.then((value) => ({ value }), (error) => ({ error }));
