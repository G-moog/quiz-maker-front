import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { HL_OPACITY, centerlinePath, outlinePath } from "./geometry";
import { visibleStrokes } from "./inkStore";
import { InkInput } from "./InkInput";

// 필기 영역: 문항 본문을 감싸는 div. 필기 층이 켜지면(layerOn: 필기 모드 켬, 또는 이 문항에 보여 줄 필기가 있음)
// 본문 위아래에 SVG 층을 겹친다 — 형광펜은 글자 아래(z-index -1, 글자를 덮지 않아 그대로 읽힘), 펜은 글자 위.
// 층은 pointer-events: none 이고 입력은 이 div 가 받는다(enabled 일 때만, InkInput). 좌표는 이 div 왼쪽 위 기준 px.
// 입력은 글 상자 바깥 카드 여백까지 받는다(.qm-ink-bleed — 줄 맨 앞 글자 왼쪽이나 마지막 줄 아래에서 시작한 선도 그어지게).
// 필기 층이 꺼져 있으면 div 는 넘겨받은 style 그대로 — 지금 화면과 똑같다.
// 안내(본문 바뀜·다른 폭의 필기·저장 실패 등)는 여기가 아니라 화면 위쪽 묶음에 띄운다(InkNotices — 글 위치가 바뀌지 않게).

const LAYER_STYLE = { position: "relative", isolation: "isolate" };
// 필기 모드: 브라우저 스스로의 스크롤·확대를 막고(두 손가락 스크롤은 InkInput 이 직접), 글 고르기·길게 누르기 메뉴 막기
const INPUT_STYLE = {
  touchAction: "none", userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none", cursor: "crosshair",
};

const svgStyle = (kind, hidden) => ({
  position: "absolute", left: 0, top: 0, width: "100%", height: "100%",
  overflow: "visible", pointerEvents: "none",
  zIndex: kind === "hl" ? -1 : 1,
  visibility: hidden ? "hidden" : "visible",
});

// 저장된 선 하나 — 선은 한 번 그은 뒤 바뀌지 않으므로 memo 로 다시 계산하지 않는다
const StrokePath = memo(function StrokePath({ s }) {
  if (s.tool === "hl") {
    return (
      <path
        d={centerlinePath(s.pts)} fill="none" stroke={s.color} strokeWidth={s.w}
        strokeLinecap="round" strokeLinejoin="round" strokeOpacity={HL_OPACITY}
      />
    );
  }
  return <path d={outlinePath(s.pts, s.w)} fill={s.color} />;
});

// 층 하나(형광펜 또는 펜). 마지막 <path> 는 그리는 중인 선(InkInput 이 직접 d 를 바꾼다 — React 를 거치지 않게)
const InkLayer = memo(function InkLayer({ kind, strokes, hidden, liveRef }) {
  const mine = strokes.filter((s) => (s.tool === "hl") === (kind === "hl"));
  return (
    <svg aria-hidden="true" focusable="false" data-ink-layer={kind} style={svgStyle(kind, hidden)}>
      {mine.map((s) => <StrokePath key={s.id} s={s} />)}
      <path ref={liveRef} data-ink-live="" />
    </svg>
  );
});

export default function InkSurface({ store, enabled, layerOn, onBlankTap, onEvent, style, className, children }) {
  const snap = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [el, setEl] = useState(null);
  const live = useRef({ pen: null, hl: null });
  const hooks = useRef({});
  useLayoutEffect(() => {
    hooks.current = { onBlankTap, onEvent };
  });
  const setPenLive = useCallback((node) => { live.current.pen = node; }, []);
  const setHlLive = useCallback((node) => { live.current.hl = node; }, []);

  // 영역 폭·높이: 필기 층을 쓰거나 저장된 필기를 찾아볼 때만 잰다(필기가 없고 모드가 꺼져 있으면 아무것도 하지 않음)
  const watch = enabled || layerOn || !!snap.record;
  useEffect(() => {
    if (!el || !watch) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      store.setSize(Math.round(r.width), Math.round(r.height));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el, watch, store]);

  useEffect(() => {
    if (!el || !enabled) return;
    const input = new InkInput(el, store, {
      onBlankTap: (i) => hooks.current.onBlankTap?.(i),
      onEvent: (type, detail) => hooks.current.onEvent?.(type, detail),
      livePath: (kind) => live.current[kind],
    });
    input.attach();
    return () => input.detach();
  }, [el, enabled, store]);

  const strokes = visibleStrokes(snap);
  const areaStyle = layerOn ? { ...style, ...LAYER_STYLE, ...(enabled ? INPUT_STYLE : null) } : style;
  return (
    <div ref={setEl} className={className} style={areaStyle} data-ink-area={layerOn ? (enabled ? "on" : "view") : undefined}>
      {enabled && <div className="qm-ink-bleed" aria-hidden="true" />}
      {layerOn && <InkLayer kind="hl" strokes={strokes} hidden={snap.hidden} liveRef={setHlLive} />}
      {children}
      {layerOn && <InkLayer kind="pen" strokes={strokes} hidden={snap.hidden} liveRef={setPenLive} />}
    </div>
  );
}
