import { useState, useSyncExternalStore } from "react";
import { hasOld, heightDrift, isStale, oldNoticeDue, oldStrokes, otherWidths } from "./inkStore";

// 필기 안내(본문 바뀜·다른 폭의 필기·높이 차이·불러오기/저장 실패). 화면의 위쪽 묶음(머리 줄·도구 막대, sticky)
// 바로 아래에 겹쳐 띄운다(position: absolute) — 글 흐름 안에 두면 안내가 생기거나 사라질 때(첫 선을 그으면 대개 사라짐)
// 문항 글이 펜 아래에서 위아래로 튀므로. 글을 가리면 '닫기'로 닫는다(불러오기·저장 실패는 이 화면에서 다시 안 뜸).
// 본문 바뀜·다른 폭·높이 차이는 이 문항에 저장된 필기가 있을 때만(필기 모드를 꺼도 — 필기가 말없이 사라져 보이지 않게).
// 본문이 바뀐 뒤 새로 쓰면 예전 필기는 지우지 않고 따로 보관하고(inkDb — "<열쇠>#old:…"), 보관했다는 안내를 한 번 띄운다.
// 예전 필기는 '흐리게 보기'로 글자 아래에 흐리게 겹쳐 볼 수 있다(읽기만 — 다시 누르면 끔. 안내를 닫아도 끔).
// 보관한 예전 필기 안내는 보관한 그 화면, 그리고 필기 모드에서 보관한 뒤 OLD_NOTICE_MS(30일) 동안만 저절로 뜬다.
// 불러오기·저장 실패는 필기 모드에서만(쓰는 중일 때)

const S = {
  band: {
    position: "absolute", top: "100%", left: 0, right: 0,
    display: "flex", justifyContent: "center", padding: "6px 12px 0", pointerEvents: "none",
  },
  panel: {
    pointerEvents: "auto", width: "100%", maxWidth: 680, boxSizing: "border-box",
    display: "flex", alignItems: "flex-start", gap: 6, padding: "6px 6px 6px 12px", borderRadius: 8,
    background: "#211c12", border: "1px solid rgba(245,158,11,0.45)", boxShadow: "0 6px 18px rgba(0,0,0,0.5)",
    fontSize: 12.5, lineHeight: 1.45,
  },
  list: { flex: "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column", gap: 4 },
  row: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, minHeight: 32 },
  text: (warn) => ({ flex: "1 1 200px", minWidth: 0, color: warn ? "#f0cf8f" : "#c4c4c4" }),
  btn: {
    height: 32, padding: "0 12px", borderRadius: 6, whiteSpace: "nowrap",
    background: "#2a2a2a", border: "1px solid #3a3a3a", color: "#d8d8d8", fontSize: 12.5, fontWeight: 600, cursor: "pointer",
  },
  // 흐리게 보기 켬: 강조 테두리
  btnOn: { background: "rgba(245,158,11,0.16)", border: "1px solid #f59e0b", color: "#f8c46b" },
  close: {
    flexShrink: 0, height: 32, padding: "0 10px", borderRadius: 6, whiteSpace: "nowrap",
    background: "transparent", border: "1px solid #3a3a3a", color: "#a8a8a8", fontSize: 12.5, fontWeight: 600, cursor: "pointer",
  },
};

// 지금 보여 줄 안내들 { id, warn, text, actions? }. id 는 닫을 때 기억하는 이름 —
// 불러오기·저장 실패는 화면 전체에 하나(문항마다 다시 뜨지 않게), 나머지는 문항마다
function noticesOf(snap, enabled) {
  const out = [];
  // 흐리게 보는 중인데 다른 화면 폭에서 쓴 필기면 자리가 어긋난다고 덧붙인다
  const approx = snap.oldOn && oldStrokes(snap).approx ? " 다른 화면 폭에서 쓴 것이라 자리가 어긋납니다." : "";
  if (snap.loaded && isStale(snap)) {
    out.push({ id: `stale@${snap.key}`, kind: "stale", warn: true, text: `문항 내용이 바뀌어 예전 필기를 숨겼습니다. 새로 쓰면 예전 필기는 이 기기에 따로 보관됩니다.${approx}` });
  } else if (snap.archivedKey && snap.archivedKey === snap.key) {
    out.push({ id: `archived@${snap.key}`, kind: "old", text: `바뀌기 전 문항의 예전 필기는 이 기기에 따로 보관했습니다(필기 백업에 함께 들어갑니다).${approx}` });
  } else if (snap.loaded && hasOld(snap) && (snap.oldOn || (enabled && oldNoticeDue(snap)))) {
    out.push({ id: `old@${snap.key}`, kind: "old", text: `본문이 바뀌기 전에 쓴 예전 필기가 보관되어 있습니다.${approx}` });
  }
  const others = otherWidths(snap);
  if (others.length) {
    const list = others.slice(0, 3).map((w) => `${w}px`).join("·");
    out.push({ id: `width@${snap.key}`, text: `이 화면 폭(본문 ${snap.width}px)에는 필기가 없습니다. 본문 ${list} 폭에서 쓴 필기가 있습니다 — 화면을 돌리거나 그 폭에서 보면 보입니다.` });
  }
  if (heightDrift(snap)) {
    out.push({ id: `drift@${snap.key}`, text: "글자 크기나 글꼴이 필기할 때와 달라 필기 위치가 조금 어긋날 수 있습니다." });
  }
  if (enabled && snap.saveError) {
    out.push({ id: "save", warn: true, alert: true, text: "필기를 이 기기에 저장하지 못했습니다(사생활 보호 창·저장 공간 부족 등). 화면의 필기는 계속 쓸 수 있습니다." });
  } else if (enabled && snap.unsure) {
    out.push({ id: "load", text: "이 문항에 저장된 필기를 불러오지 못했습니다. 새로 쓰는 필기는 저장할 때 예전 필기와 합칩니다." });
  }
  return out;
}

export default function InkNotices({ store, enabled }) {
  const snap = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [closed, setClosed] = useState(() => new Set());
  const list = noticesOf(snap, enabled).filter((n) => !closed.has(n.id));
  if (!list.length) return null;
  // 흐리게 보기 켬/끔(읽기만 — 지금 필기는 그대로). 켠 동안은 강조
  const oldBtn = hasOld(snap) && (
    <button
      type="button"
      style={snap.oldOn ? { ...S.btn, ...S.btnOn } : S.btn}
      aria-pressed={snap.oldOn}
      title="본문이 바뀌기 전에 쓴 필기를 글자 아래에 흐리게 겹쳐 봅니다(읽기만)"
      onClick={() => store.toggleOld()}
    >{snap.oldOn ? "흐리게 끄기" : "흐리게 보기"}</button>
  );
  return (
    <div style={S.band} data-ink-notices="">
      <div style={S.panel}>
        <div style={S.list}>
          {list.map((n) => (
            <div key={n.id} style={S.row} role={n.alert ? "alert" : "status"}>
              <span style={S.text(n.warn)}>{n.text}</span>
              {n.kind === "old" && oldBtn}
              {n.kind === "stale" && (
                <>
                  {oldBtn}
                  <button type="button" style={S.btn} onClick={() => store.acceptStale()}>그래도 보기</button>
                  <button
                    type="button"
                    style={S.btn}
                    onClick={() => { if (window.confirm("이 문항의 예전 필기를 모두 지울까요?")) store.dropRecord(); }}
                  >지우기</button>
                </>
              )}
            </div>
          ))}
        </div>
        <button
          type="button"
          style={S.close}
          aria-label="필기 안내 닫기"
          onClick={() => {
            // 닫으면 '흐리게 끄기' 단추도 사라지므로 흐리게 보던 것도 끈다
            if (snap.oldOn) store.toggleOld();
            setClosed((c) => new Set([...c, ...list.map((n) => n.id)]));
          }}
        >닫기</button>
      </div>
    </div>
  );
}
