"use client";

import { useEffect } from "react";

export default function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* 등록 실패해도 앱은 온라인에서 정상 동작한다 */
    });
  }, []);
  return null;
}
