/** Student profile: view and edit the fields the API supports. Role and matric number are not editable. */
import { html } from '../html.js';
import { loading, errorState, toast, dl, alertBox, table, emptyState } from '../components.js';
import { students, enrollments, settle } from '../services.js';
import { field, validate, rules, formValues, showFormError, formErrorSlot, setBusy } from '../validation.js';
import { fullName, fmtDate } from '../utils.js';
import { logout } from '../auth.js';

async function profile(ctx) {
  const s0 = ctx.session;
  ctx.header({ title: 'My profile', description: 'Your account details.' });
  ctx.html(loading());
  let p;
  try {
    if (!s0.matricNumber) throw new Error('Your matriculation number is not available in this session. Please sign out and sign in again.');
    p = await students.getByMatric(s0.matricNumber);
  } catch (err) { ctx.html(html`<div class="card">${errorState(err, { retry: false })}</div>`); return; }
  const enr = await settle(enrollments.mine(s0.studentId));
  if (!ctx.alive()) return;

  const draw = (editing) => {
    ctx.html(html`<div class="stack">
      <section class="card"><div class="card__header"><h2>${fullName(p)}</h2>${editing ? '' : html`<button type="button" class="btn btn--secondary btn--sm" data-edit>Edit profile</button>`}</div><div class="card__body">
        ${editing ? html`<form id="profile-form" novalidate>${formErrorSlot()}
          <div class="form-grid">
            ${field({ name: 'firstName', label: 'First name', required: true, value: p.firstName })}
            ${field({ name: 'lastName', label: 'Last name', required: true, value: p.lastName })}
            ${field({ name: 'email', label: 'Email', type: 'email', required: true, value: p.email, full: true })}
            ${field({ name: 'matricNumber', label: 'Matriculation number', value: p.matricNumber, readonly: true, hint: 'Your matriculation number cannot be changed here.' })}
            ${field({ name: 'department', label: 'Department', required: true, value: p.department })}
            ${field({ name: 'level', label: 'Level', type: 'number', required: true, min: 1, step: 1, value: p.level })}
          </div>
          <div class="form-actions"><button type="button" class="btn btn--secondary" data-cancel>Cancel</button><button type="submit" class="btn btn--primary">Save changes</button></div>
        </form>` : dl([['Name', fullName(p)], ['Email', p.email], ['Matric number', p.matricNumber], ['Department', p.department], ['Level', p.level]])}
      </div></section>
      <section class="card card--flush"><div class="card__header"><h2>Enrolled courses</h2></div>${enr.error ? errorState(enr.error, { retry: false }) : enr.value.length ? table([
        { label: 'Course', render: (e) => html`<span class="cell-title">${e.courseCode}</span><div class="cell-sub">${e.courseTitle}</div>` },
        { label: 'Enrolled', render: (e) => fmtDate(e.enrollmentDate) },
      ], enr.value, { caption: 'Enrolled courses' }) : emptyState({ icon: 'book-open', title: 'Not enrolled in any course', action: { label: 'Browse courses', href: '#/student/courses' } })}</section>
    </div>`);
    if (!editing) return;
    const form = ctx.root.querySelector('#profile-form');
    form.firstName.focus();
    ctx.root.querySelector('[data-cancel]').addEventListener('click', () => draw(false));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!validate(form, { firstName: [rules.required('First name')], lastName: [rules.required('Last name')], email: [rules.required('Email'), rules.email], department: [rules.required('Department')], level: [rules.required('Level'), rules.integer('Level', { min: 1 })] })) return;
      const v = formValues(form);
      const dto = { firstName: v.firstName.trim(), lastName: v.lastName.trim(), email: v.email.trim(), department: v.department.trim(), level: Number(v.level) };
      const btn = form.querySelector('[type=submit]');
      setBusy(btn, true);
      try {
        const env = await students.update(p.id, dto);
        p = { ...p, ...dto };
        toast(env.message || 'Profile updated.', { type: 'success' });
        draw(false);
      } catch (err) { showFormError(form, err); } finally { setBusy(btn, false); }
    });
  };
  ctx.root.addEventListener('click', (e) => { if (e.target.closest('[data-edit]')) draw(true); });
  draw(false);
}

export const profileRoutes = [{ path: '/student/profile', role: 'student', title: 'My profile', render: profile }];
