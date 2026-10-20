// 질문 메모 아이콘: 글꼴마다 모양이 다른 ✏·✎ 글자 대신 SVG(Windows Edge 에서 ✏ 가 가는 막대로 보였다).
// 색은 글자색(currentColor)을 따른다.
const base = {
  viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2,
  strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, focusable: "false",
};

export function PencilIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7.5 18.5 3 20l1.5-4.5Z" />
      <path d="M14 6l4 4" />
    </svg>
  );
}

export function TrashIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="M4 7h16" />
      <path d="M9 7V4.5h6V7" />
      <path d="M6 7l1 13h10l1-13" />
      <path d="M10 11v5.5M14 11v5.5" />
    </svg>
  );
}
