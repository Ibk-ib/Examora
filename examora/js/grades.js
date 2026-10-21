/**
 * Grade helpers. IMPORTANT: the API has no GPA endpoint, so any GPA computed here
 * is a PROVISIONAL client-side estimate from backend-supplied gradePoint and creditUnit,
 * shown separately from official results. Grade boundaries are never computed here:
 * grade, gradePoint and percentage always come from the API.
 */
import { fmtNum } from './utils.js';

export function provisionalGpa(resultList) {
  const rows = resultList.filter((r) => Number.isFinite(r.gradePoint) && r.creditUnit > 0);
  const credits = rows.reduce((s, r) => s + r.creditUnit, 0);
  if (!credits) return null;
  return {
    gpa: rows.reduce((s, r) => s + r.gradePoint * r.creditUnit, 0) / credits,
    credits,
    courses: rows.length,
  };
}

export function gradeDistribution(resultList) {
  const counts = new Map();
  for (const r of resultList) {
    const g = r.grade || 'N/A';
    counts.set(g, (counts.get(g) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0]))).map(([label, value]) => ({ label, value }));
}

export const averagePercent = (resultList) =>
  resultList.length ? resultList.reduce((s, r) => s + (r.percentage || 0), 0) / resultList.length : null;

export const scoreText = (r) => `${fmtNum(r.score)} / ${fmtNum(r.totalMarks)}`;
