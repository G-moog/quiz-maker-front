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
