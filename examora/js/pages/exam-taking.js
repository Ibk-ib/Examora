import { html } from '../html.js';
import { icon, badge, loading, errorState, confirmDialog, toast, toastError, dl, alertBox, progressBar, emptyState } from '../components.js';
import { attempts, questions, answers, results, settle } from '../services.js';
import { navigate } from '../router.js';
import { setTopbarContext } from '../layout.js';
import { optionsOf, answerPayload, selectedLetter } from '../answers.js';
import { fmtDateTime, fmtNum } from '../utils.js';
import { setBusy } from '../validation.js';

async function takeExam(ctx) {
  const attemptId = ctx.params.attemptId;
  const sid = ctx.session.studentId;
  ctx.html(loading('Loading your exam…'));

  let attempt; let list; let saved;
  try {
    attempt = await attempts.get(attemptId);
    if (attempt.studentId && attempt.studentId !== sid) throw Object.assign(new Error('This attempt belongs to another student.'), { status: 403 });
    if (attempt.isSubmitted) { navigate(`/student/complete/${attemptId}`, { replace: true }); return; }
    [list, saved] = await Promise.all([questions.byCourse(attempt.courseId), answers.byAttempt(attemptId)]);
  } catch (err) {
    ctx.html(html`<div class="card">${errorState(err, { retry: false })}</div>`);
    return;
  }
  if (!ctx.alive()) return;
  if (!list.length) {
    ctx.html(html`<div class="card">${emptyState({ icon: 'circle-help', title: 'This exam has no questions', text: 'Please contact your administrator.', action: { label: 'Back to exams', href: '#/student/exams' } })}</div>`);
    return;
  }

  setTopbarContext(`${attempt.courseCode || ''} ${attempt.courseTitle ? '· ' + attempt.courseTitle : ''}`);

  const qMap = new Map(list.map((q) => [q.id, q]));
  const sel = new Map();        // questionId -> letter
  const ids = new Map();        // questionId -> examAnswer id
  const sentVal = new Map();    // questionId -> last value confirmed by the server
  const status = new Map();     // questionId -> 'saved' | 'saving' | 'error'
  const chain = new Map();      // questionId -> promise (serialises saves per question)
  let idx = 0;
  let submitting = false;

  for (const a of saved) {
    const q = qMap.get(a.questionId);
    if (!q) continue;
    ids.set(a.questionId, a.id);
    const letter = selectedLetter(q, a.selectedAnswer);
    if (letter) { sel.set(a.questionId, letter); sentVal.set(a.questionId, a.selectedAnswer); status.set(a.questionId, 'saved'); }
  }

  const draftKey = `examora.draft.${attemptId}`;
  const readDraft = () => { try { return JSON.parse(sessionStorage.getItem(draftKey)) || {}; } catch { return {}; } };
  const writeDraft = () => { try { sessionStorage.setItem(draftKey, JSON.stringify(Object.fromEntries(sel))); } catch { /* storage unavailable */ } };
  const clearDraft = () => { try { sessionStorage.removeItem(draftKey); } catch { /* ignore */ } };
  for (const [qid, letter] of Object.entries(readDraft())) {
    if (qMap.has(qid) && ['A', 'B', 'C', 'D'].includes(letter)) sel.set(qid, letter);
  }

  const answeredCount = () => list.filter((q) => sel.has(q.id)).length;

  /* ---------- persistence ---------- */
  async function refreshIds() {
    for (const a of await answers.byAttempt(attemptId)) ids.set(a.questionId, a.id);
  }

  

  async function persist(qid) {
    const letter = sel.get(qid);
    if (!letter) return;
    const q = qMap.get(qid);
    const value = answerPayload(letter, q);
    if (sentVal.get(qid) === value) { if (sel.get(qid) === letter) status.set(qid, 'saved'); return; }
    const dto = { examAttemptId: attemptId, questionId: qid, selectedAnswer: value };
    try {
      if (ids.has(qid)) {
        await answers.update(ids.get(qid), dto);
      } else {
        let created = true;
        try { await answers.create(dto); } catch (err) { if (err.status !== 409) throw err; created = false; }
        await refreshIds();
        if (!created && ids.has(qid)) await answers.update(ids.get(qid), dto);
      }
      sentVal.set(qid, value);
      if (answerPayload(sel.get(qid), q) === value) status.set(qid, 'saved');
    } catch (err) {
      status.set(qid, 'error');
      if (err.status === 409 || err.status === 403) toastError(err, 'This answer could not be saved.');
      throw err;
    }
  }

  /* ---------- rendering ---------- */
  const q0 = () => list[idx];

    function saveStateHtml() {
    if (sel.has(q0().id)) return html`<span class="save-state save-state--saved">${icon('circle-check')} Answer selected. You can change it before you submit.</span>`;
    return html`<span class="save-state muted">Not answered</span>`;
  }

  function questionHtml() {
    const q = q0();
    const chosen = sel.get(q.id);
    return html`
      <div class="exam__head">
        <div><p class="exam__course">${attempt.courseCode} · ${attempt.courseTitle}</p><h1 style="font-size:1.25rem">Examination</h1></div>
        <div id="save-state" aria-live="polite">${saveStateHtml()}</div>
      </div>
      <div class="exam__qmeta"><span>Question ${idx + 1} of ${list.length}</span><span>${fmtNum(q.marks)} mark${q.marks === 1 ? '' : 's'}</span></div>
      <fieldset>
        <legend class="question__text">${q.questionText}</legend>
        <div class="options">${optionsOf(q).map((o) => html`<label class="option"><input type="radio" name="answer" value="${o.letter}"${chosen === o.letter ? html` checked` : ''}><span class="option__key" aria-hidden="true">${o.letter}</span><span class="option__text">${o.text}</span></label>`)}</div>
      </fieldset>
      <div class="exam__nav">
        <button type="button" class="btn btn--secondary" data-nav="prev"${idx === 0 ? html` disabled` : ''}>${icon('arrow-left')} Previous</button>
        ${idx === list.length - 1
          ? html`<button type="button" class="btn btn--dark" data-submit>${icon('send')} Submit exam</button>`
          : html`<button type="button" class="btn btn--primary" data-nav="next">Next ${icon('arrow-right')}</button>`}
      </div>`;
  }

  function sideHtml() {
    const n = answeredCount();
    return html`
      <section class="card"><div class="card__body stack stack--sm">
        <div class="row row--between"><strong>Progress</strong><span class="small muted">${n} of ${list.length} answered</span></div>
        ${progressBar(n, list.length, 'Questions answered')}
        <nav aria-label="Question navigation"><div class="qgrid">${list.map((q, i) => html`<button type="button" class="qgrid__btn" data-goto="${i}" data-answered="${sel.has(q.id)}"${i === idx ? html` aria-current="true"` : ''} aria-label="Question ${i + 1}, ${sel.has(q.id) ? 'answered' : 'unanswered'}">${i + 1}</button>`)}</div></nav>
        <div class="legend"><span><i class="is-answered"></i> Answered</span><span><i></i> Unanswered</span></div>
      </div></section>
      <button type="button" class="btn btn--dark btn--block" data-submit>${icon('send')} Submit exam</button>
            <button type="button" class="btn btn--ghost btn--block" data-exit>Exit exam</button>
      <p class="small muted">Started ${fmtDateTime(attempt.startedAt)}. Your answers are sent when you submit, and you can change them until then.</p>`;
  }

  ctx.html(html`<div class="exam">
    <section class="card" aria-label="Question"><div class="card__body" id="exam-main"></div></section>
    <aside class="exam__side" id="exam-side" aria-label="Exam navigation"></aside>
  </div>`);

  const mainEl = ctx.root.querySelector('#exam-main');
  const sideEl = ctx.root.querySelector('#exam-side');
  const renderMain = () => { mainEl.innerHTML = String(questionHtml()); window.lucide?.createIcons?.(); };
  const renderSide = () => { sideEl.innerHTML = String(sideHtml()); window.lucide?.createIcons?.(); };
  const renderSaveState = () => { const el = ctx.root.querySelector('#save-state'); if (el) { el.innerHTML = String(saveStateHtml()); window.lucide?.createIcons?.(); } };
  const go = (i) => { idx = Math.max(0, Math.min(list.length - 1, i)); renderMain(); renderSide(); mainEl.closest('.card').scrollIntoView({ block: 'start' }); };
  renderMain(); renderSide();

  /* ---------- interactions ---------- */
    ctx.root.addEventListener('change', (e) => {
    if (!e.target.matches('input[name="answer"]')) return;
    sel.set(q0().id, e.target.value); // held in the browser only; nothing is sent yet
    writeDraft();
    renderSide();
    renderSaveState();
  });

  ctx.root.addEventListener('click', async (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.nav === 'prev') go(idx - 1);
    else if (t.dataset.nav === 'next') go(idx + 1);
    else if (t.dataset.goto !== undefined) go(Number(t.dataset.goto));
   
        else if (t.hasAttribute('data-exit')) {
      const ok = await confirmDialog({
        title: 'Leave the exam?',
        message: 'Your exam has not been submitted.',
        confirmText: 'Leave exam',
        tone: 'primary',
      });
      if (ok) navigate('/student/exams');
    } else if (t.hasAttribute('data-submit')) submit();
  });

   // Sends every selected answer. persist() creates a new answer or updates one that already exists.
  async function sendAnswers() {
    for (const q of list) {
      if (!sel.has(q.id)) continue;
      try { await persist(q.id); } catch { return false; }
    }
    return true;
  }

  async function submit() {
    if (submitting) return;
    const unanswered = list.length - answeredCount();
    const ok = await confirmDialog({
      title: 'Submit your exam?',
      message: unanswered
        ? `You have ${unanswered} unanswered question${unanswered === 1 ? '' : 's'}. Once submitted you cannot change your answers. Submit anyway?`
        : 'Once submitted you cannot change your answers.',
      confirmText: 'Submit exam',
      tone: 'primary',
    });
    if (!ok || submitting) return;
    submitting = true;
    const buttons = [...ctx.root.querySelectorAll('[data-submit]')];
    buttons.forEach((b) => setBusy(b, true, 'Submitting…'));
    try {
            if (!(await sendAnswers())) {
        toast('Your answers could not be sent. Check your connection and try again. Your exam has NOT been submitted.', { type: 'error', timeout: 9000 });
        return;
      }
      await attempts.submit(attemptId);
      clearDraft();
      navigate(`/student/complete/${attemptId}`, { replace: true });
    } catch (err) {
            if (err.status === 409) { clearDraft(); navigate(`/student/complete/${attemptId}`, { replace: true }); return; }
      toastError(err, 'Your exam has not been submitted. Please try again.');
    } finally {
      submitting = false;
      if (ctx.alive()) renderSide(), renderMain();
    }
  }

    const warn = (e) => { if (sel.size) { e.preventDefault(); e.returnValue = ''; } };
  window.addEventListener('beforeunload', warn);
  return () => { window.removeEventListener('beforeunload', warn); setTopbarContext(''); };
}

async function examComplete(ctx) {
  const id = ctx.params.attemptId;
  const sid = ctx.session.studentId;
  ctx.html(loading());
  let a;
  try { a = await attempts.get(id); } catch (err) { ctx.html(html`<div class="card">${errorState(err, { retry: false })}</div>`); return; }
  if (!a.isSubmitted) { navigate(`/student/take/${id}`, { replace: true }); return; }
  setTopbarContext(`${a.courseCode || ''}`);

  let triedGenerate = false;
  const check = async ({ generate }) => {
    let result = null; let note = '';
    const found = await settle(results.byStudent(sid));
    if (!found.error) result = found.value.find((r) => r.courseId === a.courseId) || null;
    if (!result && generate && !triedGenerate) {
      triedGenerate = true;
      const g = await settle(results.generate(id)); // the server computes the result
      if (!g.error) result = g.value;
      else if (g.error.status === 409) result = (await settle(results.byStudent(sid))).value?.find((r) => r.courseId === a.courseId) || null;
      else note = g.error.message;
    }
    return { result, note };
  };

  const draw = ({ result, note }) => ctx.html(html`<div class="card complete">
    <div class="complete__icon">${icon('circle-check')}</div>
    <h1>Exam submitted</h1>
    <p class="muted">Your answers have been received.</p>
    ${dl([
      ['Examination', `${a.courseCode} · ${a.courseTitle}`],
      ['Submitted', fmtDateTime(a.submittedAt)],
      ['Submission status', badge('Submitted', 'success')],
      ['Result', result ? badge('Available', 'success') : badge('Not available yet', 'warning')],
    ])}
    ${!result ? html`<p class="muted small">${note ? 'Your result could not be generated yet.' : 'Your result will appear once it has been generated.'}</p>` : ''}
    <div class="row" style="justify-content:center">
      ${result ? html`<a class="btn btn--primary" href="#/student/results/${result.id}">View result</a>` : html`<button type="button" class="btn btn--secondary" data-check>Check again</button>`}
      <a class="btn btn--secondary" href="#/student/exams">Back to exams</a>
    </div>
  </div>`);

  draw(await check({ generate: true }));
  ctx.root.addEventListener('click', async (e) => {
    if (!e.target.closest('[data-check]')) return;
    triedGenerate = false;
    draw(await check({ generate: true }));
  });
  return () => setTopbarContext('');
}

export const examTakingRoutes = [
  { path: '/student/take/:attemptId', role: 'student', layout: 'focus', title: 'Exam', render: takeExam },
  { path: '/student/complete/:attemptId', role: 'student', layout: 'focus', title: 'Exam submitted', render: examComplete },
];
