/** Multiple-choice helpers. The API's question DTO has four fixed options (A–D). */
import { CONFIG } from './config.js';

export const LETTERS = ['A', 'B', 'C', 'D'];

/** Non-empty options of a QuestionDto as [{ letter, text }]. */
export const optionsOf = (q) =>
  LETTERS.map((letter) => ({ letter, text: q[`option${letter}`] })).filter((o) => o.text && String(o.text).trim());

/** The value sent to the API for a chosen option (see CONFIG.ANSWER_FORMAT). */
export const answerPayload = (letter, q) => (CONFIG.ANSWER_FORMAT === 'text' ? q[`option${letter}`] : letter);

/** Map a stored selectedAnswer back to an option letter. */
export function selectedLetter(q, selectedAnswer) {
  if (selectedAnswer == null || selectedAnswer === '') return null;
  if (CONFIG.ANSWER_FORMAT === 'text') return LETTERS.find((l) => q[`option${l}`] === selectedAnswer) || null;
  const l = String(selectedAnswer).trim().toUpperCase();
  return LETTERS.includes(l) ? l : null;
}
