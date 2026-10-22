import { PEN_COLORS } from "./geometry.js";

// 필기 모드 켬/끔과 마지막으로 고른 도구(펜 색·형광펜·지우개)는 이 기기에 기억한다(localStorage).
// 막힌 브라우저에서도 화면은 동작하게 실패는 무시
const KEY = "qm:ink-mode:v1";
const TOOL_KEY = "qm:ink-tool:v1";

export function loadInkMode() {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function saveInkMode(on) {
  try {
    if (on) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
  } catch {
    // 저장 못 해도 이번 화면에서는 켜진 채로 쓴다
  }
}

const TOOLS = ["pen", "hl", "eraser"];
export const DEFAULT_TOOL = Object.freeze({ tool: "pen", color: PEN_COLORS[0].value });

// 저장된 글 → { tool, color }. 모르는 값은 기본(빨간 펜)으로. color 는 펜 색(형광펜·지우개를 골라도 마지막 펜 색을 기억)
export function parseInkTool(raw) {
  let v = null;
  try {
    v = typeof raw === "string" ? JSON.parse(raw) : null;
  } catch {
    v = null;
  }
  if (!v || typeof v !== "object") return { ...DEFAULT_TOOL };
  return {
    tool: TOOLS.includes(v.tool) ? v.tool : DEFAULT_TOOL.tool,
    color: PEN_COLORS.some((c) => c.value === v.color) ? v.color : DEFAULT_TOOL.color,
  };
}

export function loadInkTool() {
  try {
    return parseInkTool(localStorage.getItem(TOOL_KEY));
  } catch {
    return { ...DEFAULT_TOOL };
  }
}

export function saveInkTool({ tool, color }) {
  try {
    localStorage.setItem(TOOL_KEY, JSON.stringify({ tool, color }));
  } catch {
    // 기억하지 못해도 이번 화면에서는 고른 도구로 쓴다
  }
}

// 자판 단축키 → "undo" | "redo" | null. 한글 자판에서도 되게 e.code(KeyZ·KeyY)를 먼저 본다
export function shortcutOf(e) {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return null;
  const k = e.code === "KeyZ" ? "z" : e.code === "KeyY" ? "y" : String(e.key || "").toLowerCase();
  if (k === "z") return e.shiftKey ? "redo" : "undo";
  if (k === "y" && !e.shiftKey) return "redo";
  return null;
}
