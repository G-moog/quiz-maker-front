import { parseTextBlocks } from "../utils/textBlocks";

// 칸 글 길이. 공백 없이 긴 덩어리(주소 등)는 어차피 칸 안에서 줄바꿈되므로 8글자로만 셈
function cellLength(cell) {
  return cell
    .split(/\s+/)
    .filter(Boolean)
    .reduce((sum, word, i) => sum + (i > 0 ? 1 : 0) + Math.min(word.length, 8), 0);
}

// 표 열마다 두 값을 정한다 (index.css 의 .qm-table 이 CSS 변수로 사용)
//  w   (--qm-col-w) : 좁은 화면(고정 배치)의 열 너비 비율. 글이 짧은 열(구분·항목)은 좁게, 긴 열은 넓게.
//                     제곱근으로 눌러 긴 열이 폭을 독차지하지 않게 하고(6~16글자 → 최대 약 1.6배),
//                     열이 6개 이상이면 8글자에서 잘라(최대 약 1.15배) 좁은 열에도 두 자리 빈칸 번호·'20도' 같은
//                     짧은 낱말이 한 줄에 들어가게 함 (360px 화면의 7열 표 첫 열 약 37px)
//  min (--qm-min)   : 넓은 화면(자동 배치)의 칸 최소 너비. 열에서 가장 긴 낱말 길이만큼은 지켜 긴 열 옆에서
//                     짧은 이름이 쪼개지지 않게 함. 상한은 열이 적을수록 넉넉히(2열 8글자, 3~4열 6글자, 5열 이상 4글자)
//                     — 'µm(마이크로미터)' 같은 용어 칸이 낱말 가운데서 갈리지 않으면서, 칸 최소 너비 합은
//                     카드 폭(약 590px) 안에 들어가게
function columnSizes(rows) {
  const colCount = Math.max(0, ...rows.map((r) => r.length));
  const maxLen = colCount >= 6 ? 8 : 16;
  const minCap = colCount <= 2 ? 8 : colCount <= 4 ? 6 : 4;
  const cols = Array.from({ length: colCount }, (_, ci) => {
    const cells = rows.map((r) => r[ci] ?? "");
    const len = Math.max(...cells.map(cellLength));
    const word = Math.max(...cells.flatMap((c) => c.split(/\s+/).map((t) => t.length)));
    return { weight: Math.sqrt(Math.min(Math.max(len, 6), maxLen)), min: Math.min(word, minCap) };
  });
  const total = cols.reduce((a, c) => a + c.weight, 0);
  return cols.map((c) => ({ w: `${((c.weight / total) * 100).toFixed(2)}%`, min: `${c.min}em` }));
}

/**
 * TableAwareText – 문제 텍스트를 "표" 문법(| 칸 | 칸 |)을 인식해 렌더링
 *
 * text        : 원본 문제 문자열 (표 문법 + ___ 빈칸 포함 가능)
 * renderBlank : (index: number, ctx: { inTable: boolean }) => ReactNode
 *               "___" 하나를 만날 때마다 읽는 순서대로(글 블록·표 칸을 넘나들며) 0부터 호출
 *               → index 는 answers[index] 와 같은 번호. ctx.inTable 은 표 칸 안이면 true
 *               생략 시 "___"를 문자 그대로 표시 (FILL이 아닌 문항용)
 *
 * 줄바꿈·표 모양은 index.css 의 .qm-text / .qm-table 참고 (가로 스크롤 없이 카드 폭 안에서 줄바꿈)
 */
export default function TableAwareText({ text, renderBlank }) {
  const blocks = parseTextBlocks(text);
  let blankIndex = 0;

  function renderSegment(content, key, inTable) {
    const parts = content.split("___");
    return parts.map((part, pi) => (
      <span key={`${key}-${pi}`}>
        <span style={{ whiteSpace: "pre-wrap" }}>{part}</span>
        {pi < parts.length - 1 && (renderBlank ? renderBlank(blankIndex++, { inTable }) : "___")}
      </span>
    ));
  }

  return (
    <>
      {blocks.map((block, bi) => {
        if (block.type === "table") {
          const sizes = columnSizes(block.rows);
          // 열이 7개 이상이면 넓은 화면에서도 칸 최소 너비 합이 카드를 넘을 수 있어 좁은 화면처럼 고정 배치.
          // 열이 5개 이상이면(--many) 휴대폰 세로에서 칸 글자·여백을 한 번 더 줄임(index.css)
          const cls = ["qm-table", sizes.length >= 5 && "qm-table--many", sizes.length >= 7 && "qm-table--fixed"];
          return (
            <table key={`tbl-${bi}`} className={cls.filter(Boolean).join(" ")}>
              <colgroup>
                {sizes.map((s, ci) => (
                  <col key={ci} style={{ "--qm-col-w": s.w }} />
                ))}
              </colgroup>
              <tbody>
                {block.rows.map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cell, ci) => (
                      <td key={ci} style={{ "--qm-min": sizes[ci].min }}>
                        {renderSegment(cell, `${bi}-${ri}-${ci}`, true)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          );
        }
        // 표 앞뒤의 빈 줄은 지운다: 표 바로 뒤 글이 "\n…" 으로 시작하면 pre-wrap 이 빈 줄 한 칸을 더 그려
        // 표 아래 틈이 크게 벌어졌다(표 margin 이 이미 띄워 줌). ___ 수·순서는 그대로라 빈칸 번호는 안전
        const content = block.content.replace(/^[\r\n]+|[\r\n]+$/g, "");
        if (!content) return null;
        return <div key={`txt-${bi}`} className="qm-text">{renderSegment(content, `t${bi}`, false)}</div>;
      })}
    </>
  );
}
