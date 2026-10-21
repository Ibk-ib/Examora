/** Exam attempts: admin monitoring (read-only) and student exam history. */
import { html } from '../html.js';
import { icon, badge, table, loading, errorState, emptyState, toast, toastError, dl, alertBox } from '../components.js';
import { mountList, searchField, filterSelect } from '../listing.js';
import { attempts, answers, courses, results, settle } from '../services.js';
import { delegate, includesText, fmtDateTime } from '../utils.js';

const statusBadge = (a) => (a.isSubmitted ? badge('Submitted', 'success') : badge('In progress', 'warning'));

async function adminAttempts(ctx) {
  ctx.header({ title: 'Exam attempts', description: 'Monitor student attempts. Submitted attempts are read-only.' });
  ctx.html(loading());
  await mountList(ctx, {
    path: () => '/api/ExamAttempts',
    clientSide: true,
    state: { search: '', course: ctx.query.course || '', status: '' },
    prepare: async () => ({ courses: await courses.all() }),
    toolbar: (s, l) => html`${searchField(s, 'Student or course')}
      ${filterSelect('course', 'Course', (l.courses || []).map((c) => ({ value: c.id, label: c.courseCode })), s, 'All courses')}
      ${filterSelect('status', 'Status', [{ value: 'submitted', label: 'Submitted' }, { value: 'open', label: 'In progress' }], s, 'All statuses')}`,
    filtering: () => true,
    predicate: (s) => (a) =>
      (!s.search.trim() || includesText(`${a.studentName} ${a.courseCode} ${a.courseTitle}`, s.search))
      && (!s.course || a.courseId === s.course)
      && (!s.status || (s.status === 'submitted') === Boolean(a.isSubmitted)),
    transform: (items) => [...items].sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt)),
    renderItems: (items) => table([
      { label: 'Student', render: (a) => html`<span class="cell-title">${a.studentName}</span>` },
      { label: 'Course', render: (a) => html`${a.courseCode}<div class="cell-sub">${a.courseTitle}</div>` },
      { label: 'Status', render: statusBadge },
      { label: 'Started', render: (a) => fmtDateTime(a.startedAt) },
      { label: 'Submitted', render: (a) => fmtDateTime(a.submittedAt) },
      { label: 'Score', className: 'num', render: (a) => (a.isSubmitted && a.score != null ? a.score : '—') },
      { label: '', className: 'cell-actions', render: (a) => html`<a class="btn btn--secondary btn--sm" href="#/admin/attempts/${a.id}">View</a>` },
    ], items, { caption: 'Exam attempts' }),
    empty: { icon: 'timer', title: 'No attempts yet', text: 'Attempts appear when students start an exam.' },
  });
}

async function adminAttemptDetails(ctx) {
  const id = ctx.params.id;
  ctx.header({ title: 'Attempt', crumbs: [{ label: 'Exam attempts', href: '/admin/attempts' }, { label: 'Details' }] });
  ctx.html(loading());
  let a;
  try { a = await attempts.get(id); } catch (err) { ctx.html(html`<div class="card">${errorState(err, { retry: false })}</div>`); return; }
  const ans = await settle(answers.byAttempt(id));
  if (!ctx.alive()) return;
  ctx.header({ title: `${a.studentName} · ${a.courseCode}`, crumbs: [{ label: 'Exam attempts', href: '/admin/attempts' }, { label: 'Details' }],
    actions: a.isSubmitted ? html`<button type="button" class="btn btn--primary" data-generate>${icon('award')} Generate result</button>` : '' });

  ctx.html(html`<div class="stack">
    <section class="card"><div class="card__body">${dl([
      ['Student', html`<a href="#/admin/students/${a.studentId}">${a.studentName}</a>`],
      ['Course', html`<a href="#/admin/courses/${a.courseId}">${a.courseCode} · ${a.courseTitle}</a>`],
      ['Status', statusBadge(a)], ['Started', fmtDateTime(a.startedAt)], ['Submitted', fmtDateTime(a.submittedAt)],
      ['Score', a.isSubmitted && a.score != null ? a.score : '—'], ['Attempt ID', html`<code>${a.id}</code>`],
    ])}</div></section>
    <section class="card card--flush"><div class="card__header"><h2>Answers</h2></div>
      ${ans.error ? errorState(ans.error, { retry: false }) : ans.value.length ? html`<div class="answer-review">${ans.value.map((x, i) => html`<div class="answer-review__item"><strong>${i + 1}. ${x.questionText}</strong><div class="row"><span>Selected: <b>${x.selectedAnswer || '—'}</b></span>${x.isCorrect ? badge('Correct', 'success') : badge('Incorrect', 'error')}</div></div>`)}</div>`
      : emptyState({ icon: 'inbox', title: 'No answers recorded' })}</section>
    <p class="dash-note">Submitted attempts cannot be edited.</p>
  </div>`);

  // Header button lives outside the page body; remove the listener on navigation.
  const header = document.getElementById('page-header');
  const onClick = async (e) => {
    const btn = e.target.closest('[data-generate]');
    if (!btn) return;
    btn.disabled = true;
    try {
      const r = await results.generate(id);
      toast('Result generated.', { type: 'success' });
      location.hash = `/admin/results/${r.id}`;
    } catch (err) { toastError(err, 'The result could not be generated.'); btn.disabled = false; }
  };
  header.addEventListener('click', onClick);
  return () => header.removeEventListener('click', onClick);
}

async function studentHistory(ctx) {
  const sid = ctx.session.studentId;
  ctx.header({ title: 'Exam history', description: 'Every exam you have started, with its submission status.' });
  ctx.html(loading());
  const load = async () => {
    const [att, res] = await Promise.all([settle(attempts.byStudent(sid)), settle(results.byStudent(sid))]);
    if (!ctx.alive()) return;
    if (att.error) { ctx.html(html`<div class="card">${errorState(att.error)}</div>`); return; }
    if (!att.value.length) { ctx.html(html`<div class="card">${emptyState({ icon: 'history', title: 'No exams taken yet', text: 'Your attempts will be listed here.', action: { label: 'Available exams', href: '#/student/exams' } })}</div>`); return; }
    const rows = [...att.value].sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
    const resFor = (a) => (res.error ? null : res.value.find((r) => r.courseId === a.courseId));
    ctx.html(html`<div class="card card--flush">${table([
      { label: 'Course', render: (a) => html`<span class="cell-title">${a.courseCode}</span><div class="cell-sub">${a.courseTitle}</div>` },
      { label: 'Started', render: (a) => fmtDateTime(a.startedAt) },
      { label: 'Submitted', render: (a) => fmtDateTime(a.submittedAt) },
      { label: 'Status', render: statusBadge },
      { label: 'Result', render: (a) => { if (!a.isSubmitted) return '—'; const r = resFor(a); return r ? html`<a href="#/student/results/${r.id}">View result</a>` : badge('Not available yet', 'neutral'); } },
      { label: '', className: 'cell-actions', render: (a) => (a.isSubmitted ? '' : html`<a class="btn btn--primary btn--sm" href="#/student/take/${a.id}">Resume</a>`) },
    ], rows, { caption: 'Exam history' })}</div>`);
  };
  delegate(ctx.root, 'click', '[data-action="retry"]', load);
  await load();
}

export const attemptRoutes = [
  { path: '/admin/attempts', role: 'admin', title: 'Exam attempts', render: adminAttempts },
  { path: '/admin/attempts/:id', role: 'admin', title: 'Attempt', render: adminAttemptDetails },
  { path: '/student/history', role: 'student', title: 'Exam history', render: studentHistory },
];
