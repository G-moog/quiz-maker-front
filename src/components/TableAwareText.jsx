import { parseTextBlocks } from "../utils/textBlocks";

const tableStyle = { borderCollapse: "collapse", margin: "10px 0" };
const cellStyle = {
  border: "1px solid #2e2e2e",
  padding: "8px 14px",
  fontSize: "inherit",
  color: "inherit",
  verticalAlign: "top",
};

/**
 * TableAwareText – 문제 텍스트를 "표" 문법(| 칸 | 칸 |)을 인식해 렌더링
 *
 * text        : 원본 문제 문자열 (표 문법 + ___ 빈칸 포함 가능)
 * renderBlank : (index: number) => ReactNode – "___" 하나를 만날 때마다 순서대로 호출
 *               생략 시 "___"를 문자 그대로 표시 (FILL이 아닌 문항용)
 */
export default function TableAwareText({ text, renderBlank }) {
  const blocks = parseTextBlocks(text);
  let blankIndex = 0;

  function renderSegment(content, key) {
    const parts = content.split("___");
    return parts.map((part, pi) => (
      <span key={`${key}-${pi}`}>
        <span style={{ whiteSpace: "pre-wrap" }}>{part}</span>
        {pi < parts.length - 1 && (renderBlank ? renderBlank(blankIndex++) : "___")}
      </span>
    ));
  }

  return (
    <>
      {blocks.map((block, bi) => {
        if (block.type === "table") {
          return (
            <table key={`tbl-${bi}`} style={tableStyle}>
              <tbody>
                {block.rows.map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cell, ci) => (
                      <td key={ci} style={cellStyle}>
                        {renderSegment(cell, `${bi}-${ri}-${ci}`)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          );
        }
        if (!block.content) return null;
        return <div key={`txt-${bi}`}>{renderSegment(block.content, `t${bi}`)}</div>;
      })}
    </>
  );
}
