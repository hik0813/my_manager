"use client";

import { useEffect } from "react";

export default function ServiceWorker() {
  useEffect(() => {
    // "serviceWorker" in navigator 만으로는 부족하다 — 속성은 있는데 값이 없는 환경이 있고,
    // 그때 .register 접근에서 페이지 전체가 터진다(실제로 겪었다).
    const sw = typeof navigator !== "undefined" ? navigator.serviceWorker : undefined;
    if (!sw || typeof sw.register !== "function") return;
    try {
      void sw.register("/sw.js").catch(() => undefined);
    } catch {
      /* 등록 실패해도 앱은 온라인에서 정상 동작한다 */
    }
  }, []);
  return null;
}
