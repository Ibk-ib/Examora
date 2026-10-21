/** Admin question management. Questions belong to a course; a course's exam is its question set. */
import { html } from '../html.js';
import { icon, table, loading, errorState, confirmDialog, openDialog, toast, toastError, alertBox, badge } from '../components.js';
import { mountList, searchField, filterSelect } from '../listing.js';
import { courses, questions } from '../services.js';
import { field, selectField, textareaField, validate, rules, formValues, showFormError, formErrorSlot, setBusy, setFieldError } from '../validation.js';
import { navigate } from '../router.js';
import { delegate, includesText, fmtNum } from '../utils.js';
import { LETTERS, optionsOf, answerPayload } from '../answers.js';

async function questionList(ctx) {
  ctx.header({
    title: 'Questions',
    description: 'Multiple-choice questions for each course examination.',
    actions: html`<a class="btn btn--primary" href="#/admin/questions/new${ctx.query.course ? `?course=${ctx.query.course}` : ''}">${icon('plus')} New question</a>`,
  });
  ctx.html(loading());
  let current = [];
  const list = await mountList(ctx, {
    path: (s) => (s.course ? `/api/Questions/by-course/${s.course}` : '/api/Questions'),
    state: { search: '', course: ctx.query.course || '' },
    prepare: async () => ({ courses: await courses.all() }),
    toolbar: (s, l) => html`${searchField(s, 'Question text or course code')}${filterSelect('course', 'Course', (l.courses || []).map((c) => ({ value: c.id, label: `${c.courseCode} · ${c.courseTitle}` })), s, 'All courses')}`,
    filtering: (s) => s.search.trim(),
    predicate: (s) => (q) => includesText(`${q.questionText} ${q.courseCode}`, s.search),
    renderItems: (items) => {
      current = items;
      return table([
        { label: 'Course', render: (q) => html`<span class="cell-title">${q.courseCode}</span>` },
        { label: 'Question', render: (q) => html`<div class="cell-clamp">${q.questionText}</div>` },
        { label: 'Marks', className: 'num', render: (q) => fmtNum(q.marks) },
        {
          label: '', className: 'cell-actions',
          render: (q) => html`<button type="button" class="icon-btn icon-btn--row" data-view="${q.id}" aria-label="View question" title="View">${icon('eye')}</button>
            <a class="icon-btn icon-btn--row" href="#/admin/questions/${q.id}/edit" aria-label="Edit question" title="Edit">${icon('pencil')}</a>
            <button type="button" class="icon-btn icon-btn--row icon-btn--danger" data-delete="${q.id}" aria-label="Delete question" title="Delete">${icon('trash-2')}</button>`,
        },
      ], items, { caption: 'Questions' });
    },
    empty: { icon: 'circle-help', title: 'No questions yet', text: 'Add questions to build a course examination.', action: { label: 'New question', href: '#/admin/questions/new' } },
  });
  if (!list) return;

  delegate(ctx.root, 'click', '[data-view]', (_e, btn) => {
    const q = current.find((x) => x.id === btn.dataset.view);
    if (!q) return;
    openDialog({
      title: `${q.courseCode} question`,
      size: 'lg',
      body: html`<p><strong>${q.questionText}</strong></p>
        <ol class="stack stack--sm" style="margin-top:14px">${optionsOf(q).map((o) => html`<li class="option" style="cursor:default"><span class="option__key">${o.letter}</span><span class="option__text">${o.text}</span></li>`)}</ol>
        <p class="muted small" style="margin-top:14px">Marks: ${fmtNum(q.marks)}.</p>`,
    });
  });
  delegate(ctx.root, 'click', '[data-delete]', async (_e, btn) => {
    const ok = await confirmDialog({ title: 'Delete question?', message: 'This question will be removed from its course examination.', confirmText: 'Delete question' });
    if (!ok) return;
    try { const env = await questions.remove(btn.dataset.delete); toast(env.message || 'Question deleted.', { type: 'success' }); list.reload(); }
    catch (err) { toastError(err); }
  });
}

async function questionForm(ctx) {
  const id = ctx.params.id;
  const editing = Boolean(id);
  ctx.header({ title: editing ? 'Edit question' : 'New question', crumbs: [{ label: 'Questions', href: '/admin/questions' }, { label: editing ? 'Edit' : 'New' }] });
  ctx.html(loading());

  let q = { courseId: ctx.query.course || '', marks: 1 };
  let crs;
  try {
    crs = await courses.all();
    if (editing) q = await questions.get(id);
  } catch (err) { ctx.html(html`<div class="card">${errorState(err, { retry: false })}</div>`); return; }
  if (!crs.length) {
    ctx.html(html`<div class="card">${errorState({ message: 'Create a course first: every question belongs to a course.' }, { retry: false })}</div>`);
    return;
  }

  ctx.html(html`<form class="card" id="question-form" novalidate><div class="card__body">
    ${formErrorSlot()}
    ${editing ? html`<div class="form-error">${alertBox('warning', 'The correct answer isn’t shown. Please select it again before saving.')}</div>` : ''}
    <div class="form-grid">
      ${selectField({ name: 'courseId', label: 'Course', required: true, value: q.courseId, full: true, options: crs.map((c) => ({ value: c.id, label: `${c.courseCode} · ${c.courseTitle}` })) })}
      ${textareaField({ name: 'questionText', label: 'Question', required: true, value: q.questionText, rows: 3 })}
      ${LETTERS.map((l) => field({ name: `option${l}`, label: `Option ${l}`, required: l === 'A' || l === 'B', value: q[`option${l}`], full: true }))}
      <div class="field field--full" data-field="correctAnswer">
        <span class="field__legend" id="ca-legend">Correct answer <span class="req" aria-hidden="true">*</span></span>
        <div class="answer-pick" role="radiogroup" aria-labelledby="ca-legend">${LETTERS.map((l) => html`<label><input type="radio" name="correctAnswer" value="${l}"> Option ${l}</label>`)}</div>
        <p class="field__error" id="err-correctAnswer" hidden></p>
      </div>
      ${field({ name: 'marks', label: 'Marks', type: 'number', required: true, min: 0, step: 0.5, value: q.marks, inputmode: 'decimal' })}
    </div>
    <div class="form-actions"><a class="btn btn--secondary" href="#/admin/questions">Cancel</a><button type="submit" class="btn btn--primary">${editing ? 'Save changes' : 'Create question'}</button></div>
  </div></form>`);

  const form = ctx.root.querySelector('#question-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const ok = validate(form, {
      courseId: [rules.required('Course')], questionText: [rules.required('Question')],
      optionA: [rules.required('Option A')], optionB: [rules.required('Option B')],
      correctAnswer: [(v) => (v ? null : 'Choose the correct answer.')],
      marks: [rules.required('Marks'), rules.positive('Marks')],
    });
    const v = formValues(form);
    if (ok && !String(v[`option${v.correctAnswer}`] || '').trim()) {
      setFieldError(form, 'correctAnswer', `Option ${v.correctAnswer} is empty. Fill it in or choose another answer.`);
      return;
    }
    if (!ok) return;
    const dto = {
      courseId: v.courseId,
      questionText: v.questionText.trim(),
      optionA: v.optionA.trim(), optionB: v.optionB.trim(), optionC: v.optionC.trim(), optionD: v.optionD.trim(),
      marks: Number(v.marks),
    };
    dto.correctAnswer = answerPayload(v.correctAnswer, dto);
    const btn = form.querySelector('[type=submit]');
    setBusy(btn, true);
    try {
      const env = editing ? await questions.update(id, dto) : await questions.create(dto);
      toast(env.message || (editing ? 'Question updated.' : 'Question created.'), { type: 'success' });
      navigate(`/admin/questions?course=${dto.courseId}`);
    } catch (err) { showFormError(form, err); } finally { setBusy(btn, false); }
  });
}

export const questionRoutes = [
  { path: '/admin/questions', role: 'admin', title: 'Questions', render: questionList },
  { path: '/admin/questions/new', role: 'admin', title: 'New question', render: questionForm },
  { path: '/admin/questions/:id/edit', role: 'admin', title: 'Edit question', render: questionForm },
];
