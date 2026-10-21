// Entry point: hash router, route guards and global event handling.
// Routes are lazy-loaded page modules. Guards only decide what to *show*; the API enforces real authorisation.
import { getSession, clearSession, isAdmin, homePath } from './auth.js';
import { mountBare, mountShell, setActiveNav, setUserName, setNavOpen } from './layout.js';
import { toast, go, mount, errorState, html, pageHeader, emptyState, icon, on } from './ui.js';
import { clearCache, data } from './data.js';
import { fullName } from './utils.js';

const app = document.getElementById('app');

const compile = (path) => new RegExp(`^${path.replace(/:[^/]+/g, '([^/]+)')}$`);
const names = (path) => [...path.matchAll(/:([^/]+)/g)].map((m) => m[1]);
const R = (path, access, layout, load, title) => ({ path, access, layout, load, title, re: compile(path), keys: names(path) });

// access: 'guest' | 'admin' | 'student'.  layout: 'bare' | 'shell' | 'focus'
const routes = [
  R('/login', 'guest', 'bare', () => import('./pages/auth.js').then((m) => m.renderLogin), 'Sign in'),
  R('/register', 'guest', 'bare', () => import('./pages/auth.js').then((m) => m.renderRegister), 'Create account'),

  R('/admin', 'admin', 'shell', () => import('./pages/admin-dashboard.js').then((m) => m.renderAdminDashboard), 'Overview'),
  R('/admin/students', 'admin', 'shell', () => import('./pages/students.js').then((m) => m.renderStudentList), 'Students'),
  R('/admin/students/new', 'admin', 'shell', () => import('./pages/students.js').then((m) => (c) => m.renderStudentForm(c, 'create')), 'New student'),
  R('/admin/students/:id/edit', 'admin', 'shell', () => import('./pages/students.js').then((m) => (c) => m.renderStudentForm(c, 'edit')), 'Edit student'),
  R('/admin/students/:id', 'admin', 'shell', () => import('./pages/students.js').then((m) => m.renderStudentDetails), 'Student'),
  R('/admin/courses', 'admin', 'shell', () => import('./pages/courses.js').then((m) => m.renderCourseList), 'Courses'),
  R('/admin/courses/new', 'admin', 'shell', () => import('./pages/courses.js').then((m) => (c) => m.renderCourseForm(c, 'create')), 'New course'),
  R('/admin/courses/:id/edit', 'admin', 'shell', () => import('./pages/courses.js').then((m) => (c) => m.renderCourseForm(c, 'edit')), 'Edit course'),
  R('/admin/courses/:id', 'admin', 'shell', () => import('./pages/courses.js').then((m) => m.renderCourseDetails), 'Course'),
  R('/admin/enrollments', 'admin', 'shell', () => import('./pages/enrollments.js').then((m) => m.renderAdminEnrollments), 'Enrollments'),
  R('/admin/questions', 'admin', 'shell', () => import('./pages/questions.js').then((m) => m.renderQuestionList), 'Questions'),
  R('/admin/questions/new', 'admin', 'shell', () => import('./pages/questions.js').then((m) => (c) => m.renderQuestionForm(c, 'create')), 'New question'),
  R('/admin/questions/:id/edit', 'admin', 'shell', () => import('./pages/questions.js').then((m) => (c) => m.renderQuestionForm(c, 'edit')), 'Edit question'),
  R('/admin/questions/:id', 'admin', 'shell', () => import('./pages/questions.js').then((m) => m.renderQuestionDetails), 'Question'),
  R('/admin/exams', 'admin', 'shell', () => import('./pages/exams.js').then((m) => m.renderExamList), 'Exams'),
  R('/admin/exams/new', 'admin', 'shell', () => import('./pages/exams.js').then((m) => m.renderExamSetup), 'Set up an exam'),
  R('/admin/exams/:courseId', 'admin', 'shell', () => import('./pages/exams.js').then((m) => m.renderExamDetails), 'Exam'),
  R('/admin/attempts', 'admin', 'shell', () => import('./pages/attempts.js').then((m) => m.renderAttemptList), 'Exam attempts'),
  R('/admin/attempts/:id', 'admin', 'shell', () => import('./pages/attempts.js').then((m) => m.renderAttemptDetails), 'Attempt'),
  R('/admin/results', 'admin', 'shell', () => import('./pages/results.js').then((m) => m.renderAdminResults), 'Results'),
  R('/admin/results/:id', 'admin', 'shell', () => import('./pages/results.js').then((m) => (c) => m.renderResultDetails(c, 'admin')), 'Result'),

  R('/student', 'student', 'shell', () => import('./pages/student-dashboard.js').then((m) => m.renderStudentDashboard), 'Overview'),
  R('/student/courses', 'student', 'shell', () => import('./pages/student-courses.js').then((m) => m.renderAvailableCourses), 'Available courses'),
  R('/student/courses/:id', 'student', 'shell', () => import('./pages/student-courses.js').then((m) => m.renderStudentCourseDetails), 'Course'),
  R('/student/my-courses', 'student', 'shell', () => import('./pages/student-courses.js').then((m) => m.renderMyCourses), 'My courses'),
  R('/student/exams', 'student', 'shell', () => import('./pages/student-exams.js').then((m) => m.renderAvailableExams), 'Available exams'),
  R('/student/exams/:courseId/instructions', 'student', 'shell', () => import('./pages/student-exams.js').then((m) => m.renderExamInstructions), 'Exam instructions'),
  R('/student/exams/attempt/:attemptId', 'student', 'focus', () => import('./pages/exam-taking.js').then((m) => m.renderTakeExam), 'Exam in progress'),
  R('/student/exams/complete/:attemptId', 'student', 'shell', () => import('./pages/student-exams.js').then((m) => m.renderExamComplete), 'Exam submitted'),
  R('/student/history', 'student', 'shell', () => import('./pages/student-exams.js').then((m) => m.renderExamHistory), 'Exam history'),
  R('/student/results', 'student', 'shell', () => import('./pages/results.js').then((m) => m.renderStudentResults), 'My results'),
  R('/student/results/:id', 'student', 'shell', () => import('./pages/results.js').then((m) => (c) => m.renderResultDetails(c, 'student')), 'Result'),
  R('/student/performance', 'student', 'shell', () => import('./pages/performance.js').then((m) => m.renderPerformance), 'Academic performance'),
  R('/student/profile', 'student', 'shell', () => import('./pages/profile.js').then((m) => m.renderProfile), 'My profile'),
];

let leaveHandlers = [];
let navToken = 0;

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs = ''] = raw.split('?');
  return { path: path.replace(/\/+$/, '') || '/', query: Object.fromEntries(new URLSearchParams(qs)) };
}

function match(path) {
  for (const r of routes) {
    const m = r.re.exec(path);
    if (m) return { route: r, params: Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) };
  }
  return null;
}

async function navigate() {
  const token = ++navToken;
  leaveHandlers.forEach((fn) => { try { fn(); } catch { /* ignore */ } });
  leaveHandlers = [];
  setNavOpen(false);

  const { path, query } = parseHash();
  const session = getSession();
  const found = match(path);

  if (path === '/') return go(session ? homePath(session) : '/login');

  if (!found) {
    if (!session) return go('/login');
    const host = mountShell(app, session);
    setActiveNav(path);
    mount(host, html`${pageHeader({ title: 'Page not found' })}${emptyState({ icon: 'compass', title: 'That page does not exist', text: 'Check the address or use the menu.', action: html`<a class="btn btn-primary" href="#${homePath(session)}">Go to overview</a>` })}`);
    return undefined;
  }

  const { route, params } = found;
  if (route.access === 'guest') {
    if (session) return go(homePath(session));
  } else if (!session) {
    return go('/login');
  } else if ((route.access === 'admin') !== isAdmin(session)) {
    toast('You do not have access to that page.', 'error');
    return go(homePath(session));
  }

  const host = route.layout === 'shell' ? mountShell(app, session) : mountBare(app, { focus: route.layout === 'focus' });
  const view = document.createElement('div');
  view.className = 'view';
  host.replaceChildren(view);
  if (route.layout === 'shell') setActiveNav(path);
  document.title = `${route.title} · Examora`;
  window.scrollTo(0, 0);

  const ctx = { view, params, query, session, path, onLeave: (fn) => leaveHandlers.push(fn), reload: navigate };
  try {
    const render = await route.load();
    if (token !== navToken) return undefined;
    await render(ctx);
  } catch (e) {
    if (token !== navToken) return undefined;
    console.error(e);
    mount(view, errorState(e));
  }
  if (token === navToken) host.focus({ preventScroll: true });
  return undefined;
}

/* ---------- Global handlers ---------- */
function logout(message = 'You have been signed out.') {
  clearSession();
  clearCache();
  toast(message, 'info');
  go('/login');
}

on(document.body, 'click', '[data-action]', (e, el) => {
  switch (el.dataset.action) {
    case 'logout': logout(); break;
    case 'toggle-nav': setNavOpen(!document.body.classList.contains('nav-open')); break;
    case 'close-nav': setNavOpen(false); break;
    case 'retry': navigate(); break;
    case 'toggle-password': {
      const input = document.getElementById(el.dataset.target);
      if (!input) break;
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      el.setAttribute('aria-pressed', String(show));
      el.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
      el.innerHTML = `<i data-lucide="${show ? 'eye-off' : 'eye'}" class="icon" aria-hidden="true"></i>`;
      break;
    }
    default:
  }
});
on(document.body, 'click', '.nav-link', () => setNavOpen(false));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setNavOpen(false); });

let expiryShown = false;
window.addEventListener('examora:session-expired', (e) => {
  clearCache();
  if (!e.detail?.had) return;
  if (!expiryShown) {
    expiryShown = true;
    toast('Your session has expired. Please sign in again.', 'warning');
    setTimeout(() => { expiryShown = false; }, 3000);
  }
  go('/login');
});

// Lucide replaces <i data-lucide> placeholders with SVGs. Re-run whenever the DOM changes.
let iconFrame = 0;
new MutationObserver(() => {
  if (iconFrame) return;
  iconFrame = requestAnimationFrame(() => { iconFrame = 0; window.lucide?.createIcons(); });
}).observe(document.body, { childList: true, subtree: true });

window.addEventListener('hashchange', navigate);
window.addEventListener('DOMContentLoaded', () => { /* handled below */ });

// Show the signed-in student's real name in the top bar once it has loaded.
window.addEventListener('hashchange', async () => {
  const s = getSession();
  if (!s || isAdmin(s) || !s.matricNumber) return;
  try { setUserName(fullName(await data.me(s.matricNumber))); } catch { /* keep the email */ }
});

navigate();
