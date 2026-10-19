import { parseTextBlocks } from "../utils/textBlocks";

// 표 열마다 두 값을 정한다 (index.css 의 .qm-table 이 CSS 변수로 사용)
//  w   (--qm-col-w) : 좁은 화면(고정 배치)의 열 너비 비율. 글이 짧은 열(구분·항목)은 좁게, 긴 열은 넓게.
//                     제곱근으로 눌러 긴 주소 열이 폭을 독차지하지 않게 하고(최대 2배), 아래는 4글자로 받침
//  min (--qm-min)   : 넓은 화면(자동 배치)의 칸 최소 너비. 열에서 가장 긴 낱말 길이(최대 4글자)만큼은 지켜
//                     긴 열 옆에서 "구분" 같은 짧은 이름이 한 글자씩 쪼개지지 않게 함
function columnSizes(rows) {
  const colCount = Math.max(0, ...rows.map((r) => r.length));
  const cols = Array.from({ length: colCount }, (_, ci) => {
    const cells = rows.map((r) => r[ci] ?? "");
    const len = Math.max(...cells.map((c) => c.length));
    const word = Math.max(...cells.flatMap((c) => c.split(/\s+/).map((t) => t.length)));
    return { weight: Math.sqrt(Math.min(Math.max(len, 4), 16)), min: Math.min(word, 4) };
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
          // 열이 7개 이상이면 넓은 화면에서도 칸 최소 너비 합이 카드를 넘을 수 있어 휴대폰처럼 고정 배치
          return (
            <table key={`tbl-${bi}`} className={sizes.length >= 7 ? "qm-table qm-table--fixed" : "qm-table"}>
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
        if (!block.content) return null;
        return <div key={`txt-${bi}`} className="qm-text">{renderSegment(block.content, `t${bi}`, false)}</div>;
      })}
    </>
  );
}
