/** Admin and student overview dashboards. Only real API data is shown. */
import { html } from '../html.js';
import { api, fetchAllPages } from '../api.js';
import { statCard, table, badge, barList, errorState, loading, alertBox, icon, emptyState } from '../components.js';
import { fmtNum, fmtDateTime, fullName, uniqueSorted, delegate } from '../utils.js';
import { students, courses, enrollments, questions, attempts, results, examStatus, settle } from '../services.js';
import { gradeDistribution, provisionalGpa } from '../grades.js';

const count = (path) => api.get(path, { pageNumber: 1, pageSize: 1 }).then((e) => e.data?.totalCount ?? 0);
const val = (s, fmt = fmtNum) => (s.error ? html`<span title="Unavailable: ${s.error.message}">—</span>` : fmt(s.value));

async function adminDashboard(ctx) {
  ctx.header({
    title: 'Overview',
    description: 'A live summary of students, courses, examinations and results.',
    actions: html`<a class="btn btn--primary" href="#/admin/courses/new">${icon('plus')} New course</a>`,
  });
  ctx.html(loading('Loading overview…'));

  const load = async () => {
    const [stu, crs, enr, que, att, res] = await Promise.all([
      settle(count('/api/Students')), settle(count('/api/Courses')), settle(count('/api/Enrollments')),
      settle(questions.all()), settle(attempts.allMeta()), settle(results.allMeta()),
    ]);
    if (!ctx.alive()) return;

    const examCourses = que.error ? null : new Set(que.value.map((q) => q.courseId)).size;
    const attemptItems = att.error ? [] : att.value.items;
    const completed = att.error ? null : attemptItems.filter((a) => a.isSubmitted).length;
    const resultItems = res.error ? [] : res.value.items;
    const truncated = att.value?.truncated || res.value?.truncated;

    const recentAttempts = [...attemptItems].sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt)).slice(0, 5);
    const dist = gradeDistribution(resultItems);

    const byCourse = new Map();
    for (const r of resultItems) {
      const key = r.courseCode || r.courseTitle || r.courseId;
      const e = byCourse.get(key) || { sum: 0, n: 0 };
      e.sum += r.percentage || 0; e.n += 1; byCourse.set(key, e);
    }
    const avgByCourse = [...byCourse.entries()].map(([label, e]) => ({ label, value: e.sum / e.n, display: `${fmtNum(e.sum / e.n)}%` }))
      .sort((a, b) => b.value - a.value).slice(0, 8);

    ctx.html(html`<div class="stack">
      <section class="grid grid--stats" aria-label="Summary">
        ${statCard({ icon: 'users', label: 'Students', value: val(stu), href: '#/admin/students' })}
        ${statCard({ icon: 'book-open', label: 'Courses', value: val(crs), href: '#/admin/courses' })}
        ${statCard({ icon: 'clipboard-list', label: 'Enrollments', value: val(enr), href: '#/admin/enrollments' })}
        ${statCard({ icon: 'clipboard-check', label: 'Exams ready', value: examCourses == null ? '—' : fmtNum(examCourses, 0), hint: que.error ? 'Questions unavailable' : `${fmtNum(que.value.length, 0)} questions across courses`, href: '#/admin/exams' })}
        ${statCard({ icon: 'timer', label: 'Completed attempts', value: completed == null ? '—' : fmtNum(completed, 0), hint: att.error ? 'Unavailable' : `of ${fmtNum(att.value.totalCount, 0)} started`, href: '#/admin/attempts' })}
        ${statCard({ icon: 'award', label: 'Results generated', value: res.error ? '—' : fmtNum(res.value.totalCount, 0), href: '#/admin/results' })}
      </section>

      <section class="card" aria-labelledby="qa">
        <div class="card__header"><h2 id="qa">Quick actions</h2></div>
        <div class="card__body dash-actions">
          <a class="btn btn--primary" href="#/admin/courses/new">${icon('plus')} Create a course</a>
          <a class="btn btn--secondary" href="#/admin/questions/new">${icon('circle-help')} Create questions</a>
          <a class="btn btn--secondary" href="#/admin/exams">${icon('clipboard-check')} Set up an exam</a>
        </div>
      </section>

      <div class="grid grid--2">
        <section class="card" aria-labelledby="gd">
          <div class="card__header"><h2 id="gd">Grade distribution</h2></div>
          <div class="card__body">${res.error ? errorState(res.error, { retry: false }) : dist.length ? barList(dist) : emptyState({ icon: 'chart-bar', title: 'No results yet', text: 'Grades will appear here once results are generated.' })}</div>
        </section>
        <section class="card" aria-labelledby="ap">
          <div class="card__header"><h2 id="ap">Average score by course</h2></div>
          <div class="card__body">${avgByCourse.length ? barList(avgByCourse, { max: 100 }) : emptyState({ icon: 'chart-bar', title: 'No results yet', text: 'Averages will appear once results exist.' })}</div>
        </section>
      </div>

      <section class="card card--flush" aria-labelledby="ra">
        <div class="card__header"><h2 id="ra">Recent exam attempts</h2><a class="btn btn--secondary btn--sm" href="#/admin/attempts">View all</a></div>
        <div class="card__body">${att.error ? errorState(att.error, { retry: false })
          : recentAttempts.length ? table([
            { label: 'Student', render: (a) => html`<span class="cell-title">${a.studentName || '—'}</span>` },
            { label: 'Course', render: (a) => `${a.courseCode || ''} ${a.courseTitle ? '· ' + a.courseTitle : ''}` },
            { label: 'Started', render: (a) => fmtDateTime(a.startedAt) },
            { label: 'Status', render: (a) => (a.isSubmitted ? badge('Submitted', 'success') : badge('In progress', 'warning')) },
            { label: '', className: 'cell-actions', render: (a) => html`<a class="btn btn--secondary btn--sm" href="#/admin/attempts/${a.id}">View</a>` },
          ], recentAttempts, { caption: 'Most recent exam attempts' })
          : emptyState({ icon: 'timer', title: 'No attempts yet', text: 'Attempts appear here when students start an exam.' })}</div>
      </section>

            ${truncated ? html`<p class="dash-note">${icon('info')} Large lists are limited to the first records loaded, so some totals may be partial.</p>` : ''}
    </div>`);
  };

  delegate(ctx.root, 'click', '[data-action="retry"]', load);
  await load();
}

async function studentDashboard(ctx) {
  const sid = ctx.session.studentId;
  ctx.header({ title: 'Overview', description: 'Courses you enrolled for, examinations and results at a glance.' });
  ctx.html(loading('Loading your overview…'));

  const [enr, att, res, crs] = await Promise.all([
    settle(enrollments.mine(sid)), settle(attempts.byStudent(sid)), settle(results.byStudent(sid)), settle(courses.all()),
  ]);
  if (!ctx.alive()) return;

  if (enr.error && att.error && res.error) { ctx.html(html`<div class="card">${errorState(enr.error, { retry: false })}</div>`); return; }

  const myEnr = enr.value || [];
  const myAtt = att.value || [];
  const myRes = res.value || [];
  const credits = (crs.value || []);
  const creditOf = (id) => credits.find((c) => c.id === id)?.creditUnit;
  const totalCredits = myEnr.reduce((s, e) => s + (creditOf(e.courseId) || 0), 0);

  const statuses = myEnr.map((e) => ({ e, ...examStatus(myAtt, e.courseId) }));
  const inProgress = statuses.filter((s) => s.state === 'in-progress');
  const pending = statuses.filter((s) => s.state === 'available').length;
  const completed = statuses.filter((s) => s.state === 'completed').length;
  const gpa = provisionalGpa(myRes);

  ctx.html(html`<div class="stack">
    ${enr.error || att.error || res.error ? alertBox('warning', 'Some information could not be loaded and is shown as unavailable.') : ''}
    <section class="grid grid--stats" aria-label="Summary">
      ${statCard({ icon: 'book-marked', label: 'Enrolled courses', value: enr.error ? '—' : fmtNum(myEnr.length, 0), hint: crs.error ? '' : `${fmtNum(totalCredits, 0)} credit units`, href: '#/student/my-courses' })}
      ${statCard({ icon: 'pencil-line', label: 'Exams to take', value: att.error || enr.error ? '—' : fmtNum(pending + inProgress.length, 0), hint: inProgress.length ? `${inProgress.length} in progress` : '', href: '#/student/exams' })}
      ${statCard({ icon: 'circle-check', label: 'Exams completed', value: att.error ? '—' : fmtNum(completed, 0), href: '#/student/history' })}
      ${statCard({ icon: 'award', label: 'Results available', value: res.error ? '—' : fmtNum(myRes.length, 0), href: '#/student/results' })}
      ${statCard({ icon: 'trending-up', label: 'CGPA ', value: gpa ? fmtNum(gpa.gpa, 2) : '—', hint: gpa ? 'Cumulative GPA ' : 'No graded results yet', href: '#/student/performance' })}
    </section>

    ${inProgress.length ? alertBox('gold', html`You have ${inProgress.length} exam${inProgress.length > 1 ? 's' : ''} in progress: ${inProgress.map((s, i) => html`${i ? ', ' : ''}<a href="#/student/take/${s.attempt.id}">${s.attempt.courseCode || 'Resume'}</a>`)}.`, { title: 'Resume your exam.' }) : ''}

    <div class="grid grid--2">
      <section class="card card--flush" aria-labelledby="mc">
        <div class="card__header"><h2 id="mc">My courses</h2><a class="btn btn--secondary btn--sm" href="#/student/courses">Browse courses</a></div>
        ${enr.error ? errorState(enr.error, { retry: false })
          : myEnr.length ? html`<ul class="list">${myEnr.slice(0, 6).map((e) => html`<li class="list__item"><div><div class="list__title">${e.courseCode}</div><div class="list__meta">${e.courseTitle}</div></div><a class="btn btn--secondary btn--sm" href="#/student/courses/${e.courseId}">View</a></li>`)}</ul>`
          : emptyState({ icon: 'book-open', title: 'No courses yet', text: 'Enroll in a course to unlock its examination.', action: { label: 'Browse courses', href: '#/student/courses' } })}
      </section>
      <section class="card card--flush" aria-labelledby="lr">
        <div class="card__header"><h2 id="lr">My results</h2><a class="btn btn--secondary btn--sm" href="#/student/results">View all</a></div>
        ${res.error ? errorState(res.error, { retry: false })
          : myRes.length ? html`<ul class="list">${myRes.slice(0, 6).map((r) => html`<li class="list__item"><div><div class="list__title">${r.courseCode}</div><div class="list__meta">${r.courseTitle}</div></div><div class="row"><span class="grade-pill" aria-label="Grade ${r.grade}">${r.grade || '—'}</span><a class="btn btn--secondary btn--sm" href="#/student/results/${r.id}">Open</a></div></li>`)}</ul>`
          : emptyState({ icon: 'award', title: 'No results yet', text: 'Results appear here after your exams are marked.' })}
      </section>
    </div>
  </div>`);
}

export const dashboardRoutes = [
  { path: '/admin', role: 'admin', title: 'Admin overview', render: adminDashboard },
  { path: '/student', role: 'student', title: 'Overview', render: studentDashboard },
];
