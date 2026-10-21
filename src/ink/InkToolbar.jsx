import { useSyncExternalStore } from "react";
import { PEN_COLORS, HL_COLOR } from "./geometry";
import { visibleStrokes } from "./inkStore";
import { EraserIcon, EyeIcon, HighlighterIcon, PenIcon, UndoIcon } from "./InkIcons";
import { TrashIcon } from "../components/NoteIcons";

// 필기 모드 단추(풀기 화면 머리 줄)와 필기 도구 막대(필기 모드 켬일 때 머리 줄 바로 아래, 함께 떠 있음).
// 크기·간격은 index.css 의 .qm-ink-*(화면 폭마다 다름), 색은 여기.

const S = {
  toggle: (on) => ({
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
    height: 36, borderRadius: 8, flexShrink: 0, whiteSpace: "nowrap",
    fontSize: 13, fontWeight: 700, cursor: "pointer",
    background: on ? "rgba(255,77,79,0.16)" : "transparent",
    border: `1px solid ${on ? "#ff4d4f" : "#3a3a3a"}`,
    color: on ? "#ff7a7c" : "#a0a0a0",
  }),
  tool: (active) => ({
    display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
    borderRadius: 9, cursor: "pointer", padding: 0,
    background: active ? "#2c2c2c" : "transparent",
    border: `2px solid ${active ? "#f1f1f1" : "transparent"}`,
    color: "#d0d0d0",
  }),
  dot: (color) => ({ width: 18, height: 18, borderRadius: "50%", background: color, boxShadow: "0 0 0 1px rgba(0,0,0,0.4)" }),
};

export function InkModeButton({ on, onToggle }) {
  return (
    <button
      type="button"
      className="qm-ink-toggle"
      style={S.toggle(on)}
      onClick={onToggle}
      aria-pressed={on}
      aria-label="필기 모드"
      title={on ? "필기 모드 끄기" : "필기 모드 켜기 — S펜으로 쓰기, 빈칸은 두 번 콕, 스크롤은 두 손가락"}
    >
      <PenIcon size={17} />
      <span className="qm-ink-toggle-label">필기 모드</span>
    </button>
  );
}

// toggle: 고르는 단추(펜 색·형광펜·지우개·숨기기)는 고르지 않은 때도 aria-pressed="false" —
// 화면 읽기 프로그램이 켜고 끄는 단추로 읽어 지금 어느 도구인지 견줄 수 있게. 되돌리기·전체 지우기는 토글이 아님
function ToolButton({ active = false, toggle = false, disabled = false, label, onClick, children }) {
  return (
    <button
      type="button"
      className="qm-ink-btn"
      style={{ ...S.tool(active), opacity: disabled ? 0.35 : 1, cursor: disabled ? "default" : "pointer" }}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={toggle ? active : undefined}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}

export function InkToolbar({ store }) {
  const s = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const count = visibleStrokes(s).length;
  return (
    <div className="qm-ink-bar" role="toolbar" aria-label="필기 도구">
      {PEN_COLORS.map((c) => (
        <ToolButton
          key={c.value}
          toggle
          active={s.tool === "pen" && s.color === c.value}
          label={`펜 ${c.name}`}
          onClick={() => store.setPen(c.value)}
        >
          <span style={S.dot(c.value)} />
        </ToolButton>
      ))}
      <ToolButton toggle active={s.tool === "hl"} label="형광펜" onClick={() => store.setTool("hl")}>
        <span style={{ color: HL_COLOR, display: "inline-flex" }}><HighlighterIcon /></span>
      </ToolButton>
      <ToolButton toggle active={s.tool === "eraser"} label="지우개 (닿은 선을 통째로)" onClick={() => store.setTool("eraser")}>
        <EraserIcon />
      </ToolButton>
      <span className="qm-ink-sep" aria-hidden="true" />
      <ToolButton disabled={!s.history.length} label="되돌리기" onClick={() => store.undo()}>
        <UndoIcon />
      </ToolButton>
      <ToolButton
        disabled={!count}
        label="이 문항 필기 모두 지우기"
        onClick={() => {
          if (window.confirm(`이 문항에 쓴 필기 ${count}개를 모두 지울까요?\n(되돌리기로 다시 살릴 수 있습니다)`)) store.clear();
        }}
      >
        <TrashIcon size={19} />
      </ToolButton>
      <ToolButton
        toggle
        active={s.hidden}
        label={s.hidden ? "필기 다시 보이기" : "필기 잠깐 숨기기"}
        onClick={() => store.toggleHidden()}
      >
        <EyeIcon off={s.hidden} />
      </ToolButton>
      <span className="qm-ink-hint">S펜: 쓰기 · 빈칸 두 번 콕 &nbsp;|&nbsp; 손: 빈칸 한 번 · 두 손가락 스크롤</span>
    </div>
  );
}
