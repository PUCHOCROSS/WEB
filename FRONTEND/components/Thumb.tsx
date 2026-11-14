"use client";

import { useState } from "react";
import CategoryIcon from "./CategoryIcon";

/** 대표 이미지
 *  - fit="fill"(기본): 이미지 전체가 보이게 넣고, 남는 여백은 같은 이미지를 흐리게 깔아 채운다.
 *    직접 만든 포스터처럼 글씨가 있는 이미지도 잘리지 않는다.
 *  - fit="cover": 칸을 꽉 채우도록 잘라서 보여준다 (작은 썸네일용).
 *  - 이미지가 없거나 깨지면 카테고리 색 바탕에 카테고리 아이콘. */
export default function Thumb({
  src,
  alt,
  accentColor,
  slug = "etc",
  iconClass = "h-10 w-10",
  fit = "fill",
}: {
  src?: string | null;
  alt: string;
  accentColor: string;
  slug?: string; // 아이콘 이름
  label?: string; // (예전 호환용, 쓰지 않음)
  iconClass?: string;
  fit?: "fill" | "cover" | "contain";
}) {
  const [broken, setBroken] = useState(false);

  if (!src || broken) {
    return (
      <div className="flex h-full w-full items-center justify-center" style={{ background: `${accentColor}14`, color: accentColor }}>
        <CategoryIcon slug={slug} className={iconClass} />
      </div>
    );
  }

  const img = (cls: string, hidden = false) => (
    // 외부 도메인 이미지가 다양해 next/image remotePatterns 설정 없이도 항상 표시되도록 <img> 사용
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={hidden ? "" : alt}
      aria-hidden={hidden || undefined}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
      className={cls}
    />
  );

  if (fit === "cover") return img("h-full w-full object-cover");

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#F3F5F4]">
      {fit === "fill" && img("absolute inset-0 h-full w-full scale-110 object-cover opacity-50 blur-xl", true)}
      {img("relative h-full w-full object-contain")}
    </div>
  );
}
