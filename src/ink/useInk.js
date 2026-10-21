import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from "react";
import { createInkStore } from "./inkStore";

// 필기 보관소 하나를 만들고 지금 문항(storeKey, 본문 지문 textHash)에 맞춘다.
// 돌려주는 값: [보관소, 지금 문항·폭에 보여 줄 필기가 있는가]
// 문항을 옮기면 앞 문항 저장을 마저 하고, 화면을 떠나거나(목록으로) 앱이 가려질 때도 바로 저장한다.
export function useInk(storeKey, textHash) {
  const [store] = useState(createInkStore);
  // 그리기 전에 맞춰야 앞 문항의 필기가 새 문항 위에 한순간 보이지 않는다
  useLayoutEffect(() => {
    store.setKey(storeKey, textHash);
  }, [store, storeKey, textHash]);
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") store.flush();
    };
    window.addEventListener("pagehide", store.flush);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", store.flush);
      document.removeEventListener("visibilitychange", onHide);
      store.flush();
    };
  }, [store]);
  const hasInk = useSyncExternalStore(store.subscribe, store.hasVisibleInk);
  return [store, hasInk];
}
