// 관리자 '도구' 목록 (/admin/util)
//
// 새 도구를 추가하는 법:
//   1) app/admin/util/<이름>/page.tsx 로 화면을 만든다 (ocr 폴더를 복사해서 고치면 쉬움)
//   2) 아래 TOOLS 에 한 줄 추가한다 → 도구 화면에 아이콘이 생긴다
export type Tool = {
  slug: string; // 주소: /admin/util/<slug>
  name: string;
  desc: string;
  emoji: string;
  color: string; // 아이콘 바탕색
  ready?: boolean; // false 면 '준비 중'으로 흐리게
};

export const TOOLS: Tool[] = [
  {
    slug: "ocr",
    name: "이미지 → 텍스트",
    desc: "캡처나 사진 속 글자를 뽑아 복사",
    emoji: "🔠",
    color: "#7C3AED",
    ready: true,
  },
];

export const toolOf = (slug: string) => TOOLS.find((t) => t.slug === slug);
