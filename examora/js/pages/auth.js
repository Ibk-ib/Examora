/** Login and student registration. */
import { html } from '../html.js';
import { icon, alertBox } from '../components.js';
import { CONFIG } from '../config.js';
import { login, register, getSession, homePath } from '../auth.js';
import { navigate } from '../router.js';
import { field, passwordField, validate, rules, formValues, showFormError, formErrorSlot, setBusy, bindPasswordToggles } from '../validation.js';

function authShell({ title, subtitle, body, footer, wide = false }) {
  return html`<div class="auth">
    <aside class="auth__brand">
      <a class="brand" href="#/login" aria-label="Examora"><span class="brand__mark">${icon('graduation-cap')}</span><span class="brand__name">Examora</span></a>
      <div class="auth__hero">
        <h1>Examinations. <span>Results.</span> Progress.</h1>
        <p>One place for course enrollment, examinations and academic results.</p>
      </div>
      <ul class="auth__points">
        <li>${icon('book-open')} Enroll in courses and track your load</li>
        <li>${icon('pencil-line')} Take examinations and change your answers until you submit</li></li>
        <li>${icon('award')} See your results, grades and progress</li>
      </ul>
    </aside>
    <section class="auth__panel">
      <div class="card auth__card${wide ? ' auth__card--wide' : ''}">
        <div class="auth__mobile-brand"><a class="brand" href="#/login"><span class="brand__mark">${icon('graduation-cap')}</span><span class="brand__name">Examora</span></a></div>
        <h2>${title}</h2>
        <p class="auth__sub">${subtitle}</p>
        ${body}
        <p class="auth__foot">${footer}</p>
      </div>
    </section>
  </div>`;
}

function afterAuth(ctx) {
  const next = ctx.query.next;
  const home = homePath(getSession());
  // Only follow a `next` target inside the area the user's role may open.
  const ok = next && next.startsWith(home);
  navigate(ok ? next : home, { replace: true });
}

export function loginPage(ctx) {
  ctx.html(authShell({ 
    title: 'Welcome back',
    subtitle: 'Sign in with your matriculation number to continue.',
    body: html`<form id="login-form" novalidate>
      ${ctx.query.expired ? html`<div class="form-error">${alertBox('warning', 'Your session expired. Please sign in again.')}</div>` : ''}
      ${ctx.query.registered ? html`<div class="form-error">${alertBox('success', 'Your account has been created. Please sign in with your matriculation number and password.')}</div>` : ''}
      ${formErrorSlot()}
      ${field({ name: 'matricNumber', label: 'Matriculation number', required: true, autocomplete: 'username' })}
      ${passwordField({ name: 'password', label: 'Password' })}
      <label class="check" style="margin-bottom:20px"><input type="checkbox" name="remember"> Keep me signed in on this device</label>
      <button type="submit" class="btn btn--primary btn--block">Sign in</button>
    </form>`,
    footer: html`New student? <a href="#/register">Create an account</a>`,
  }));

  const form = ctx.root.querySelector('#login-form');
  bindPasswordToggles(ctx.root);
  form.matricNumber.focus();
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validate(form, {
      matricNumber: [rules.required('Matriculation number')],
      password: [rules.required('Password')],
    })) return;
    const btn = form.querySelector('[type=submit]');
    setBusy(btn, true, 'Signing in…');
    try {
      const v = formValues(form);
      await login({ matricNumber: v.matricNumber.trim(), password: v.password, remember: form.remember.checked });
      afterAuth(ctx);
    } catch (err) {
      if (err.status === 401) err.message = 'The matriculation number or password is incorrect.';
      showFormError(form, err);
    } finally {
      setBusy(btn, false);
    }
  });
}

export function registerPage(ctx) {
  ctx.html(authShell({
    wide: true,
    title: 'Create your student account',
    subtitle: 'Fill in your details to register for Examora. Take note of your matriculation number and Password.',
    body: html`<form id="register-form" novalidate>
      ${formErrorSlot()}
      <div class="form-grid">
        ${field({ name: 'firstName', label: 'First name', required: true, autocomplete: 'given-name' })}
        ${field({ name: 'lastName', label: 'Last name', required: true, autocomplete: 'family-name' })}
        ${field({ name: 'email', label: 'Email', type: 'email', required: true, autocomplete: 'email' })}
        ${field({ name: 'matricNumber', label: 'Matric number', required: true, autocomplete: 'username' })}
        ${field({ name: 'department', label: 'Department', required: true })}
        ${field({ name: 'level', label: 'Level', type: 'number', required: true, min: 1, step: 1, inputmode: 'numeric', hint: 'E.g. 100, 200, 300.' })}
        ${passwordField({ name: 'password', label: 'Password', autocomplete: 'new-password' })}
        ${passwordField({ name: 'confirmPassword', label: 'Confirm password', autocomplete: 'new-password' })}
      </div>
      <button type="submit" class="btn btn--primary btn--block">Create account</button>
    </form>`,
    footer: html`Already registered? <a href="#/login">Sign in</a>`,
  }));

  const form = ctx.root.querySelector('#register-form');
  bindPasswordToggles(ctx.root);
  form.firstName.focus();
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validate(form, {
      firstName: [rules.required('First name')],
      lastName: [rules.required('Last name')],
      email: [rules.required('Email'), rules.email],
      matricNumber: [rules.required('Matriculation number')],
      department: [rules.required('Department')],
      level: [rules.required('Level'), rules.integer('Level', { min: 1 })],
      password: [rules.required('Password')],
      confirmPassword: [rules.required('Please confirm your password'), rules.matches('password', 'Passwords do not match.')],
    })) return;
    const btn = form.querySelector('[type=submit]');
    setBusy(btn, true, 'Creating account…');
    try {
      const v = formValues(form);
      await register({
        firstName: v.firstName.trim(),
        lastName: v.lastName.trim(),
        email: v.email.trim(),
        matricNumber: v.matricNumber.trim(),
        department: v.department.trim(),
        level: Number(v.level),
        password: v.password,
      });
      navigate('/login?registered=1', { replace: true });
    } catch (err) {
      showFormError(form, err);
    } finally {
      setBusy(btn, false);
    }
  });
}

export const authRoutes = [
  { path: '/login', layout: 'auth', public: true, title: 'Sign in', render: loginPage },
  { path: '/register', layout: 'auth', public: true, title: 'Create account', render: registerPage },
];
