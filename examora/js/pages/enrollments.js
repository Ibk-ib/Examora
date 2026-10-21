/** Enrollments: admin management and the student's "My courses". */
import { html } from '../html.js';
import { icon, badge, table, loading, errorState, emptyState, confirmDialog, openDialog, toast, toastError } from '../components.js';
import { mountList, searchField, filterSelect } from '../listing.js';
import { enrollments, courses, students, attempts, questions, examStatus, settle } from '../services.js';
import { selectField, validate, rules, formValues, showFormError, formErrorSlot, setBusy } from '../validation.js';
import { delegate, includesText, fmtDate, fullName } from '../utils.js';

async function adminEnrollments(ctx) {
  ctx.header({
    title: 'Enrollments',
    description: 'See which students are enrolled in which courses.',
    actions: html`<button type="button" class="btn btn--primary" data-action="new-enrollment">${icon('plus')} New enrollment</button>`,
  });
  ctx.html(loading());
  const list = await mountList(ctx, {
    path: () => '/api/Enrollments',
    state: { search: '', course: '' },
    clientSide: true,
    prepare: async () => ({ courses: await courses.all() }),
    toolbar: (s, l) => html`${searchField(s, 'Student or course')}${filterSelect('course', 'Course', (l.courses || []).map((c) => ({ value: c.id, label: c.courseCode })), s, 'All courses')}`,
    filtering: (s) => s.search.trim() || s.course,
    predicate: (s) => (e) => (!s.search.trim() || includesText(`${e.studentName} ${e.courseCode} ${e.courseTitle}`, s.search)) && (!s.course || e.courseId === s.course),
    transform: (items) => [...items].sort((a, b) => new Date(b.enrollmentDate) - new Date(a.enrollmentDate)),
    renderItems: (items) => table([
      { label: 'Student', render: (e) => html`<a class="cell-title" href="#/admin/students/${e.studentId}">${e.studentName}</a>` },
      { label: 'Course', render: (e) => html`<span class="cell-title">${e.courseCode}</span><div class="cell-sub">${e.courseTitle}</div>` },
      { label: 'Enrolled', render: (e) => fmtDate(e.enrollmentDate) },
      { label: '', className: 'cell-actions', render: (e) => html`<button type="button" class="icon-btn icon-btn--row icon-btn--danger" data-delete="${e.id}" data-name="${e.studentName} from ${e.courseCode}" aria-label="Remove ${e.studentName} from ${e.courseCode}" title="Remove enrollment">${icon('trash-2')}</button>` },
    ], items, { caption: 'Enrollments' }),
    empty: { icon: 'clipboard-list', title: 'No enrollments yet', text: 'Enrollments appear when students enroll or you add one.' },
  });
  if (!list) return;

  delegate(ctx.root, 'click', '[data-delete]', async (_e, btn) => {
    const ok = await confirmDialog({ title: 'Remove enrollment?', message: `Remove ${btn.dataset.name}?`, confirmText: 'Remove' });
    if (!ok) return;
    try { const env = await enrollments.remove(btn.dataset.delete); toast(env.message || 'Enrollment removed.', { type: 'success' }); list.reload(); }
    catch (err) { toastError(err); }
  });

  // The header action lives outside the page body, so its listener is removed on navigation.
  const header = document.getElementById('page-header');
  const onHeaderClick = async (e) => {
    if (!e.target.closest('[data-action="new-enrollment"]')) return;
    let studs, crs;
    try { [studs, crs] = await Promise.all([students.all(), courses.all()]); } catch (err) { toastError(err); return; }
    const d = openDialog({
      title: 'New enrollment',
      body: html`<form id="enroll-form" novalidate>${formErrorSlot()}
        ${selectField({ name: 'studentId', label: 'Student', required: true, options: studs.map((s) => ({ value: s.id, label: `${fullName(s)} (${s.matricNumber})` })) })}
        ${selectField({ name: 'courseId', label: 'Course', required: true, options: crs.map((c) => ({ value: c.id, label: `${c.courseCode} · ${c.courseTitle}` })) })}
        <div class="dialog__actions"><button type="button" class="btn btn--secondary" data-dialog-close>Cancel</button><button type="submit" class="btn btn--primary">Enroll student</button></div>
      </form>`,
    });
    const form = d.querySelector('#enroll-form');
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      if (!validate(form, { studentId: [rules.required('Student')], courseId: [rules.required('Course')] })) return;
      const btn = form.querySelector('[type=submit]');
      setBusy(btn, true, 'Enrolling…');
      try {
        const v = formValues(form);
        const env = await enrollments.create({ studentId: v.studentId, courseId: v.courseId });
        toast(env.message || 'Student enrolled.', { type: 'success' });
        d.close();
        list.reload();
      } catch (err) { showFormError(form, err); } finally { setBusy(btn, false); }
    });
  };
  header.addEventListener('click', onHeaderClick);
  return () => header.removeEventListener('click', onHeaderClick);
}

async function myCourses(ctx) {
  const sid = ctx.session.studentId;
  ctx.header({
    title: 'My courses',
    description: 'Courses you are enrolled in and the status of their examinations.',
    actions: html`<a class="btn btn--primary" href="#/student/courses">${icon('plus')} Enroll in a course</a>`,
  });
  ctx.html(loading());

  const load = async () => {
    const [enr, att, crs] = await Promise.all([settle(enrollments.mine(sid)), settle(attempts.byStudent(sid)), settle(courses.all())]);
    if (!ctx.alive()) return;
    if (enr.error) { ctx.html(html`<div class="card">${errorState(enr.error)}</div>`); return; }
    if (!enr.value.length) {
      ctx.html(html`<div class="card">${emptyState({ icon: 'book-open', title: 'You have not enrolled in any course', text: 'Enroll in a course to unlock its examination.', action: { label: 'Browse courses', href: '#/student/courses' } })}</div>`);
      return;
    }
    // Question counts decide whether an exam is open; failures leave the status unknown.
    const counts = await Promise.all(enr.value.map((e) => settle(questions.countForCourse(e.courseId))));
    if (!ctx.alive()) return;
    const info = new Map((crs.value || []).map((c) => [c.id, c]));
    const rows = enr.value.map((e, i) => ({ e, course: info.get(e.courseId), q: counts[i], st: att.error ? null : examStatus(att.value, e.courseId) }));

    ctx.html(html`<div class="card card--flush">${table([
      { label: 'Course', render: ({ e }) => html`<span class="cell-title">${e.courseCode}</span><div class="cell-sub">${e.courseTitle}</div>` },
      { label: 'Credit units', className: 'num', render: ({ course }) => course?.creditUnit ?? '—' },
      { label: 'Enrollment', render: ({ e }) => html`${badge('Enrolled', 'success')}<div class="cell-sub">Since ${fmtDate(e.enrollmentDate)}</div>` },
      {
        label: 'Exam', render: ({ q, st }) => {
          if (!st) return badge('Unavailable', 'neutral');
          if (st.state === 'in-progress') return badge('In progress', 'warning');
          if (st.state === 'completed') return badge('Completed', 'success');
          if (q.error) return badge('Unavailable', 'neutral');
          return q.value > 0 ? badge('Available', 'gold') : badge('No questions yet', 'neutral');
        },
      },
      {
        label: '', className: 'cell-actions', render: ({ e, q, st }) => {
          const view = html`<a class="btn btn--secondary btn--sm" href="#/student/courses/${e.courseId}">Details</a>`;
          if (st?.state === 'in-progress') return html`${view}<a class="btn btn--primary btn--sm" href="#/student/take/${st.attempt.id}">Resume exam</a>`;
          if (st?.state === 'available' && !q.error && q.value > 0) return html`${view}<a class="btn btn--primary btn--sm" href="#/student/exams/${e.courseId}/instructions">Open exam</a>`;
          return view;
        },
      },
    ], rows, { caption: 'My courses' })}</div>`);
  };
  delegate(ctx.root, 'click', '[data-action="retry"]', load);
  await load();
}

export const enrollmentRoutes = [
  { path: '/admin/enrollments', role: 'admin', title: 'Enrollments', render: adminEnrollments },
  { path: '/student/my-courses', role: 'student', title: 'My courses', render: myCourses },
];
