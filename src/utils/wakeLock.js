// 화면 켜 두기(Screen Wake Lock): 긴 페이지를 읽는 동안 태블릿·휴대폰 화면이 꺼지지 않게.
// active 인 동안 잡고, 앱이 가려지면 브라우저가 스스로 풀므로 다시 보일 때(visibilitychange) 다시 잡는다.
// 지원하지 않거나 거절되면(배터리 절약·옛 브라우저·보안 연결 아님) 조용히 넘어간다 — 화면이 꺼지는 것 말고는 그대로
import { useEffect } from "react";

export function useWakeLock(active) {
  useEffect(() => {
    if (!active || typeof navigator === "undefined" || !navigator.wakeLock?.request) return undefined;
    let lock = null;
    let pending = false;
    let stopped = false;
    const acquire = async () => {
      // 앱이 가려지면 브라우저가 풀어 버린다(release 이벤트가 없어도 released 로 안다)
      if (lock && lock.released) lock = null;
      if (stopped || lock || pending || document.visibilityState !== "visible") return;
      pending = true;
      try {
        const l = await navigator.wakeLock.request("screen");
        if (stopped) {
          l.release().catch(() => {});
          return;
        }
        lock = l;
        l.addEventListener?.("release", () => { if (lock === l) lock = null; });
      } catch {
        // 거절됨 — 그냥 둠
      } finally {
        pending = false;
      }
    };
    const onVisible = () => { if (document.visibilityState === "visible") acquire(); };
    acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisible);
      if (lock) lock.release().catch(() => {});
      lock = null;
    };
  }, [active]);
}
