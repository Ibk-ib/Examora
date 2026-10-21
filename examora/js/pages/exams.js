/**
 * Exams. The API has no Exam entity: a course's exam is its set of questions, and a
 * student's "exam" is an ExamAttempt for that course. These pages present that model honestly.
 */
import { html } from '../html.js';
import { icon, badge, table, loading, errorState, emptyState, alertBox, toast, toastError, dl } from '../components.js';
import { mountList, searchField, filterSelect } from '../listing.js';
import { courses, questions, attempts, enrollments, examStatus, findOpenAttempt, settle } from '../services.js';
import { navigate } from '../router.js';
import { delegate, includesText, groupBy, fmtNum, fmtDateTime } from '../utils.js';
import { setBusy } from '../validation.js';

/* ---------------- Admin ---------------- */
async function adminExams(ctx) {
  ctx.header({
    title: 'Exams',
    description: 'Each course has one examination, made up of its questions. Add or edit questions to configure it.',
    actions: html`<a class="btn btn--primary" href="#/admin/questions/new">${icon('plus')} Add exam questions</a>`,
  });
  ctx.html(loading());
  const list = await mountList(ctx, {
    path: () => '/api/Courses',
    clientSide: true,
    state: { search: '', status: '' },
    prepare: async () => {
      const [q, a] = await Promise.all([settle(questions.all()), settle(attempts.all())]);
      return {
        qErr: q.error, aErr: a.error,
        qBy: q.error ? null : groupBy(q.value, (x) => x.courseId),
        aBy: a.error ? null : groupBy(a.value, (x) => x.courseId),
      };
    },
    toolbar: (s, l) => html`${searchField(s, 'Course code or title')}
      ${filterSelect('status', 'Status', [{ value: 'ready', label: 'Ready (has questions)' }, { value: 'empty', label: 'No questions' }], s, 'All statuses')}`,
    filtering: () => true,
    predicate: (s, l) => (c) => {
      const n = l.qBy ? (l.qBy.get(c.id) || []).length : null;
      return (!s.search.trim() || includesText(`${c.courseCode} ${c.courseTitle}`, s.search))
        && (!s.status || n === null || (s.status === 'ready' ? n > 0 : n === 0));
    },
    renderItems: (items, s, l) => html`
      ${l.qErr || l.aErr ? html`<div style="padding:16px 20px">${alertBox('warning', 'Some figures could not be loaded and are shown as “—”.')}</div>` : ''}
      ${table([
        { label: 'Course', render: (c) => html`<span class="cell-title">${c.courseCode}</span><div class="cell-sub">${c.courseTitle}</div>` },
        { label: 'Questions', className: 'num', render: (c) => (l.qBy ? (l.qBy.get(c.id) || []).length : '—') },
        { label: 'Total marks', className: 'num', render: (c) => (l.qBy ? fmtNum((l.qBy.get(c.id) || []).reduce((t, q) => t + (q.marks || 0), 0)) : '—') },
        { label: 'Attempts', className: 'num', render: (c) => { if (!l.aBy) return '—'; const a = l.aBy.get(c.id) || []; return `${a.filter((x) => x.isSubmitted).length} submitted / ${a.length}`; } },
        { label: 'Status', render: (c) => { if (!l.qBy) return badge('Unknown', 'neutral'); return (l.qBy.get(c.id) || []).length ? badge('Ready', 'success') : badge('No questions', 'warning'); } },
        {
          label: '', className: 'cell-actions',
          render: (c) => html`<a class="btn btn--secondary btn--sm" href="#/admin/exams/${c.id}">Details</a><a class="btn btn--secondary btn--sm" href="#/admin/questions/new?course=${c.id}">Add question</a>`,
        },
      ], items, { caption: 'Course examinations' })}
            <p class="list-note">Students can take an exam once its course has questions.</p>`,
    empty: { icon: 'clipboard-check', title: 'No courses yet', text: 'Create a course, then add questions to set up its exam.', action: { label: 'New course', href: '#/admin/courses/new' } },
  });
  if (!list) return;
}

async function adminExamDetails(ctx) {
  const id = ctx.params.courseId;
  ctx.header({ title: 'Exam', crumbs: [{ label: 'Exams', href: '/admin/exams' }, { label: 'Details' }] });
  ctx.html(loading());
  let c;
  try { c = await courses.get(id); } catch (err) { ctx.html(html`<div class="card">${errorState(err, { retry: false })}</div>`); return; }
  const [qs, att] = await Promise.all([settle(questions.byCourse(id)), settle(attempts.all().then((a) => a.filter((x) => x.courseId === id)))]);
  if (!ctx.alive()) return;
  const totalMarks = qs.error ? null : qs.value.reduce((t, q) => t + (q.marks || 0), 0);

  ctx.header({
    title: `${c.courseCode} exam`,
    description: c.courseTitle,
    crumbs: [{ label: 'Exams', href: '/admin/exams' }, { label: c.courseCode }],
    actions: html`<a class="btn btn--primary" href="#/admin/questions/new?course=${id}">${icon('plus')} Add question</a>`,
  });
  ctx.html(html`<div class="stack">
    <section class="card"><div class="card__body">${dl([
      ['Course', html`<a href="#/admin/courses/${id}">${c.courseCode} · ${c.courseTitle}</a>`],
      ['Questions', qs.error ? '—' : qs.value.length], ['Total marks', totalMarks == null ? '—' : fmtNum(totalMarks)],
      ['Status', qs.error ? badge('Unknown', 'neutral') : qs.value.length ? badge('Ready', 'success') : badge('No questions', 'warning')],
    ])}</div></section>
    <section class="card card--flush"><div class="card__header"><h2>Questions</h2></div>${qs.error ? errorState(qs.error, { retry: false }) : qs.value.length ? table([
      { label: '#', className: 'num', render: (q) => qs.value.indexOf(q) + 1 },
      { label: 'Question', render: (q) => html`<div class="cell-clamp">${q.questionText}</div>` },
      { label: 'Marks', className: 'num', render: (q) => fmtNum(q.marks) },
      { label: '', className: 'cell-actions', render: (q) => html`<a class="btn btn--secondary btn--sm" href="#/admin/questions/${q.id}/edit">Edit</a>` },
    ], qs.value, { caption: 'Questions' }) : emptyState({ icon: 'circle-help', title: 'No questions yet', text: 'Students cannot take this exam until it has questions.', action: { label: 'Add question', href: `#/admin/questions/new?course=${id}` } })}</section>
    <section class="card card--flush"><div class="card__header"><h2>Attempts</h2><a class="btn btn--secondary btn--sm" href="#/admin/attempts?course=${id}">View all</a></div>${att.error ? errorState(att.error, { retry: false }) : att.value.length ? table([
      { label: 'Student', render: (a) => a.studentName },
      { label: 'Started', render: (a) => fmtDateTime(a.startedAt) },
      { label: 'Status', render: (a) => (a.isSubmitted ? badge('Submitted', 'success') : badge('In progress', 'warning')) },
      { label: '', className: 'cell-actions', render: (a) => html`<a class="btn btn--secondary btn--sm" href="#/admin/attempts/${a.id}">View</a>` },
    ], att.value.slice(0, 10), { caption: 'Attempts' }) : emptyState({ icon: 'timer', title: 'No attempts yet' })}</section>
  </div>`);
}

/* ---------------- Student ---------------- */
async function availableExams(ctx) {
  const sid = ctx.session.studentId;
  ctx.header({ title: 'Available exams', description: 'Examinations for courses you are enrolled in.' });
  ctx.html(loading());

  const load = async () => {
    const [enr, att] = await Promise.all([settle(enrollments.mine(sid)), settle(attempts.byStudent(sid))]);
    if (!ctx.alive()) return;
    if (enr.error) { ctx.html(html`<div class="card">${errorState(enr.error)}</div>`); return; }
    if (!enr.value.length) {
      ctx.html(html`<div class="card">${emptyState({ icon: 'pencil-line', title: 'No exams yet', text: 'You must enroll in a course before you can take its exam.', action: { label: 'Browse courses', href: '#/student/courses' } })}</div>`);
      return;
    }
    const counts = await Promise.all(enr.value.map((e) => settle(questions.countForCourse(e.courseId))));
    if (!ctx.alive()) return;
    const rows = enr.value.map((e, i) => ({ e, q: counts[i], st: att.error ? null : examStatus(att.value, e.courseId) }));

    ctx.html(html`<div class="stack">
      ${att.error ? alertBox('warning', 'Your exam history could not be loaded, so exams can’t be started right now.') : ''}
      <div class="grid grid--cards">${rows.map(({ e, q, st }) => {
        const qn = q.error ? null : q.value;
        let status; let action;
        if (!st) { status = badge('Unavailable', 'neutral'); action = ''; }
        else if (st.state === 'in-progress') { status = badge('In progress', 'warning'); action = html`<a class="btn btn--primary btn--sm" href="#/student/take/${st.attempt.id}">Resume exam</a>`; }
        else if (st.state === 'completed') { status = badge('Completed', 'success'); action = html`<a class="btn btn--secondary btn--sm" href="#/student/history">View history</a>`; }
        else if (qn === null) { status = badge('Unavailable', 'neutral'); action = ''; }
        else if (qn === 0) { status = badge('No questions yet', 'neutral'); action = ''; }
        else { status = badge('Available', 'gold'); action = html`<a class="btn btn--primary btn--sm" href="#/student/exams/${e.courseId}/instructions">Start exam</a>`; }
        return html`<article class="card course-card">
          <div class="row row--between"><span class="course-card__code">${e.courseCode}</span>${status}</div>
          <h3>${e.courseTitle}</h3>
          <div class="course-card__meta"><span class="chip">${qn === null ? 'Questions: unknown' : `${qn} question${qn === 1 ? '' : 's'}`}</span><span class="chip">Enrolled</span></div>
          <div class="course-card__actions">${action}<a class="btn btn--secondary btn--sm" href="#/student/courses/${e.courseId}">Course</a></div>
        </article>`;
      })}</div>
    </div>`);
  };
  delegate(ctx.root, 'click', '[data-action="retry"]', load);
  await load();
}

async function examInstructions(ctx) {
  const sid = ctx.session.studentId;
  const courseId = ctx.params.courseId;
  ctx.header({ title: 'Exam instructions', crumbs: [{ label: 'Available exams', href: '/student/exams' }, { label: 'Instructions' }] });
  ctx.html(loading());

  let c; let enr; let att; let qn;
  try {
    c = await courses.get(courseId);
    [enr, att, qn] = await Promise.all([settle(enrollments.mine(sid)), settle(attempts.byStudent(sid)), settle(questions.countForCourse(courseId))]);
  } catch (err) { ctx.html(html`<div class="card">${errorState(err, { retry: false })}</div>`); return; }
  if (!ctx.alive()) return;

  const enrolled = !enr.error && enr.value.some((e) => e.courseId === courseId);
  const st = att.error ? null : examStatus(att.value, courseId);
  ctx.header({ title: `${c.courseCode} exam`, description: c.courseTitle, crumbs: [{ label: 'Available exams', href: '/student/exams' }, { label: 'Instructions' }] });

  const blocked = (title, text, action) => ctx.html(html`<div class="card">${emptyState({ icon: 'lock', title, text, action })}</div>`);
  if (enr.error || att.error) { ctx.html(html`<div class="card">${errorState(enr.error || att.error, { retry: false })}</div>`); return; }
  if (!enrolled) { blocked('Enrollment required', 'You must enroll in this course before taking its exam.', { label: 'Go to the course', href: `#/student/courses/${courseId}` }); return; }
  if (st.state === 'completed') { blocked('You have already taken this exam', 'Your submission has been recorded.', { label: 'View exam history', href: '#/student/history' }); return; }
  if (st.state === 'in-progress') { blocked('You have an exam in progress', 'Pick up where you left off. Your saved answers are kept.', { label: 'Resume exam', href: `#/student/take/${st.attempt.id}` }); return; }
  if (qn.error) { ctx.html(html`<div class="card">${errorState(qn.error, { retry: false })}</div>`); return; }
  if (qn.value === 0) { blocked('This exam has no questions yet', 'Please check back later.', { label: 'Back to exams', href: '#/student/exams' }); return; }

  ctx.html(html`<div class="stack" style="max-width:820px">
    <section class="card"><div class="card__header"><h2>${c.courseCode} · ${c.courseTitle}</h2>${badge('Enrolled', 'success')}</div>
      <div class="card__body">${dl([['Questions', qn.value], ['Credit units', c.creditUnit]])}</div></section>
    <section class="card"><div class="card__header"><h2>Before you begin</h2></div><div class="card__body">
      <ul class="instructions">
        <li>${icon('check')}<span>Each question is multiple choice. Choose one option per question.</span></li>
        <li>${icon('check')}<span>Choose an answer for each question. You can move freely between questions and change any answer until you submit.</span></li>
        <li>${icon('check')}<span>If you leave, you can resume the exam later from <em>Available exams</em>. → Your choices are kept in this browser tab only. Don't close the tab before you submit.</span></li>
        <li>${icon('check')}<span>Submit when you are finished. You will be warned about unanswered questions. Your result is calculated after you submit.</span></li>
      </ul></div></section>
    <form class="card" id="start-form"><div class="card__body">
      <label class="check"><input type="checkbox" id="confirm-start"> I have read the instructions and I am ready to begin.</label>
      <div class="form-actions" style="margin-top:16px"><a class="btn btn--secondary" href="#/student/exams">Back</a><button type="submit" class="btn btn--primary" id="start-btn" disabled>Start exam</button></div>
    </div></form>
  </div>`);

  const form = ctx.root.querySelector('#start-form');
  const chk = form.querySelector('#confirm-start');
  const btn = form.querySelector('#start-btn');
  chk.addEventListener('change', () => { btn.disabled = !chk.checked; });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!chk.checked) return;
    setBusy(btn, true, 'Starting…');
    try {
      let open = null;
      try {
        await attempts.create({ studentId: sid, courseId });
      } catch (err) {
        // 409: the server says an attempt already exists. Resume it if it is still open.
        if (err.status !== 409) throw err;
        open = await findOpenAttempt(sid, courseId);
        if (!open) throw err;
        toast('You already have an attempt for this exam. Resuming it.', { type: 'info' });
      }
      open ??= await findOpenAttempt(sid, courseId);
      if (!open) throw new Error('The exam was created but could not be located. Open Available exams and choose Resume.');
      navigate(`/student/take/${open.id}`);
    } catch (err) { toastError(err, 'The exam could not be started.'); setBusy(btn, false); btn.disabled = !chk.checked; }
  });
}

export const examRoutes = [
  { path: '/admin/exams', role: 'admin', title: 'Exams', render: adminExams },
  { path: '/admin/exams/:courseId', role: 'admin', title: 'Exam', render: adminExamDetails },
  { path: '/student/exams', role: 'student', title: 'Available exams', render: availableExams },
  { path: '/student/exams/:courseId/instructions', role: 'student', title: 'Exam instructions', render: examInstructions },
];
