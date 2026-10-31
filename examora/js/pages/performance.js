
import { html } from '../html.js';
import { icon, table, loading, errorState, emptyState, barList, lineChart } from '../components.js';
import { results, attempts, settle } from '../services.js';
import { provisionalGpa, gradeDistribution, scoreText, degreeClass, fmtGpa } from '../grades.js';
import { fmtNum, fmtDate, delegate } from '../utils.js';

async function performance(ctx) {
  const sid = ctx.session.studentId;
  ctx.header({ title: 'Academic performance', description: 'Your cumulative GPA, course results and examination history.' });
  ctx.html(loading());
  const load = async () => {
    const [res, att] = await Promise.all([settle(results.byStudent(sid)), settle(attempts.byStudent(sid))]);
    if (!ctx.alive()) return;
    if (res.error) { ctx.html(html`<div class="card">${errorState(res.error)}</div>`); return; }
    if (!res.value.length) { ctx.html(html`<div class="card">${emptyState({ icon: 'trending-up', title: 'No performance data yet', text: 'Complete an exam and wait for its result to see your progress here.', action: { label: 'Available exams', href: '#/student/exams' } })}</div>`); return; }

    const gpa = provisionalGpa(res.value);
    const submitted = att.error ? [] : att.value.filter((a) => a.isSubmitted);
    const dateFor = (r) => submitted.filter((a) => a.courseId === r.courseId).sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt))[0]?.submittedAt;
    const trend = res.value.map((r) => ({ r, d: dateFor(r) })).filter((x) => x.d && Number.isFinite(x.r.percentage))
      .sort((a, b) => new Date(a.d) - new Date(b.d)).map((x) => ({ label: x.r.courseCode, value: x.r.percentage }));

    ctx.html(html`<div class="stack">
        <div class="print-only"><h2>Examora · Academic record</h2><p>Matric number: ${ctx.session.matricNumber || '—'} · Printed ${new Date().toLocaleDateString()}</p></div>
        <section class="card"><div class="card__header"><h2>Cumulative GPA (CGPA)</h2><button type="button" class="btn btn--secondary btn--sm" data-print>${icon('printer')} Print</button></div><div class="card__body stack stack--sm">
        ${gpa ? html`<div class="gpa"><span class="gpa__value">${fmtGpa(gpa.gpa)}</span><span class="gpa__scale">across ${gpa.courses} course${gpa.courses === 1 ? '' : 's'} · ${gpa.credits} credit units</span></div>` : html`<p class="muted">Your CGPA will appear once your results include grade points and credit units.</p>`}
      </div></section>
      <div class="grid grid--2">
        <section class="card"><div class="card__header"><h2>Grade distribution</h2></div><div class="card__body">${barList(gradeDistribution(res.value))}</div></section>
        <section class="card"><div class="card__header"><h2>Performance trend</h2></div><div class="card__body">${trend.length >= 2 ? lineChart(trend) : html`<p class="muted">At least two dated results are needed to show a trend.</p>`}</div></section>
      </div>
      <section class="card card--flush"><div class="card__header"><h2>Course-by-course</h2></div>${table([
        { label: 'Course', render: (r) => html`<span class="cell-title">${r.courseCode}</span><div class="cell-sub">${r.courseTitle}</div>` },
        { label: 'Score', className: 'num', render: scoreText },
        { label: '%', className: 'num', render: (r) => `${fmtNum(r.percentage)}%` },
        { label: 'Grade', render: (r) => html`<span class="grade-pill">${r.grade || '—'}</span>` },
        { label: 'Grade point', className: 'num', render: (r) => fmtNum(r.gradePoint, 2) },
        { label: 'Credit units', className: 'num', render: (r) => r.creditUnit },
        { label: 'Quality points', className: 'num', render: (r) => (Number.isFinite(r.gradePoint) && r.creditUnit > 0 ? fmtNum(r.gradePoint * r.creditUnit, 2) : '—') },
        { label: '', className: 'cell-actions', render: (r) => html`<a class="btn btn--secondary btn--sm" href="#/student/results/${r.id}">Details</a>` },
      ], res.value, { caption: 'Course results' })}</section>
      <section class="card card--flush"><div class="card__header"><h2>Examination history</h2><a class="btn btn--secondary btn--sm" href="#/student/history">Full history</a></div>${att.error ? errorState(att.error, { retry: false }) : submitted.length ? table([
        { label: 'Course', render: (a) => `${a.courseCode} · ${a.courseTitle}` },
        { label: 'Submitted', render: (a) => fmtDate(a.submittedAt) },
      ], submitted.slice(0, 8), { caption: 'Submitted exams' }) : emptyState({ icon: 'history', title: 'No submitted exams' })}</section>
    </div>`);
  };
  delegate(ctx.root, 'click', '[data-action="retry"]', load);
  delegate(ctx.root, 'click', '[data-print]', () => window.print());
  await load();
}

export const performanceRoutes = [{ path: '/student/performance', role: 'student', title: 'Academic performance', render: performance }];
