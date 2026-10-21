/** Admin student management: list, details, create, edit, delete. */
import { html } from '../html.js';
import { icon, badge, table, loading, errorState, emptyState, confirmDialog, toast, toastError, dl, alertBox } from '../components.js';
import { mountList, searchField, filterSelect } from '../listing.js';
import { students, enrollments, attempts, results, settle } from '../services.js';
import { field, selectField, validate, rules, formValues, showFormError, formErrorSlot, setBusy } from '../validation.js';
import { navigate } from '../router.js';
import { delegate, fullName, includesText, initials, uniqueSorted, fmtDateTime, fmtNum } from '../utils.js';
import { scoreText } from '../grades.js';

async function studentList(ctx) {
  ctx.header({
    title: 'Students',
    description: 'Search, review and manage registered students.',
    actions: html`<a class="btn btn--primary" href="#/admin/students/new">${icon('plus')} Add student</a>`,
  });
  ctx.html(loading());

  const list = await mountList(ctx, {
    path: () => '/api/Students',
    state: { search: '', department: '', level: '' },
    prepare: async () => {
      const all = await students.all();
      return { departments: uniqueSorted(all.map((s) => s.department)), levels: uniqueSorted(all.map((s) => s.level)) };
    },
    toolbar: (s, l) => html`${searchField(s, 'Name, email or matric number')}
      ${filterSelect('department', 'Department', (l.departments || []).map((d) => ({ value: d, label: d })), s, 'All departments')}
      ${filterSelect('level', 'Level', (l.levels || []).map((v) => ({ value: v, label: v })), s, 'All levels')}`,
    filtering: (s) => s.search.trim() || s.department || s.level,
    predicate: (s) => (r) =>
      (!s.search.trim() || includesText(`${fullName(r)} ${r.email} ${r.matricNumber}`, s.search))
      && (!s.department || r.department === s.department)
      && (!s.level || String(r.level) === String(s.level)),
    renderItems: (items) => table([
      { label: 'Matric number', render: (r) => html`<span class="cell-title">${r.matricNumber}</span>` },
      { label: 'Name', render: (r) => fullName(r) },
      { label: 'Email', key: 'email' },
      { label: 'Department', key: 'department' },
      { label: 'Level', className: 'num', render: (r) => r.level },
      {
        label: '', className: 'cell-actions',
        render: (r) => html`<a class="icon-btn icon-btn--row" href="#/admin/students/${r.id}" aria-label="View ${fullName(r)}" title="View">${icon('eye')}</a>
          <a class="icon-btn icon-btn--row" href="#/admin/students/${r.id}/edit" aria-label="Edit ${fullName(r)}" title="Edit">${icon('pencil')}</a>
          <button type="button" class="icon-btn icon-btn--row icon-btn--danger" data-delete="${r.id}" data-name="${fullName(r)}" aria-label="Delete ${fullName(r)}" title="Delete">${icon('trash-2')}</button>`,
      },
    ], items, { caption: 'Students' }),
    empty: { icon: 'users', title: 'No students yet', text: 'Students appear here once they register or are added.', action: { label: 'Add student', href: '#/admin/students/new' } },
  });
  if (!list) return;

  delegate(ctx.root, 'click', '[data-delete]', async (_e, btn) => {
    const ok = await confirmDialog({ title: 'Delete student?', message: `${btn.dataset.name} will be removed. This cannot be undone.`, confirmText: 'Delete student' });
    if (!ok) return;
    try {
      const env = await students.remove(btn.dataset.delete);
      toast(env.message || 'Student deleted.', { type: 'success' });
      list.reload();
    } catch (err) { toastError(err); }
  });
}

async function studentDetails(ctx) {
  const id = ctx.params.id;
  ctx.header({ title: 'Student', crumbs: [{ label: 'Students', href: '/admin/students' }, { label: 'Details' }] });
  ctx.html(loading());
  let student;
  try { student = (await students.all()).find((s) => s.id === id); }
  catch (err) { ctx.html(html`<div class="card">${errorState(err, { retry: false })}</div>`); return; }
  if (!student) { ctx.html(html`<div class="card">${errorState({ status: 404, message: 'This student could not be found.' }, { retry: false })}</div>`); return; }

  const name = fullName(student);
  ctx.header({
    title: name,
    description: student.matricNumber,
    crumbs: [{ label: 'Students', href: '/admin/students' }, { label: name }],
    actions: html`<a class="btn btn--secondary" href="#/admin/students/${id}/edit">${icon('pencil')} Edit</a>`,
  });

  const [enr, att, res] = await Promise.all([
    settle(enrollments.all().then((a) => a.filter((e) => e.studentId === id))),
    settle(attempts.byStudent(id)),
    settle(results.byStudent(id)),
  ]);
  if (!ctx.alive()) return;

  const section = (title, s, render) => html`<section class="card card--flush"><div class="card__header"><h2>${title}</h2></div>${s.error ? errorState(s.error, { retry: false }) : s.value.length ? render(s.value) : emptyState({ icon: 'inbox', title: `No ${title.toLowerCase()}` })}</section>`;

  ctx.html(html`<div class="stack">
    <section class="card"><div class="card__body">
      <div class="detail-hero"><span class="avatar" aria-hidden="true">${initials(name)}</span><div><h2>${name}</h2><p class="muted">${student.email}</p></div></div>
      <hr style="border:0;border-top:1px solid var(--c-border);margin:20px 0">
      ${dl([['Matric number', student.matricNumber], ['Email', student.email], ['Department', student.department], ['Level', student.level]])}
    </div></section>
    ${section('Enrollments', enr, (rows) => table([
      { label: 'Course', render: (e) => html`<span class="cell-title">${e.courseCode}</span><div class="cell-sub">${e.courseTitle}</div>` },
      { label: 'Enrolled', render: (e) => fmtDateTime(e.enrollmentDate) },
    ], rows, { caption: 'Enrollments' }))}
    ${section('Exam attempts', att, (rows) => table([
      { label: 'Course', render: (a) => `${a.courseCode} · ${a.courseTitle}` },
      { label: 'Started', render: (a) => fmtDateTime(a.startedAt) },
      { label: 'Status', render: (a) => (a.isSubmitted ? badge('Submitted', 'success') : badge('In progress', 'warning')) },
      { label: '', className: 'cell-actions', render: (a) => html`<a class="btn btn--secondary btn--sm" href="#/admin/attempts/${a.id}">View</a>` },
    ], rows, { caption: 'Exam attempts' }))}
    ${section('Results', res, (rows) => table([
      { label: 'Course', render: (r) => `${r.courseCode} · ${r.courseTitle}` },
      { label: 'Score', className: 'num', render: scoreText },
      { label: 'Grade', render: (r) => html`<span class="grade-pill">${r.grade || '—'}</span>` },
      { label: 'Grade point', className: 'num', render: (r) => fmtNum(r.gradePoint, 2) },
      { label: '', className: 'cell-actions', render: (r) => html`<a class="btn btn--secondary btn--sm" href="#/admin/results/${r.id}">View</a>` },
    ], rows, { caption: 'Results' }))}
  </div>`);
}

async function studentForm(ctx) {
  const id = ctx.params.id;
  const editing = Boolean(id);
  ctx.header({ title: editing ? 'Edit student' : 'Add student', crumbs: [{ label: 'Students', href: '/admin/students' }, { label: editing ? 'Edit' : 'New' }] });
  ctx.html(loading());

  let s = {};
  if (editing) {
    try { s = (await students.all()).find((x) => x.id === id); }
    catch (err) { ctx.html(html`<div class="card">${errorState(err, { retry: false })}</div>`); return; }
    if (!s) { ctx.html(html`<div class="card">${errorState({ status: 404, message: 'This student could not be found.' }, { retry: false })}</div>`); return; }
  }

  ctx.html(html`<form class="card" id="student-form" novalidate><div class="card__body">
    ${formErrorSlot()}
    ${!editing ? alertBox('info', 'A student added here needs a password before they can sign in.') : ''}
    <div class="form-grid" style="margin-top:${editing ? 0 : 18}px">
      ${field({ name: 'firstName', label: 'First name', required: true, value: s.firstName })}
      ${field({ name: 'lastName', label: 'Last name', required: true, value: s.lastName })}
      ${field({ name: 'email', label: 'Email', type: 'email', required: true, value: s.email, full: true })}
      ${field({ name: 'department', label: 'Department', required: true, value: s.department })}
      ${field({ name: 'level', label: 'Level', type: 'number', required: true, min: 1, step: 1, value: s.level, inputmode: 'numeric' })}
    </div>
    <div class="form-actions"><a class="btn btn--secondary" href="#/admin/students">Cancel</a><button type="submit" class="btn btn--primary">${editing ? 'Save changes' : 'Add student'}</button></div>
  </div></form>`);

  const form = ctx.root.querySelector('#student-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validate(form, {
      firstName: [rules.required('First name')], lastName: [rules.required('Last name')],
      email: [rules.required('Email'), rules.email], matricNumber: [rules.required('Matriculation number')],
      department: [rules.required('Department')], level: [rules.required('Level'), rules.integer('Level', { min: 1 })],
    })) return;
    const v = formValues(form);
    const dto = {
      firstName: v.firstName.trim(), lastName: v.lastName.trim(), email: v.email.trim(),
      department: v.department.trim(), level: Number(v.level),
    };
    if (!editing) {
      dto.matricNumber = v.matricNumber.trim();
      if (v.role) dto.role = v.role;
    }
    const btn = form.querySelector('[type=submit]');
    setBusy(btn, true);
    try {
      const env = editing ? await students.update(id, dto) : await students.create(dto);
      toast(env.message || (editing ? 'Student updated.' : 'Student added.'), { type: 'success' });
      navigate('/admin/students');
    } catch (err) { showFormError(form, err); } finally { setBusy(btn, false); }
  });
}

export const studentRoutes = [
  { path: '/admin/students', role: 'admin', title: 'Students', render: studentList },
  { path: '/admin/students/new', role: 'admin', title: 'Add student', render: studentForm },
  { path: '/admin/students/:id', role: 'admin', title: 'Student', render: studentDetails },
  { path: '/admin/students/:id/edit', role: 'admin', title: 'Edit student', render: studentForm },
];
