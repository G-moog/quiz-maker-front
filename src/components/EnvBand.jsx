import { useLayoutEffect, useRef } from "react";

// 미리보기·로컬 주소에서 화면 맨 위에 보이는 띠(설계서 3.4절). 운영 주소에서는 보이지 않는다.
// 띠는 화면을 그만큼 아래로 밀므로, 높이를 CSS 변수 --qm-band-h 로 알린다 — 화면 높이에 맞춘 편집 화면(.qm-ed-layout)이
// 그만큼 빼서 맨 아래 저장·취소 줄이 화면 밖으로 잘리지 않게(태블릿 가로). 띠가 없으면 0
const BAND_VAR = "--qm-band-h";
const BANDS = {
  // 전환 전: 새 DB 는 리허설 사본이라 전환 날 비워진다
  rehearsal: {
    text: "리허설 사본 — 여기 쓴 것은 전환 때 지워집니다",
    background: "#facc15",
    color: "#1a1a1a",
  },
  // 전환 뒤: 미리보기 주소도 운영 DB 를 그대로 쓴다
  "live-preview": {
    text: "미리보기 주소: 운영 데이터를 바로 읽고 씁니다. 쓰기 시험은 [시험] 문제집에서만",
    background: "#b91c1c",
    color: "#ffffff",
  },
};

export default function EnvBand({ kind }) {
  const band = BANDS[kind];
  const ref = useRef(null);

  useLayoutEffect(() => {
    const el = ref.current;
    const root = document.documentElement;
    if (!el) return undefined;
    const update = () => root.style.setProperty(BAND_VAR, `${el.offsetHeight}px`);
    update();
    // 폭이 바뀌어 띠가 두 줄이 되는 등 높이가 바뀌면 다시 알린다
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(update) : null;
    if (ro) ro.observe(el);
    return () => {
      if (ro) ro.disconnect();
      root.style.removeProperty(BAND_VAR);
    };
  }, [kind]);

  if (!band) return null;
  return (
    <div
      ref={ref}
      role="note"
      className="no-print"
      data-env-band={kind}
      style={{
        background: band.background,
        color: band.color,
        fontFamily: "system-ui, sans-serif",
        fontSize: 12,
        fontWeight: 700,
        lineHeight: 1.4,
        textAlign: "center",
        padding: "6px 12px",
        overflowWrap: "anywhere",
      }}
    >
      {band.text}
    </div>
  );
}
