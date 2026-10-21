/** Courses: admin management (list, details, form) and student discovery + enrollment. */
import { html } from '../html.js';
import { icon, badge, table, loading, errorState, emptyState, confirmDialog, toast, toastError, dl, alertBox } from '../components.js';
import { mountList, searchField, filterSelect } from '../listing.js';
import { courses, enrollments, questions, attempts, results, examStatus, settle } from '../services.js';
import { field, selectField, textareaField, validate, rules, formValues, showFormError, formErrorSlot, setBusy } from '../validation.js';
import { navigate } from '../router.js';
import { delegate, includesText, uniqueSorted, fmtNum, fmtDateTime } from '../utils.js';
import { scoreText } from '../grades.js';

const courseMatches = (s) => (c) =>
  (!s.search.trim() || includesText(`${c.courseCode} ${c.courseTitle}`, s.search))
  && (!s.department || c.department === s.department)
  && (!s.level || String(c.level) === String(s.level));

const courseLookups = async () => {
  const all = await courses.all();
  return { departments: uniqueSorted(all.map((c) => c.department)), levels: uniqueSorted(all.map((c) => c.level)) };
};

const courseToolbar = (s, l) => html`${searchField(s, 'Course code or title')}
  ${filterSelect('department', 'Department', (l.departments || []).map((d) => ({ value: d, label: d })), s, 'All departments')}
  ${filterSelect('level', 'Level', (l.levels || []).map((v) => ({ value: v, label: v })), s, 'All levels')}`;

/* ---------------- Admin ---------------- */
async function adminCourses(ctx) {
  ctx.header({
    title: 'Courses',
    description: 'Create and maintain the course catalogue.',
    actions: html`<a class="btn btn--primary" href="#/admin/courses/new">${icon('plus')} New course</a>`,
  });
  ctx.html(loading());
  const list = await mountList(ctx, {
    path: () => '/api/Courses',
    state: { search: '', department: '', level: '' },
    prepare: courseLookups,
    toolbar: courseToolbar,
    filtering: (s) => s.search.trim() || s.department || s.level,
    predicate: courseMatches,
    renderItems: (items) => table([
      { label: 'Code', render: (c) => html`<span class="cell-title">${c.courseCode}</span>` },
      { label: 'Title', render: (c) => html`${c.courseTitle}${c.description ? html`<div class="cell-sub cell-clamp">${c.description}</div>` : ''}` },
      { label: 'Department', key: 'department' },
      { label: 'Level', className: 'num', render: (c) => c.level },
      { label: 'Credit units', className: 'num', render: (c) => c.creditUnit },
      {
        label: '', className: 'cell-actions',
        render: (c) => html`<a class="icon-btn icon-btn--row" href="#/admin/courses/${c.id}" aria-label="View ${c.courseCode}" title="View">${icon('eye')}</a>
          <a class="icon-btn icon-btn--row" href="#/admin/courses/${c.id}/edit" aria-label="Edit ${c.courseCode}" title="Edit">${icon('pencil')}</a>
          <button type="button" class="icon-btn icon-btn--row icon-btn--danger" data-delete="${c.id}" data-name="${c.courseCode}" aria-label="Delete ${c.courseCode}" title="Delete">${icon('trash-2')}</button>`,
      },
    ], items, { caption: 'Courses' }),
    empty: { icon: 'book-open', title: 'No courses yet', text: 'Create the first course to get started.', action: { label: 'New course', href: '#/admin/courses/new' } },
  });
  if (!list) return;
  delegate(ctx.root, 'click', '[data-delete]', async (_e, btn) => {
    const ok = await confirmDialog({ title: 'Delete course?', message: `${btn.dataset.name} will be deleted. This can’t be undone, and a course that already has enrollments, questions or results may not be deletable.`, confirmText: 'Delete course' });
    if (!ok) return;
    try {
      const env = await courses.remove(btn.dataset.delete);
      toast(env.message || 'Course deleted.', { type: 'success' });
      list.reload();
    } catch (err) { toastError(err); }
  });
}

async function adminCourseDetails(ctx) {
  const id = ctx.params.id;
  ctx.header({ title: 'Course', crumbs: [{ label: 'Courses', href: '/admin/courses' }, { label: 'Details' }] });
  ctx.html(loading());
  let c;
  try { c = await courses.get(id); } catch (err) { ctx.html(html`<div class="card">${errorState(err, { retry: false })}</div>`); return; }
  ctx.header({
    title: `${c.courseCode} · ${c.courseTitle}`,
    crumbs: [{ label: 'Courses', href: '/admin/courses' }, { label: c.courseCode }],
    actions: html`<a class="btn btn--secondary" href="#/admin/courses/${id}/edit">${icon('pencil')} Edit</a><a class="btn btn--primary" href="#/admin/questions/new?course=${id}">${icon('plus')} Add question</a>`,
  });
  const [qs, enr, att, res] = await Promise.all([
    settle(questions.byCourse(id)),
    settle(enrollments.all().then((a) => a.filter((e) => e.courseId === id))),
    settle(attempts.all().then((a) => a.filter((x) => x.courseId === id))),
    settle(results.all().then((a) => a.filter((x) => x.courseId === id))),
  ]);
  if (!ctx.alive()) return;

  const section = (title, s, render, extra = '') => html`<section class="card card--flush"><div class="card__header"><h2>${title}${s.error ? '' : html` <span class="muted small">(${s.value.length})</span>`}</h2>${extra}</div>${s.error ? errorState(s.error, { retry: false }) : s.value.length ? render(s.value) : emptyState({ icon: 'inbox', title: `No ${title.toLowerCase()} yet` })}</section>`;

  ctx.html(html`<div class="stack">
    <section class="card"><div class="card__body">${dl([
      ['Course code', c.courseCode], ['Title', c.courseTitle], ['Description', c.description],
      ['Department', c.department], ['Level', c.level], ['Credit units', c.creditUnit],
    ])}</div></section>
    ${section('Questions', qs, (rows) => table([
      { label: 'Question', render: (q) => html`<div class="cell-clamp">${q.questionText}</div>` },
      { label: 'Marks', className: 'num', render: (q) => q.marks },
      { label: '', className: 'cell-actions', render: (q) => html`<a class="btn btn--secondary btn--sm" href="#/admin/questions/${q.id}/edit">Edit</a>` },
    ], rows, { caption: 'Questions' }), html`<span class="muted small">The exam for this course is made of these questions.</span>`)}
    ${section('Enrollments', enr, (rows) => table([
      { label: 'Student', render: (e) => html`<span class="cell-title">${e.studentName}</span>` },
      { label: 'Enrolled', render: (e) => fmtDateTime(e.enrollmentDate) },
    ], rows, { caption: 'Enrollments' }))}
    ${section('Attempts', att, (rows) => table([
      { label: 'Student', render: (a) => a.studentName },
      { label: 'Started', render: (a) => fmtDateTime(a.startedAt) },
      { label: 'Status', render: (a) => (a.isSubmitted ? badge('Submitted', 'success') : badge('In progress', 'warning')) },
      { label: '', className: 'cell-actions', render: (a) => html`<a class="btn btn--secondary btn--sm" href="#/admin/attempts/${a.id}">View</a>` },
    ], rows, { caption: 'Attempts' }))}
    ${section('Results', res, (rows) => table([
      { label: 'Student', render: (r) => r.studentName },
      { label: 'Score', className: 'num', render: scoreText },
      { label: 'Grade', render: (r) => html`<span class="grade-pill">${r.grade || '—'}</span>` },
      { label: '', className: 'cell-actions', render: (r) => html`<a class="btn btn--secondary btn--sm" href="#/admin/results/${r.id}">View</a>` },
    ], rows, { caption: 'Results' }))}
  </div>`);
}

async function courseForm(ctx) {
  const id = ctx.params.id;
  const editing = Boolean(id);
  ctx.header({ title: editing ? 'Edit course' : 'New course', crumbs: [{ label: 'Courses', href: '/admin/courses' }, { label: editing ? 'Edit' : 'New' }] });
  ctx.html(loading());
  let c = {};
  if (editing) {
    try { c = await courses.get(id); } catch (err) { ctx.html(html`<div class="card">${errorState(err, { retry: false })}</div>`); return; }
  }
  ctx.html(html`<form class="card" id="course-form" novalidate><div class="card__body">
    ${formErrorSlot()}
    <div class="form-grid">
      ${field({ name: 'courseCode', label: 'Course code', required: true, value: c.courseCode, placeholder: 'e.g. CSC101' })}
      ${field({ name: 'courseTitle', label: 'Course title', required: true, value: c.courseTitle })}
      ${textareaField({ name: 'description', label: 'Description', value: c.description })}
      ${field({ name: 'creditUnit', label: 'Credit units', type: 'number', required: true, min: 1, step: 1, value: c.creditUnit, inputmode: 'numeric' })}
      ${field({ name: 'level', label: 'Level', type: 'number', required: true, min: 1, step: 1, value: c.level, inputmode: 'numeric', hint: 'For example 100, 200, 300.' })}
      ${field({ name: 'department', label: 'Department', required: true, value: c.department, full: true })}
    </div>
    <div class="form-actions"><a class="btn btn--secondary" href="#/admin/courses">Cancel</a><button type="submit" class="btn btn--primary">${editing ? 'Save changes' : 'Create course'}</button></div>
  </div></form>`);

  const form = ctx.root.querySelector('#course-form');
  form.courseCode.focus();
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validate(form, {
      courseCode: [rules.required('Course code')], courseTitle: [rules.required('Course title')],
      creditUnit: [rules.required('Credit units'), rules.integer('Credit units', { min: 1 })],
      level: [rules.required('Level'), rules.integer('Level', { min: 1 })], department: [rules.required('Department')],
    })) return;
    const v = formValues(form);
    const dto = {
      courseCode: v.courseCode.trim(), courseTitle: v.courseTitle.trim(), description: v.description.trim(),
      creditUnit: Number(v.creditUnit), department: v.department.trim(), level: Number(v.level),
    };
    const btn = form.querySelector('[type=submit]');
    setBusy(btn, true);
    try {
      const env = editing ? await courses.update(id, dto) : await courses.create(dto);
      toast(env.message || (editing ? 'Course updated.' : 'Course created.'), { type: 'success' });
      navigate('/admin/courses');
    } catch (err) { showFormError(form, err); } finally { setBusy(btn, false); }
  });
}

/* ---------------- Student ---------------- */
async function enrollInCourse(sid, courseId, courseCode) {
  try {
    const env = await enrollments.create({ studentId: sid, courseId });
    toast(env.message || `You are now enrolled in ${courseCode}.`, { type: 'success' });
    return true;
  } catch (err) {
    toastError(err, 'Enrollment failed.');
    // A 409 means the server already has this enrollment; the caller refreshes from the API.
    return err.status === 409 ? 'conflict' : false;
  }
}

async function availableCourses(ctx) {
  const sid = ctx.session.studentId;
  ctx.header({ title: 'Available courses', description: 'Browse the catalogue and enroll in the courses you will take.' });
  ctx.html(loading());
  const shared = { enrolled: new Set(), error: null };
  const refreshEnrolled = async () => {
    try { shared.enrolled = new Set((await enrollments.mine(sid)).map((e) => e.courseId)); shared.error = null; }
    catch (err) { shared.error = err; }
  };
  const list = await mountList(ctx, {
    path: () => '/api/Courses',
    pageSize: 9,
    state: { search: '', department: '', level: '' },
    prepare: async () => { await refreshEnrolled(); return courseLookups(); },
    toolbar: courseToolbar,
    filtering: (s) => s.search.trim() || s.department || s.level,
    predicate: courseMatches,
    wrapperClass: '',
    renderItems: (items) => html`${shared.error ? html`<div style="padding:16px 20px">${alertBox('warning', 'Your enrollments could not be loaded, so enrollment status may be incomplete.')}</div>` : ''}
      <div class="grid grid--cards" style="padding:20px">${items.map((c) => {
        const enrolled = shared.enrolled.has(c.id);
        return html`<article class="card course-card">
          <div class="row row--between"><span class="course-card__code">${c.courseCode}</span>${enrolled ? badge('Enrolled', 'success') : ''}</div>
          <h3>${c.courseTitle}</h3>
          <p class="course-card__desc">${c.description || 'No description provided.'}</p>
          <div class="course-card__meta"><span class="chip">${c.creditUnit} credit unit${c.creditUnit === 1 ? '' : 's'}</span><span class="chip">Level ${c.level}</span><span class="chip">${c.department}</span></div>
          <div class="course-card__actions">
            <a class="btn btn--secondary btn--sm" href="#/student/courses/${c.id}">Details</a>
            ${enrolled ? '' : html`<button type="button" class="btn btn--primary btn--sm" data-enroll="${c.id}" data-code="${c.courseCode}">Enroll</button>`}
          </div>
        </article>`;
      })}</div>`,
    empty: { icon: 'book-open', title: 'No courses available', text: 'Check back later: no courses have been published yet.' },
  });
  if (!list) return;
  delegate(ctx.root, 'click', '[data-enroll]', async (_e, btn) => {
    btn.disabled = true;
    const outcome = await enrollInCourse(sid, btn.dataset.enroll, btn.dataset.code);
    if (outcome) { await refreshEnrolled(); list.reload({ fresh: false }); } else { btn.disabled = false; }
  });
}

async function studentCourseDetails(ctx) {
  const sid = ctx.session.studentId;
  const id = ctx.params.id;
  ctx.header({ title: 'Course', crumbs: [{ label: 'Available courses', href: '/student/courses' }, { label: 'Details' }] });
  ctx.html(loading());

  const render = async () => {
    let c;
    try { c = await courses.get(id); } catch (err) { ctx.html(html`<div class="card">${errorState(err, { retry: false })}</div>`); return; }
    const [enr, att, qn] = await Promise.all([settle(enrollments.mine(sid)), settle(attempts.byStudent(sid)), settle(questions.countForCourse(id))]);
    if (!ctx.alive()) return;
    const enrolled = !enr.error && enr.value.some((e) => e.courseId === id);
    const st = att.error ? null : examStatus(att.value, id);
    ctx.header({ title: `${c.courseCode} · ${c.courseTitle}`, crumbs: [{ label: 'Available courses', href: '/student/courses' }, { label: c.courseCode }] });

    let examAction = '';
    if (!enrolled) examAction = html`<p class="muted">Enroll in this course to unlock its examination.</p>`;
    else if (st?.state === 'in-progress') examAction = html`<a class="btn btn--primary" href="#/student/take/${st.attempt.id}">Resume exam</a>`;
    else if (st?.state === 'completed') examAction = html`<a class="btn btn--secondary" href="#/student/history">View exam history</a>`;
    else if (!qn.error && qn.value === 0) examAction = html`<p class="muted">No exam questions have been published for this course yet.</p>`;
    else if (st?.state === 'available') examAction = html`<a class="btn btn--primary" href="#/student/exams/${id}/instructions">Go to exam</a>`;

    ctx.html(html`<div class="stack">
      <section class="card"><div class="card__header"><h2>Course information</h2>${enr.error ? '' : enrolled ? badge('Enrolled', 'success') : badge('Not enrolled', 'neutral')}</div>
        <div class="card__body">${dl([['Course code', c.courseCode], ['Title', c.courseTitle], ['Description', c.description], ['Department', c.department], ['Level', c.level], ['Credit units', c.creditUnit]])}</div>
        <div class="card__footer row">
          ${enr.error ? alertBox('warning', 'Enrollment status could not be loaded.') : enrolled ? '' : html`<button type="button" class="btn btn--primary" data-enroll>Enroll in this course</button>`}
        </div>
      </section>
      <section class="card"><div class="card__header"><h2>Examination</h2>${qn.error ? '' : badge(`${qn.value} question${qn.value === 1 ? '' : 's'}`, 'neutral', true)}</div><div class="card__body">${examAction}</div></section>
    </div>`);
  };

  delegate(ctx.root, 'click', '[data-enroll]', async (_e, btn) => {
    btn.disabled = true;
    const outcome = await enrollInCourse(sid, id, '');
    if (outcome) await render(); else btn.disabled = false;
  });
  await render();
}

export const courseRoutes = [
  { path: '/admin/courses', role: 'admin', title: 'Courses', render: adminCourses },
  { path: '/admin/courses/new', role: 'admin', title: 'New course', render: courseForm },
  { path: '/admin/courses/:id', role: 'admin', title: 'Course', render: adminCourseDetails },
  { path: '/admin/courses/:id/edit', role: 'admin', title: 'Edit course', render: courseForm },
  { path: '/student/courses', role: 'student', title: 'Available courses', render: availableCourses },
  { path: '/student/courses/:id', role: 'student', title: 'Course', render: studentCourseDetails },
];
