// 안드로이드 뒤로 가기(와 브라우저 뒤로 단추)를 앱 안에서 처리한다.
// 화면·창을 열 때 pushBack(닫는 함수)로 history 에 한 칸을 쌓고, 뒤로 가기가 오면 가장 위의 닫는 함수를 부른다.
// 앱 안 단추로 닫을 때는 release() 가 쌓아 둔 칸을 history.go(-n) 으로 걷어 낸다 — 그때 오는 popstate 는 무시한다.
// 걷어 내는 중(popstate 가 아직 안 옴)에 새 칸을 쌓으면 순서가 꼬이므로, 그동안의 pushState 는 popstate 뒤로 미룬다.
// React 에서는 useBack(열림, 닫는 함수) 으로 쓴다(아래).
import { useEffect, useRef } from "react";

// 닫는 함수가 이 값을 돌려주면 '닫지 않음'(예: '저장하지 않은 내용이 있습니다. 나갈까요?' 에서 취소) —
// 뒤로 가기로 빠진 칸을 같은 자리에 다시 쌓는다. 그 칸의 release() 도 그대로 쓸 수 있다
export const STAY = Symbol("qm-back-stay");

const stack = []; // { id, onBack, pushed }
let seq = 0;
let ignorePops = 0; // 우리가 부른 history.go 로 올 popstate 수
let pendingGo = 0; // 이번 차례(마이크로태스크)에 걷어 낼 칸 수 — release 여러 번을 history.go 한 번으로 모은다
let listening = false;

function flushPending() {
  if (ignorePops > 0 || pendingGo > 0) return;
  for (const e of stack) {
    if (!e.pushed) {
      e.pushed = true;
      try { window.history.pushState({ qmBack: e.id }, ""); } catch { /* history 를 못 쓰면 뒤로 가기만 안 됨 */ }
    }
  }
}

// 한 렌더에서 부모·자식 화면이 함께 닫히면(예: 메모 고치기 칸이 열린 채 목록으로) release 가 여러 번 불린다.
// 같은 차례에 history.go 를 여러 번 부르면 브라우저가 한 번만 움직이기도 해서(남은 칸·무시할 popstate 수가 어긋남)
// 모아서 한 번에 부른다
function scheduleGo(n) {
  if (pendingGo === 0) queueMicrotask(runGo);
  pendingGo += n;
}

function runGo() {
  const n = pendingGo;
  pendingGo = 0;
  if (n > 0) {
    ignorePops++;
    try { window.history.go(-n); } catch { ignorePops--; }
  }
  flushPending();
}

function onPop() {
  if (ignorePops > 0) {
    ignorePops--;
    flushPending();
    return;
  }
  // 사용자가 뒤로 감: 쌓인 칸 중 history 에 실제로 올라간 가장 위의 것을 닫는다
  for (let i = stack.length - 1; i >= 0; i--) {
    if (stack[i].pushed) {
      const [top] = stack.splice(i, 1);
      if (top.onBack() === STAY) {
        // 닫지 않음: 같은 칸(같은 release)을 같은 자리에 다시 올린다
        top.pushed = false;
        stack.splice(Math.min(i, stack.length), 0, top);
        flushPending();
      }
      return;
    }
  }
}

// 닫는 함수를 쌓는다. 돌려받은 release() 는 앱 안 단추로 닫을 때 부른다(뒤로 가기로 이미 닫혔으면 아무 일도 안 함)
export function pushBack(onBack) {
  if (typeof window === "undefined") return () => {};
  if (!listening) {
    window.addEventListener("popstate", onPop);
    listening = true;
    // 스크롤 자리는 앱이 화면마다 스스로 되살린다(대시보드 목록 기억·풀기 이어 보기·편집기 목록 자리).
    // 브라우저 자동 복원(auto)을 두면 release() 의 history.go(-n) 때 크롬이 그 칸을 쌓을 때의 스크롤로 되돌려
    // 창을 연 채 움직인 자리(메뉴를 열고 내린 목록·목차로 간 자리 등)를 덮는다.
    // 이 값은 history 칸마다 붙고 새 칸은 지금 칸의 값을 이어받으므로, 첫 칸을 쌓기 전에 한 번 바꾸면 앱의 칸이 모두 manual
    try {
      if ("scrollRestoration" in window.history) window.history.scrollRestoration = "manual";
    } catch { /* 못 바꾸면 그대로 */ }
  }
  const entry = { id: ++seq, onBack, pushed: false };
  stack.push(entry);
  flushPending();
  let released = false;
  return function release() {
    if (released) return;
    released = true;
    const i = stack.indexOf(entry);
    if (i === -1) return; // 뒤로 가기로 이미 빠짐
    // 이 칸과 그 위에 쌓인 칸을 함께 걷어 낸다(위의 것은 닫는 함수를 부르지 않음 — 부모가 닫히면 같이 사라지는 화면)
    const removed = stack.splice(i);
    const n = removed.filter((e) => e.pushed).length;
    if (n > 0) scheduleGo(n);
  };
}

// open 이 true 인 동안 history 에 한 칸을 둔다. 뒤로 가기가 오면 onBack() — 보통 open 을 false 로 바꾸는 함수.
// onBack 이 STAY 를 돌려주면 닫지 않고 칸을 다시 쌓는다.
// 앱 단추로 open 이 false 가 되면 칸을 걷어 낸다. onBack 은 늘 최신 것을 부른다
export function useBack(open, onBack) {
  const ref = useRef(onBack);
  useEffect(() => { ref.current = onBack; });
  useEffect(() => {
    if (!open) return undefined;
    return pushBack(() => ref.current?.());
  }, [open]);
}
