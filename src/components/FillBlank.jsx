import { memo } from "react";

// 풀기 화면의 빈칸 단추: 가린 상태는 번호(index + 1), 연 상태는 정답. SolveView·펜 시험 페이지가 함께 쓴다.
// data-ink-blank: 필기 모드에서 펜 두 번 콕이 어느 빈칸인지 찾는 표시(InkInput). 이어 보기·'다음 가린 빈칸'도 이걸로 찾는다
//
// 단추 모양
//  표 칸 안(inTable): 좁은 칸을 넘지 않게 여백·테두리를 줄임. 연 상태의 긴 정답은 버튼 안에서 줄바꿈
//  가린 상태의 번호는 줄바꿈 금지 — 칸이 좁아도 "13" 이 "1/3" 처럼 세로로 쪼개지지 않게
//  fixed(필기 층이 켜졌을 때): 번호와 정답을 한 칸에 겹쳐 그리고(inline-grid) 안 보이는 쪽은 visibility: hidden —
//   열고 닫아도 단추 크기가 그대로라 줄이 바뀌지 않는다(아래 글과 필기가 어긋나지 않게). 꺼져 있으면 예전 모양 그대로
//  star(★ 헷갈림 표시): 테두리 색만 바꾸고 오른쪽 위에 작은 ★ 를 겹쳐 띄운다(position: absolute — 단추 크기·줄 배치는 그대로,
//   fixed 의 겹쳐 그리기도 그대로). ★ 모양은 views/solve.css .qm-blank-star
const STAR_BORDER = "#f472b6";

function blankStyle(revealed, inTable, fixed, star) {
  return {
    display: fixed ? "inline-grid" : "inline-flex", alignItems: "center", justifyContent: "center",
    ...(fixed ? { justifyItems: "center" } : {}),
    minWidth: inTable ? "min(40px, 100%)" : 64, maxWidth: "100%",
    padding: inTable ? "1px 3px" : "2px 14px", margin: inTable ? "1px 0" : "0 3px",
    verticalAlign: "middle", borderRadius: inTable ? 5 : 6,
    fontSize: inTable ? 13 : 14, fontWeight: 700, cursor: "pointer",
    border: `${inTable ? 1.5 : 2}px ${revealed ? "solid" : "dashed"} ${star ? STAR_BORDER : "#f59e0b"}`,
    background: revealed ? "#f59e0b" : "transparent",
    color: revealed ? "#1a1a1a" : "#f59e0b",
    // 바뀌는 색만 부드럽게(예전 all 은 바뀌지 않는 속성까지 지켜봄)
    transition: "background-color 0.2s ease, color 0.2s ease, border-color 0.2s ease",
    lineHeight: 1.4,
    ...(revealed || fixed ? {} : { whiteSpace: "nowrap", overflowWrap: "normal" }),
  };
}

const CELL = { gridArea: "1 / 1" };

// memo: 빈칸이 230개인 페이지에서 하나를 열 때 나머지 단추는 다시 그리지 않는다(부모는 onToggle 을 고정된 함수로 넘김)
// note: 이 빈칸에 쓴 질문 메모 — 0 없음 · 1 미해결이 있음 · 2 모두 해결. 있으면 왼쪽 위에 ✎ 를 겹쳐 띄운다
//  (★ 처럼 position: absolute — 단추 크기·줄 배치는 그대로라 필기가 어긋나지 않음). ✎ 를 누르면 빈칸은 열지 않고 onNote(index)
function FillBlank({ index, revealed, star = false, note = 0, answer, inTable = false, fixed = false, onToggle, onNote }) {
  const shown = answer ?? "?";
  return (
    <button
      className="qm-blank"
      data-ink-blank={index}
      data-star={star ? "" : undefined}
      style={blankStyle(revealed, inTable, fixed, star)}
      onClick={() => onToggle(index)}
      aria-pressed={revealed}
      title={(revealed ? "눌러서 가리기" : `눌러서 ${index + 1}번 빈칸 정답 확인`) + (star ? " · ★ 헷갈림 표시" : "") + (note ? " · ✎ 메모 있음" : "")}
    >
      {fixed ? (
        <>
          <span style={{ ...CELL, whiteSpace: "nowrap", visibility: revealed ? "hidden" : "visible" }}>{index + 1}</span>
          <span style={{ ...CELL, visibility: revealed ? "visible" : "hidden" }}>{shown}</span>
        </>
      ) : revealed ? shown : index + 1}
      {star && <span className="qm-blank-star">★</span>}
      {note > 0 && onNote && (
        <span
          className="qm-blank-note"
          data-note-mark=""
          data-resolved={note === 2 ? "" : undefined}
          role="button"
          tabIndex={0}
          aria-label={`${index + 1}번 빈칸에 쓴 메모 보고 고치기`}
          title="이 빈칸에 쓴 메모 보고 고치기"
          onClick={(e) => { e.stopPropagation(); e.preventDefault(); onNote(index); }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); e.preventDefault(); onNote(index); }
          }}
        >✎</span>
      )}
    </button>
  );
}

export default memo(FillBlank);
