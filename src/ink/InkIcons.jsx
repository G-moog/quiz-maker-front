// 필기 도구 아이콘(SVG). 색은 글자색(currentColor)을 따른다 — NoteIcons.jsx 와 같은 방식
const base = {
  viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2,
  strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, focusable: "false",
};

// 필기 모드 단추: 펜촉
export function PenIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="M12 19l7-7 3 3-7 7-3-3Z" />
      <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5Z" />
      <path d="M2 2l7.6 7.6" />
      <circle cx="11" cy="11" r="2" />
    </svg>
  );
}

export function HighlighterIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="M9 11l-6 6v3h9l3-3" />
      <path d="M22 12l-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4" />
    </svg>
  );
}

export function EraserIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="M7 21l-4.3-4.3a1 1 0 0 1 0-1.4l10-10a1 1 0 0 1 1.4 0l5.6 5.6a1 1 0 0 1 0 1.4L13 21" />
      <path d="M22 21H7" />
      <path d="M5 11l9 9" />
    </svg>
  );
}

export function UndoIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="M9 14L4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </svg>
  );
}

// 다시 하기: 되돌리기를 좌우로 뒤집은 모양
export function RedoIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="M15 14l5-5-5-5" />
      <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
    </svg>
  );
}

export function EyeIcon({ size = 20, off = false }) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
      {off && <path d="M3 3l18 18" />}
    </svg>
  );
}
