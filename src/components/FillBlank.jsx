// 풀기 화면의 빈칸 단추: 가린 상태는 번호(index + 1), 연 상태는 정답. SolveView·펜 시험 페이지가 함께 쓴다.
// data-ink-blank: 필기 모드에서 펜 두 번 콕이 어느 빈칸인지 찾는 표시(InkInput)
//
// 단추 모양
//  표 칸 안(inTable): 좁은 칸을 넘지 않게 여백·테두리를 줄임. 연 상태의 긴 정답은 버튼 안에서 줄바꿈
//  가린 상태의 번호는 줄바꿈 금지 — 칸이 좁아도 "13" 이 "1/3" 처럼 세로로 쪼개지지 않게
//  fixed(필기 층이 켜졌을 때): 번호와 정답을 한 칸에 겹쳐 그리고(inline-grid) 안 보이는 쪽은 visibility: hidden —
//   열고 닫아도 단추 크기가 그대로라 줄이 바뀌지 않는다(아래 글과 필기가 어긋나지 않게). 꺼져 있으면 예전 모양 그대로
function blankStyle(revealed, inTable, fixed) {
  return {
    display: fixed ? "inline-grid" : "inline-flex", alignItems: "center", justifyContent: "center",
    ...(fixed ? { justifyItems: "center" } : {}),
    minWidth: inTable ? "min(40px, 100%)" : 64, maxWidth: "100%",
    padding: inTable ? "1px 3px" : "2px 14px", margin: inTable ? "1px 0" : "0 3px",
    verticalAlign: "middle", borderRadius: inTable ? 5 : 6,
    fontSize: inTable ? 13 : 14, fontWeight: 700, cursor: "pointer",
    border: `${inTable ? 1.5 : 2}px ${revealed ? "solid" : "dashed"} #f59e0b`,
    background: revealed ? "#f59e0b" : "transparent",
    color: revealed ? "#1a1a1a" : "#f59e0b",
    transition: "all 0.2s ease",
    lineHeight: 1.4,
    ...(revealed || fixed ? {} : { whiteSpace: "nowrap", overflowWrap: "normal" }),
  };
}

const CELL = { gridArea: "1 / 1" };

export default function FillBlank({ index, revealed, answer, inTable = false, fixed = false, onToggle }) {
  const shown = answer ?? "?";
  return (
    <button
      className="qm-blank"
      data-ink-blank={index}
      style={blankStyle(revealed, inTable, fixed)}
      onClick={() => onToggle(index)}
      title={revealed ? "클릭하여 가리기" : `클릭하여 ${index + 1}번 빈칸 정답 확인`}
    >
      {fixed ? (
        <>
          <span style={{ ...CELL, whiteSpace: "nowrap", visibility: revealed ? "hidden" : "visible" }}>{index + 1}</span>
          <span style={{ ...CELL, visibility: revealed ? "visible" : "hidden" }}>{shown}</span>
        </>
      ) : revealed ? shown : index + 1}
    </button>
  );
}
