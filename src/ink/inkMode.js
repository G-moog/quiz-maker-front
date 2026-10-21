// 필기 모드 켬/끔은 이 기기에 기억한다(localStorage). 막힌 브라우저에서도 화면은 동작하게 실패는 무시
const KEY = "qm:ink-mode:v1";

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
