// 고르기 모드의 아래 고정 막대 — 같은 자리에서 쓰는 동안의 진행('옮기는 중… 2/5', 화면은 잠김)과 일부 실패('남은 N개 다시')도 보인다.
// mode: 'select'(n개 골랐습니다 · 옮기기 · 보관함으로|꺼내기 · 취소) · 'running' · 'failed'. 배치는 DashboardView.css 의 .qm-select-bar
// 막대 높이(글이 길면 여러 줄)는 문서 맨 위의 --qm-bar-h 로 알린다 — 본문 아래 여백이 그만큼 늘어 마지막 카드가 막대에 가리지 않게
import { useLayoutEffect, useRef } from "react";

function putBarHeight(el) {
  if (el) document.documentElement.style.setProperty("--qm-bar-h", `${Math.ceil(el.getBoundingClientRect().height)}px`);
}

export default function SelectBar({
  mode, count = 0, inArchive = false, text = "", title = "", done = 0, total = 0, remaining = 0,
  onMove, onArchive, onUnarchive, onCancel, onRetry, onClose,
}) {
  const ref = useRef(null);
  // 그릴 때마다 잰다(글·단추가 바뀜 — 그리기 전에 맞춰 한 번도 가리지 않게) + 화면 폭이 바뀌어 줄 수가 달라질 때(ResizeObserver)
  useLayoutEffect(() => { putBarHeight(ref.current); });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver !== "function") return undefined;
    const ro = new ResizeObserver(() => putBarHeight(el));
    ro.observe(el);
    return () => ro.disconnect();
  }, [mode]);
  useLayoutEffect(() => () => document.documentElement.style.removeProperty("--qm-bar-h"), []);

  if (mode === "running") {
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    return (
      <div ref={ref} className="qm-select-bar" role="status" aria-live="polite" data-select-bar="running">
        <div className="qm-select-bar-in">
          <span className="qm-select-bar-text">
            {text}…{total > 0 && <span className="qm-select-bar-count" data-progress="">{done}/{total}</span>}
          </span>
          <div className="qm-bar-progress" aria-hidden="true"><div style={{ width: `${pct}%` }} /></div>
        </div>
      </div>
    );
  }
  if (mode === "failed") {
    return (
      <div ref={ref} className="qm-select-bar qm-select-bar--error" role="alert" data-select-bar="failed">
        <div className="qm-select-bar-in">
          <span className="qm-select-bar-text" title={title || undefined} data-fail-text="">{text}</span>
          <div className="qm-select-bar-btns">
            <button type="button" className="qm-bar-btn qm-bar-btn--main" onClick={onRetry} data-retry="">
              {remaining > 0 ? `남은 ${remaining}개 다시` : "다시"}
            </button>
            <button type="button" className="qm-bar-btn" onClick={onClose} data-bar-close="">닫기</button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div ref={ref} className="qm-select-bar" role="toolbar" aria-label="고른 문제집" data-select-bar="select">
      <div className="qm-select-bar-in">
        <span className="qm-select-bar-text" aria-live="polite" data-select-count={count}>
          {count > 0 ? `${count}개 골랐습니다` : "카드를 눌러 고르세요"}
        </span>
        <div className="qm-select-bar-btns">
          <button type="button" className="qm-bar-btn qm-bar-btn--main" onClick={onMove} disabled={!count} data-bar-move="">옮기기</button>
          {inArchive ? (
            <button type="button" className="qm-bar-btn" onClick={onUnarchive} disabled={!count} data-bar-unarchive="">꺼내기</button>
          ) : (
            <button type="button" className="qm-bar-btn" onClick={onArchive} disabled={!count} data-bar-archive="">보관함으로</button>
          )}
          <button type="button" className="qm-bar-btn" onClick={onCancel} data-bar-cancel="">취소</button>
        </div>
      </div>
    </div>
  );
}
