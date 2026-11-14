"use client";

import { useState } from "react";

/** 대표 이미지. 없거나 깨지면 카테고리 색 바탕에 카테고리 이름을 크게 쓴 대체 이미지를 보여준다. */
export default function Thumb({
  src,
  alt,
  accentColor,
  label,
}: {
  src?: string | null;
  alt: string;
  accentColor: string;
  label?: string;
}) {
  const [broken, setBroken] = useState(false);

  if (!src || broken) {
    return (
      <div
        className="flex h-full w-full items-center justify-center"
        style={{
          background: `${accentColor}14`,
          backgroundImage: `radial-gradient(${accentColor}26 1.2px, transparent 1.2px)`,
          backgroundSize: "14px 14px",
        }}
        aria-hidden={!alt}
      >
        <span className="font-display text-[clamp(20px,5vw,30px)] opacity-80" style={{ color: accentColor }}>
          {label ?? "할인 소식"}
        </span>
      </div>
    );
  }

  return (
    // 외부 도메인 이미지가 다양해 next/image remotePatterns 설정 없이도 항상 표시되도록 <img> 사용
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
      className="h-full w-full object-cover"
    />
  );
}
