/** Results: admin management and student results, plus result details. Values come from the API. */
import { html } from '../html.js';
import { badge, table, loading, errorState, emptyState, dl, alertBox } from '../components.js';
import { mountList, searchField, filterSelect } from '../listing.js';
import { results, attempts, answers, courses, questions, settle } from '../services.js';
import { LETTERS } from '../answers.js';
import { delegate, includesText, uniqueSorted, fmtNum, fmtDate } from '../utils.js';
import { scoreText } from '../grades.js';

const gradePill = (r) => html`<span class="grade-pill" aria-label="Grade ${r.grade || 'none'}">${r.grade || '—'}</span>`;

async function adminResults(ctx) {
  ctx.header({ title: 'Results', description: 'Results generated from submitted examinations.' });
  ctx.html(loading());
  await mountList(ctx, {
    path: () => '/api/Results',
    clientSide: true,
    state: { search: '', course: '', grade: '' },
    prepare: async () => {
      const all = (await results.allMeta()).items;
      return { courses: await courses.all(), grades: uniqueSorted(all.map((r) => r.grade)) };
    },
    toolbar: (s, l) => html`${searchField(s, 'Student or course')}
      ${filterSelect('course', 'Course', (l.courses || []).map((c) => ({ value: c.id, label: c.courseCode })), s, 'All courses')}
      ${filterSelect('grade', 'Grade', (l.grades || []).map((g) => ({ value: g, label: g })), s, 'All grades')}`,
    filtering: () => true,
    predicate: (s) => (r) => (!s.search.trim() || includesText(`${r.studentName} ${r.courseCode} ${r.courseTitle}`, s.search)) && (!s.course || r.courseId === s.course) && (!s.grade || r.grade === s.grade),
    renderItems: (items) => table([
      { label: 'Student', render: (r) => html`<a class="cell-title" href="#/admin/students/${r.studentId}">${r.studentName}</a>` },
      { label: 'Course', render: (r) => html`${r.courseCode}<div class="cell-sub">${r.courseTitle}</div>` },
      { label: 'Score', className: 'num', render: scoreText },
      { label: '%', className: 'num', render: (r) => `${fmtNum(r.percentage)}%` },
      { label: 'Grade', render: gradePill },
      { label: 'Grade point', className: 'num', render: (r) => fmtNum(r.gradePoint, 2) },
      { label: '', className: 'cell-actions', render: (r) => html`<a class="btn btn--secondary btn--sm" href="#/admin/results/${r.id}">View</a>` },
    ], items, { caption: 'Results' }),
    empty: { icon: 'award', title: 'No results yet', text: 'Results appear after they are generated from submitted attempts.' },
  });
}

async function studentResults(ctx) {
  const sid = ctx.session.studentId;
  ctx.header({ title: 'My results', description: 'Scores, grades and grade points for your examinations.' });
  ctx.html(loading());
  const load = async () => {
    const [res, att] = await Promise.all([settle(results.byStudent(sid)), settle(attempts.byStudent(sid))]);
    if (!ctx.alive()) return;
    if (res.error) { ctx.html(html`<div class="card">${errorState(res.error)}</div>`); return; }
    if (!res.value.length) { ctx.html(html`<div class="card">${emptyState({ icon: 'award', title: 'No results yet', text: 'Results appear here once your exams have been marked.' })}</div>`); return; }
    const dateFor = (r) => (att.error ? null : att.value.filter((a) => a.courseId === r.courseId && a.isSubmitted).sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt))[0]?.submittedAt);
    ctx.html(html`<div class="card card--flush">${table([
      { label: 'Course', render: (r) => html`<span class="cell-title">${r.courseCode}</span><div class="cell-sub">${r.courseTitle}</div>` },
      { label: 'Submitted', render: (r) => fmtDate(dateFor(r)) },
      { label: 'Score', className: 'num', render: scoreText },
      { label: 'Grade', render: gradePill },
      { label: 'Grade point', className: 'num', render: (r) => fmtNum(r.gradePoint, 2) },
      { label: 'Credit units', className: 'num', render: (r) => r.creditUnit },
      { label: '', className: 'cell-actions', render: (r) => html`<a class="btn btn--secondary btn--sm" href="#/student/results/${r.id}">Details</a>` },
    ], res.value, { caption: 'My results' })}</div>`);
  };
  delegate(ctx.root, 'click', '[data-action="retry"]', load);
  await load();
}

function describeAnswer(q, value) {
  if (value == null || String(value).trim() === '') return '—';
  const v = String(value).trim().toUpperCase();
  if (q && LETTERS.includes(v)) {
    const text = q[`option${v}`];
    return text ? `${v} · ${text}` : v;
  }
  return String(value);
}

function resultDetails(role) {
  return async (ctx) => {
    const base = role === 'admin' ? '/admin/results' : '/student/results';
    const crumbs = [{ label: role === 'admin' ? 'Results' : 'My results', href: base }, { label: 'Details' }];
    ctx.header({ title: 'Result', crumbs });
    ctx.html(loading());
    let r;
    try { r = await results.get(ctx.params.id); } catch (err) { ctx.html(html`<div class="card">${errorState(err, { retry: false })}</div>`); return; }

    // Answer feedback comes from the matching submitted attempt, when the API allows it.
    const attList = await settle(role === 'admin' ? attempts.all() : attempts.byStudent(ctx.session.studentId));
    const mine = attList.error ? [] : attList.value.filter((a) => a.courseId === r.courseId && a.studentId === r.studentId && a.isSubmitted)
      .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
    const attempt = mine[0];
    const ans = attempt ? await settle(answers.byAttempt(attempt.id)) : null;
    const qs = attempt ? await settle(questions.byCourse(r.courseId)) : null;
    const qById = new Map((qs && !qs.error ? qs.value : []).map((q) => [q.id, q]));
    if (!ctx.alive()) return;

    ctx.header({ title: `${r.courseCode} result`, description: r.courseTitle, crumbs: [{ label: role === 'admin' ? 'Results' : 'My results', href: base }, { label: r.courseCode }] });
    ctx.html(html`<div class="stack">
      <div class="grid grid--stats">
        <div class="card score-tile"><span class="score-tile__label">Score</span><span class="score-tile__value">${scoreText(r)}</span></div>
        <div class="card score-tile"><span class="score-tile__label">Percentage</span><span class="score-tile__value">${fmtNum(r.percentage)}%</span></div>
        <div class="card score-tile"><span class="score-tile__label">Grade</span><span class="score-tile__value">${r.grade || '—'}</span></div>
        <div class="card score-tile"><span class="score-tile__label">Grade point</span><span class="score-tile__value">${fmtNum(r.gradePoint, 2)}</span></div>
      </div>
      <section class="card"><div class="card__body">${dl([
        ['Student', role === 'admin' ? html`<a href="#/admin/students/${r.studentId}">${r.studentName}</a>` : r.studentName],
        ['Course', `${r.courseCode} · ${r.courseTitle}`], ['Credit units', r.creditUnit],
        ['Attempt submitted', attempt ? fmtDate(attempt.submittedAt) : '—'],
      ])}</div></section>
      <section class="card card--flush"><div class="card__header"><h2>Answer feedback</h2></div>
        ${!attempt ? emptyState({ icon: 'inbox', title: 'Feedback unavailable', text: 'The matching attempt could not be found or is not accessible.' })
          : ans.error ? errorState(ans.error, { retry: false })
          : ans.value.length ? html`<div class="answer-review">${ans.value.map((x, i) => {
            const q = qById.get(x.questionId);
            return html`<div class="answer-review__item">
              <strong>${i + 1}. ${x.questionText}</strong>
              <div class="row"><span>Your answer: <b>${describeAnswer(q, x.selectedAnswer)}</b></span>${x.isCorrect ? badge('Correct', 'success') : badge('Incorrect', 'error')}</div>
              ${!x.isCorrect && x.correctAnswer ? html`<div class="row"><span>Correct answer: <b>${describeAnswer(q, x.correctAnswer)}</b></span></div>` : ''}
            </div>`;
          })}</div>`
          : emptyState({ icon: 'inbox', title: 'No answers recorded' })}
      </section>
    </div>`);
  };
}

export const resultRoutes = [
  { path: '/admin/results', role: 'admin', title: 'Results', render: adminResults },
  { path: '/admin/results/:id', role: 'admin', title: 'Result', render: resultDetails('admin') },
  { path: '/student/results', role: 'student', title: 'My results', render: studentResults },
  { path: '/student/results/:id', role: 'student', title: 'Result', render: resultDetails('student') },
];
