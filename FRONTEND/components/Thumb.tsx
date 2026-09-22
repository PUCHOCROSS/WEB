"use client";

import { useState } from "react";

export default function Thumb({
  src,
  alt,
  accentColor,
}: {
  src?: string | null;
  alt: string;
  accentColor: string;
}) {
  const [broken, setBroken] = useState(false);

  if (!src || broken) {
    return (
      <div
        className="w-full h-full flex items-center justify-center"
        style={{
          background: `linear-gradient(135deg, ${accentColor}22, ${accentColor}05)`,
        }}
      >
        <span className="text-3xl" style={{ color: accentColor }} aria-hidden>
          🔖
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
      onError={() => setBroken(true)}
      className="w-full h-full object-cover"
    />
  );
}
