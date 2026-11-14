"use client";

import { useState } from "react";
import CategoryIcon from "./CategoryIcon";

/** 대표 이미지. 없거나 깨지면 카테고리 색 바탕에 카테고리 아이콘을 보여준다. */
export default function Thumb({
  src,
  alt,
  accentColor,
  slug = "etc",
  iconClass = "h-10 w-10",
  fit = "cover",
}: {
  src?: string | null;
  alt: string;
  accentColor: string;
  slug?: string;
  label?: string; // (예전 호환용, 쓰지 않음)
  iconClass?: string;
  fit?: "cover" | "contain";
}) {
  const [broken, setBroken] = useState(false);

  if (!src || broken) {
    return (
      <div className="flex h-full w-full items-center justify-center" style={{ background: `${accentColor}14`, color: accentColor }}>
        <CategoryIcon slug={slug} className={iconClass} />
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
      className={`h-full w-full ${fit === "contain" ? "object-contain p-2" : "object-cover"}`}
    />
  );
}
