// 메모 맥락 글: 그 빈칸 표시 '[N: 정답]' 만 노란 글씨로 (나머지는 부모의 회색 그대로)
export default function NoteContextText({ text, blankNo }) {
  if (!blankNo) return text;
  const mark = new RegExp(`(\\[${Number(blankNo)}: [^\\]]*\\])`);
  const parts = String(text || "").split(mark);
  return parts.map((p, i) =>
    i % 2 === 1 ? <span key={i} style={{ color: "#f5b544", fontWeight: 600 }}>{p}</span> : p
  );
}
