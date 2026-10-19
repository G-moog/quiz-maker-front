// FILL 문항의 answers(배열 또는 JSON 문자열)를 문자열 배열로 정규화
export function parseAnswers(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try { return JSON.parse(raw); } catch { return []; }
}
