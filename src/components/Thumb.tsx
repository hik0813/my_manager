"use client";

import { useState } from "react";

/**
 * 항목 썸네일.
 * 이미지가 없거나 404여도 같은 크기의 자리를 지켜서 목록 줄이 흐트러지지 않게 한다.
 * RSS 썸네일은 자주 죽으므로 onError 폴백이 반드시 필요하다.
 */
export default function Thumb({
  src,
  fallback,
}: {
  src: string | null;
  /** 이미지가 없을 때 자리에 넣을 것 — 소스 이름이나 점수 */
  fallback: React.ReactNode;
}) {
  const [broken, setBroken] = useState(false);
  const show = src && !broken;

  return (
    <div className="shrink-0 w-[76px] h-[52px] rounded-[6px] overflow-hidden bg-surface2 border border-line grid place-items-center">
      {show ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setBroken(true)}
          className="w-full h-full object-cover"
        />
      ) : (
        <span className="text-[11px] text-dim px-1 text-center leading-tight line-clamp-2">{fallback}</span>
      )}
    </div>
  );
}
