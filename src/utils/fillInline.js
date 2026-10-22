// 빈칸 문항 편집용 글: 저장 꼴(본문의 ___ + 정답 배열)과, 노션 원문처럼 정답을 글 안에 넣은 '{{정답}}' 꼴을 오간다.
// 편집기는 '{{정답}}' 꼴로 보여 주고 고치게 한다 — 빈칸을 지우거나 끼워도 정답이 다른 빈칸으로 밀리지 않는다.
// 저장할 때는 다시 ___ + 정답 배열로 바꾸므로 서버·노션 도구·풀기 화면이 보는 꼴은 그대로다.
// Node 시험(test/app)도 그대로 불러오도록 다른 파일을 부르지 않는다.

const OPEN = "{{";
const CLOSE = "}}";
const BLANK = "___";

// '{{정답}}' 꼴로 바꾸면 되돌릴 때 글이 달라지는 문항이면 그 까닭, 괜찮으면 "".
// 글이나 정답에 {{ · }} 가 이미 있음, 빈칸 바로 앞의 '{'('{{{정답}}' 이 됨), '}' 로 끝나는 정답('정답}}}'),
// 정답 속 줄바꿈·___ — 아주 드물다. 이런 문항은 편집기에서 글·정답을 고치지 않고 그대로 둔다
export function fillLockReason(text, answers) {
  const t = String(text ?? "");
  if (t.includes(OPEN) || t.includes(CLOSE)) return "문제 글에 '{{' 나 '}}' 가 들어 있어";
  if (/\{___/.test(t)) return "빈칸(___) 바로 앞에 '{' 가 있어";
  for (const a of Array.isArray(answers) ? answers : []) {
    const s = String(a ?? "");
    if (s.includes(OPEN) || s.includes(CLOSE) || s.endsWith("}") || s.includes(BLANK) || /[\r\n]/.test(s)) {
      return "정답에 '{{'·'}}'·'___'·줄바꿈이 있거나 '}' 로 끝나";
    }
  }
  return "";
}

// 저장 꼴 → 편집 글. 빈칸 순서대로 정답을 넣는다(정답이 모자라면 '{{}}').
// 반환: { inline, blanks: 빈칸 수, extra: 빈칸보다 많아 들어가지 못한 정답들 }
export function toInline(text, answers) {
  const list = Array.isArray(answers) ? answers : [];
  let k = 0;
  const inline = String(text ?? "").replace(/___/g, () => `${OPEN}${list[k++] ?? ""}${CLOSE}`);
  return { inline, blanks: k, extra: list.slice(k) };
}

// 오류 문구에 붙이는 근처 글(앞뒤 몇 글자, 줄바꿈은 ⏎)
function near(s, at) {
  const a = Math.max(0, at - 8);
  const b = Math.min(s.length, at + 12);
  return `${a > 0 ? "…" : ""}${s.slice(a, b).replace(/\r?\n/g, "⏎")}${b < s.length ? "…" : ""}`;
}

// 편집 글 → 저장 꼴. 성공: { ok: true, text, answers }, 실패: { ok: false, error: 한국어 안내, at: 글 속 자리, length }
export function fromInline(inline) {
  const s = String(inline ?? "");
  let text = "";
  const answers = [];
  let i = 0;
  const fail = (error, at, length = 2) => ({ ok: false, error, at, length });
  while (i <= s.length) {
    const open = s.indexOf(OPEN, i);
    const close = s.indexOf(CLOSE, i);
    if (close !== -1 && (open === -1 || close < open)) {
      return fail(`'}}' 앞에 여는 '{{' 가 없습니다(${answers.length + 1}번째 빈칸 근처: "${near(s, close)}").`, close);
    }
    if (open === -1) {
      text += s.slice(i);
      break;
    }
    text += s.slice(i, open);
    const no = answers.length + 1;
    const end = s.indexOf(CLOSE, open + OPEN.length);
    const nextOpen = s.indexOf(OPEN, open + OPEN.length);
    const lineEnd = s.slice(open, end === -1 ? undefined : end).search(/[\r\n]/);
    if (end === -1 || (nextOpen !== -1 && nextOpen < end) || lineEnd !== -1) {
      return fail(`${no}번째 빈칸의 '{{' 가 '}}' 로 닫히지 않았습니다(근처: "${near(s, open)}"). 정답 뒤에 '}}' 를 넣어 주세요.`, open);
    }
    const answer = s.slice(open + OPEN.length, end);
    if (!answer.trim()) {
      return fail(`${no}번째 빈칸의 정답이 비어 있습니다(근처: "${near(s, open)}"). '{{' 와 '}}' 사이에 정답을 넣어 주세요.`, open, end + CLOSE.length - open);
    }
    if (answer.includes(BLANK)) {
      return fail(`${no}번째 빈칸의 정답에 '___' 를 넣을 수 없습니다.`, open, end + CLOSE.length - open);
    }
    answers.push(answer);
    text += BLANK;
    i = end + CLOSE.length;
  }
  // 글에 그대로 남은 ___ 나, 빈칸 앞뒤의 '_' 가 이어져 빈칸 수가 달라지면 저장 꼴에서 정답이 어긋난다
  const count = (text.match(/___/g) || []).length;
  if (count !== answers.length) {
    const stray = s.search(/___/);
    return fail(
      stray !== -1
        ? `글에 '___' 가 그대로 있습니다(근처: "${near(s, stray)}"). 빈칸은 {{정답}} 으로 표시해 주세요.`
        : "빈칸 앞뒤의 '_' 때문에 빈칸 수가 어긋납니다. 빈칸 바로 앞뒤의 '_' 를 지워 주세요.",
      stray === -1 ? 0 : stray,
      stray === -1 ? 0 : 3,
    );
  }
  return { ok: true, text, answers };
}
