// 문제 텍스트를 "일반 텍스트" / "표" 블록으로 분리하는 파서
// "|"로 시작하고 끝나는 연속된 줄을 표 블록으로 인식한다.
const TABLE_LINE = /^\s*\|.*\|\s*$/;

export function parseTextBlocks(text) {
  const lines = (text || "").split("\n");
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    if (TABLE_LINE.test(lines[i])) {
      const rows = [];
      while (i < lines.length && TABLE_LINE.test(lines[i])) {
        rows.push(
          lines[i].trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim())
        );
        i++;
      }
      blocks.push({ type: "table", rows });
    } else {
      const textLines = [];
      while (i < lines.length && !TABLE_LINE.test(lines[i])) {
        textLines.push(lines[i]);
        i++;
      }
      blocks.push({ type: "text", content: textLines.join("\n") });
    }
  }
  return blocks;
}

// ── 제목 줄 ──
// 노션에서 옮긴 페이지(quiz-maker-notion)는 절 제목 줄 앞에 '■ ', 소제목 줄 앞에 '□ ' 를 붙이고,
// 맨 첫 줄에 '《페이지 제목》' 을 둔다. 표 줄(| … |)은 제목으로 보지 않는다.
const H1_LINE = /^\s*■\s/;
const H2_LINE = /^\s*□\s/;
const TITLE_LINE = /^《.*》$/;

// 줄 하나의 제목 종류: "title" | "h1" | "h2" | null. first: 글 전체에서 처음으로 나온 빈 줄 아닌 줄인가
export function headingKind(line, first = false) {
  const t = (line || "").trim();
  if (!t) return null;
  if (first && TITLE_LINE.test(t)) return "title";
  if (H1_LINE.test(line)) return "h1";
  if (H2_LINE.test(line)) return "h2";
  return null;
}

// 글 덩어리 하나에 모으는 빈칸 수(넘으면 그 줄 끝에서 새 덩어리). 빈칸을 열면 그 빈칸이 든 덩어리만 다시 그리므로
// 너무 크면 다시 그리는 양이 늘고, 너무 작으면(줄마다) span 이 늘어 배치가 무거워진다
const SEG_BLANKS = 8;

// 화면에 그릴 본문 모양(TableAwareText 가 그대로 그림) — 한 번 만들어 두고(useMemo) 빈칸을 열고 닫을 때는 다시 만들지 않는다.
//  blocks: [{ type: "table", rows, cells: [[{ parts, start }]], start, count }
//           | { type: "text", segs: [{ parts, start, count, kind, hid }] }]
//   글 블록은 덩어리(seg)로 나눈다: 제목 줄은 한 줄이 한 덩어리, 나머지 줄은 이어 붙이되 빈칸이 SEG_BLANKS 개가 되면 그 줄 끝에서 끊는다
//   parts: 덩어리(또는 칸) 글을 "___" 로 나눈 조각, start: 첫 빈칸 번호, count: 빈칸 수
//   kind/hid: 제목 줄이면 종류와 제목 번호(0부터, 글 순서) — 목차·이어 보기가 [data-qm-h=번호] 로 찾는다
//  headings: [{ kind, hid, label, blank }] — blank: 그 제목 앞에 있는 빈칸 수(= 제목 뒤 첫 빈칸 번호)
//  blankCount: 빈칸 수
// 빈칸 번호는 예전과 같다: 글 블록·표 칸을 넘나들며 읽는 순서대로(줄 순서 → 표는 칸 순서 → 칸 안 왼쪽부터) = answers[i]
// 글 블록 앞뒤의 빈 줄은 지운다(표 아래 틈 — TableAwareText 설명). 지워도 ___ 수·순서는 그대로
export function textModel(text) {
  const blocks = [];
  const headings = [];
  let blank = 0;
  let hid = 0;
  let seen = false; // 빈 줄 아닌 줄이 이미 나왔나(《제목》은 맨 첫 줄만)
  for (const b of parseTextBlocks(text)) {
    if (b.type === "table") {
      const start = blank;
      const cells = b.rows.map((row) => row.map((cell) => {
        const parts = cell.split("___");
        const c = { parts, start: blank };
        blank += parts.length - 1;
        return c;
      }));
      if (b.rows.length) seen = true;
      blocks.push({ type: "table", rows: b.rows, cells, start, count: blank - start });
      continue;
    }
    const content = b.content.replace(/^[\r\n]+|[\r\n]+$/g, "");
    if (!content) continue;
    const raw = content.split("\n");
    const segs = [];
    let run = null; // 이어 붙이는 중인 보통 줄들 { text, start, count }
    const flush = () => {
      if (!run) return;
      const parts = run.text.split("___");
      segs.push({ parts, start: run.start, count: parts.length - 1, kind: null, hid: null });
      run = null;
    };
    raw.forEach((line, li) => {
      const kind = headingKind(line, !seen);
      if (line.trim()) seen = true;
      // 줄바꿈은 줄 끝에 붙여 둔다(pre-wrap 이 줄을 바꿈) — 예전처럼 블록 하나를 통째로 그린 것과 같은 글
      const full = li < raw.length - 1 ? `${line}\n` : line;
      const count = line.split("___").length - 1;
      if (kind) {
        flush();
        segs.push({ parts: full.split("___"), start: blank, count, kind, hid });
        headings.push({ kind, hid, label: headingLabel(line, kind), blank });
        hid += 1;
      } else {
        if (!run) run = { text: "", start: blank, count: 0 };
        run.text += full;
        run.count += count;
      }
      blank += count;
      if (run && run.count >= SEG_BLANKS) flush();
    });
    flush();
    blocks.push({ type: "text", segs });
  }
  return { blocks, headings, blankCount: blank };
}

// 목차에 보일 제목 글: 앞 표시(■ □ 《》)를 떼고 빈칸은 '(  )' 로
function headingLabel(line, kind) {
  let t = line.trim();
  if (kind === "title") t = t.slice(1, -1);
  else t = t.replace(/^[■□]\s*/, "");
  return t.replace(/___/g, "(  )").trim() || "(제목 없음)";
}

// 목록에 보이는 문항 앞부분: 표 칸 구분선(|)과 줄바꿈은 띄어쓰기로, 빈칸(___)은 "( )" 로 바꾼 뒤 max 글자까지
// (결과 화면 문항별 목록, 편집기 문항 목록에서 '| 단계 | 기간 |' 같은 표 문법이 그대로 보이지 않게)
export function plainPreview(text, max) {
  const t = (text || "").replace(/___/g, "( )").replace(/\|/g, " ").replace(/\s+/g, " ").trim();
  if (!t) return "";
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

// 행×열 크기의 표 템플릿 문자열 생성 (커서 위치에 삽입용)
export function buildTableTemplate(rows, cols) {
  let counter = 1;
  const lines = [];
  for (let r = 0; r < rows; r++) {
    const cells = [];
    for (let c = 0; c < cols; c++) cells.push(`칸${counter++}`);
    lines.push(`| ${cells.join(" | ")} |`);
  }
  return `\n${lines.join("\n")}\n`;
}
