import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useBack } from "../utils/backStack";

// 목차: 긴 페이지 빈칸 문항의 '■ 절 / □ 소제목' 목록. 문항 머리 줄의 '목차' 단추로 열고, 누르면 그 제목으로 간 뒤 닫는다.
//  headings: textModel(text).headings, blankState: 빈칸마다 열렸나(절마다 '연 빈칸/전체' 표시), getCurrent(): 지금 읽는 제목 번호
//  onJump(hid): 그 제목으로 스크롤(닫는 것은 여기서). 안드로이드 뒤로 가기·Esc 로도 닫힌다(useBack — 앱이 닫히지 않게)
//  창은 화면 위쪽에 작게(본문을 덜 가리게), 목록이 길면 창 안에서 스크롤.
const S = {
  btn: {
    padding: "6px 10px", minHeight: 36,
    background: "transparent", color: "#c4c4c4",
    border: "1px solid #3a3a3a", borderRadius: 7,
    fontWeight: 700, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap",
    transition: "opacity 0.15s ease",
  },
  overlay: {
    position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.55)",
    display: "flex", alignItems: "flex-start", justifyContent: "center",
    padding: "max(10px, 4vh) 10px 10px",
  },
  sheet: {
    width: "100%", maxWidth: 480, maxHeight: "100%", display: "flex", flexDirection: "column",
    background: "#1a1a1a", border: "1px solid #2e2e2e", borderRadius: 10,
    boxShadow: "0 16px 48px rgba(0,0,0,0.6)", overflow: "hidden",
  },
  head: {
    display: "flex", alignItems: "center", gap: 8, padding: "6px 6px 6px 14px",
    borderBottom: "1px solid #2a2a2a", flexShrink: 0,
  },
  title: { flex: 1, fontSize: 14, fontWeight: 700, color: "#f1f1f1" },
  close: {
    width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center",
    background: "none", border: "none", borderRadius: 6, color: "#8a8a8a", fontSize: 17, cursor: "pointer",
  },
  list: { overflowY: "auto", padding: "4px 0 6px", overscrollBehavior: "contain" },
  item: (kind, current) => ({
    display: "flex", alignItems: "baseline", gap: 8, width: "100%", minHeight: 34, textAlign: "left",
    padding: kind === "h2" ? "6px 12px 6px 30px" : "6px 12px 6px 14px",
    background: current ? "rgba(245,158,11,0.10)" : "transparent",
    border: "none", borderLeft: `3px solid ${current ? "#f59e0b" : "transparent"}`,
    color: kind === "title" ? "#f59e0b" : kind === "h1" ? "#f1f1f1" : "#b8b8b8",
    fontSize: kind === "h2" ? 13 : 13.5, fontWeight: kind === "h2" ? 500 : 700, lineHeight: 1.4,
    cursor: "pointer", fontFamily: "inherit",
  }),
  label: { flex: 1, minWidth: 0, overflowWrap: "anywhere" },
  count: (all) => ({ flexShrink: 0, fontSize: 11.5, fontWeight: 600, color: all ? "#34d399" : "#7a7a7a" }),
};

const LEVEL = { title: 0, h1: 1, h2: 2 };

export default function SolveToc({ headings, blankState, blankCount, getCurrent, onJump }) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState(null);
  const btnRef = useRef(null);
  const listRef = useRef(null);
  useBack(open, () => setOpen(false));

  // 절마다 빈칸 범위: 다음 같은 단계 이상의 제목 앞까지(《제목》은 페이지 전체라 세지 않음)
  const ranges = useMemo(() => headings.map((h, j) => {
    if (h.kind === "title") return null;
    let end = blankCount;
    for (let k = j + 1; k < headings.length; k++) {
      if (LEVEL[headings[k].kind] <= LEVEL[h.kind]) { end = headings[k].blank; break; }
    }
    return [h.blank, end];
  }), [headings, blankCount]);

  // 열면 지금 읽는 제목에 초점(목록이 길면 그 자리까지 내려 보임). 닫으면 '목차' 단추로 초점을 돌려준다
  useEffect(() => {
    if (!open) return undefined;
    const list = listRef.current;
    const el = list?.querySelector("[aria-current]") || list?.querySelector("button");
    if (el) {
      el.focus({ preventScroll: true });
      // 창 안 목록만 내린다(scrollIntoView 는 뒤의 페이지까지 움직일 수 있어 쓰지 않음)
      const off = el.getBoundingClientRect().top - list.getBoundingClientRect().top;
      if (off > list.clientHeight - 40) list.scrollTop += off - list.clientHeight / 3;
    }
    const btn = btnRef.current;
    return () => btn?.focus({ preventScroll: true });
  }, [open]);

  function openToc() {
    setCurrent(getCurrent ? getCurrent() : null);
    setOpen(true);
  }

  function jump(hid) {
    onJump(hid);
    setOpen(false);
  }

  function onKeyDown(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const items = [...(listRef.current?.querySelectorAll("button") || [])];
    const at = items.indexOf(document.activeElement);
    const next = items[Math.min(items.length - 1, Math.max(0, at + (e.key === "ArrowDown" ? 1 : -1)))];
    if (next) {
      e.preventDefault();
      next.focus();
    }
  }

  return (
    <>
      <button
        ref={btnRef}
        style={S.btn}
        onClick={openToc}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="절 제목 목록 — 누르면 그 절로 갑니다"
        onPointerEnter={(e) => { if (e.pointerType === "mouse") e.currentTarget.style.opacity = "0.7"; }}
        onPointerLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
      >
        목차
      </button>
      {open && createPortal(
        <div style={S.overlay} onClick={() => setOpen(false)} data-ink-palm-safe="">
          <div
            style={S.sheet}
            role="dialog"
            aria-modal="true"
            aria-label="목차"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={onKeyDown}
          >
            <div style={S.head}>
              <div style={S.title}>목차</div>
              <button style={S.close} onClick={() => setOpen(false)} aria-label="목차 닫기">✕</button>
            </div>
            <div style={S.list} ref={listRef}>
              {headings.map((h, j) => {
                const range = ranges[j];
                const total = range ? range[1] - range[0] : 0;
                let opened = 0;
                if (total > 0 && blankState) for (let i = range[0]; i < range[1]; i++) if (blankState[i]) opened += 1;
                const isCur = current === h.hid;
                return (
                  <button
                    key={h.hid}
                    style={S.item(h.kind, isCur)}
                    onClick={() => jump(h.hid)}
                    aria-current={isCur ? "location" : undefined}
                    aria-label={total > 0 ? `${h.label} (연 빈칸 ${opened}개 / ${total}개)` : h.label}
                  >
                    <span style={S.label}>{h.label}</span>
                    {total > 0 && <span style={S.count(opened === total)}>{opened}/{total}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
