import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { useBack } from "../utils/backStack";
import { TABLETS } from "./tablet";

// 태블릿 고르기 창('필기 모드' 단추를 꾹 눌러 엶). 목차 창(SolveToc)과 같은 꼴: body 포털 전체 덮개 + 위쪽 가운데 작은 창.
// 덮개는 손바닥 안전 영역(data-ink-palm-safe)이고 필기 영역 밖이라, 필기 모드가 켜져 있어도 펜으로 선이 생기지 않고 펜·손가락으로 고를 수 있다.
// 고르면 바로 적용하고 닫는다(이미 고른 것을 누르면 닫기만). 닫기: 바깥 덮개·✕·Esc·안드로이드 뒤로(useBack)
// props: current(지금 태블릿 id), onPick(id), onClose(), returnFocus(닫을 때 초점을 돌려줄 단추 ref)
const NO_SELECT = { userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none" };
const S = {
  overlay: {
    position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.55)",
    display: "flex", alignItems: "flex-start", justifyContent: "center",
    padding: "max(10px, 4vh) 10px 10px", touchAction: "none", ...NO_SELECT,
  },
  sheet: {
    width: "100%", maxWidth: 360, background: "#1a1a1a", border: "1px solid #2e2e2e", borderRadius: 10,
    boxShadow: "0 16px 48px rgba(0,0,0,0.6)", overflow: "hidden",
  },
  head: { display: "flex", alignItems: "center", gap: 8, padding: "6px 6px 6px 14px", borderBottom: "1px solid #2a2a2a" },
  title: { flex: 1, fontSize: 14, fontWeight: 700, color: "#f1f1f1" },
  close: {
    width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center",
    background: "none", border: "none", borderRadius: 6, color: "#8a8a8a", fontSize: 17, cursor: "pointer",
  },
  note: { padding: "8px 14px 6px", fontSize: 12, lineHeight: 1.5, color: "#9a9a9a" },
  list: { padding: "2px 0 8px" },
  option: (cur) => ({
    display: "flex", alignItems: "center", gap: 10, width: "100%", minHeight: 52, padding: "8px 14px 8px 11px",
    textAlign: "left", fontFamily: "inherit", cursor: "pointer", color: "#f1f1f1",
    background: cur ? "rgba(245,158,11,0.10)" : "transparent",
    border: "none", borderLeft: `3px solid ${cur ? "#f59e0b" : "transparent"}`,
  }),
  texts: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 },
  name: { fontSize: 14.5, fontWeight: 700 },
  sub: { fontSize: 12, color: "#9a9a9a" },
  now: { flexShrink: 0, fontSize: 12, fontWeight: 700, color: "#f59e0b" },
};
const stopMenu = (e) => e.preventDefault();

export default function TabletPicker({ current, onPick, onClose, returnFocus }) {
  const titleId = useId();
  const listRef = useRef(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useBack(true, onClose);

  // 열면 지금 고른 것에 초점, 닫으면 단추로. Esc 는 문서에서 받는다(덮개를 눌러 초점이 body 로 가도 닫히게)
  useEffect(() => {
    const el = listRef.current?.querySelector("[aria-current]") || listRef.current?.querySelector("button");
    el?.focus({ preventScroll: true });
    const btn = returnFocus?.current;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      closeRef.current?.();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      btn?.focus({ preventScroll: true });
    };
  }, [returnFocus]);

  function onKeyDown(e) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const items = [...(listRef.current?.querySelectorAll("button[data-tablet]") || [])];
    const at = items.indexOf(document.activeElement);
    const next = items[Math.min(items.length - 1, Math.max(0, at + (e.key === "ArrowDown" ? 1 : -1)))];
    if (next) {
      e.preventDefault();
      next.focus();
    }
  }

  return createPortal(
    <div style={S.overlay} onClick={onClose} onContextMenu={stopMenu} data-ink-palm-safe="">
      <div
        style={S.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div style={S.head}>
          <div id={titleId} style={S.title}>태블릿 고르기</div>
          <button type="button" style={S.close} onClick={onClose} aria-label="태블릿 고르기 닫기">✕</button>
        </div>
        <div style={S.note}>
          <div>펜과 손을 가르는 기준을 태블릿에 맞춥니다.</div>
          <div>이 기기에만 기억합니다.</div>
        </div>
        <div style={S.list} ref={listRef}>
          {TABLETS.map((t) => {
            const cur = t.id === current;
            return (
              <button
                key={t.id}
                type="button"
                data-tablet={t.id}
                style={S.option(cur)}
                aria-current={cur ? "true" : undefined}
                onClick={() => (cur ? onClose() : onPick(t.id))}
              >
                <span style={S.texts}>
                  <span style={S.name}>{t.name}</span>
                  <span style={S.sub}>{t.sub}</span>
                </span>
                {cur && <span style={S.now} aria-hidden="true">✓ 지금</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}
