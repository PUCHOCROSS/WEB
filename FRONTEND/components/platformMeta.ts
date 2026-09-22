export type PlatformMeta = { label: string; color: string; bg: string };

// Work Hub(파이썬 앱)의 PLATFORMS 키와 맞춰 주세요 (engine.py 참고).
// 새 플랫폼을 발행 대상에 추가하면 여기에도 한 줄 추가하면 됩니다.
const PLATFORM_META: Record<string, PlatformMeta> = {
  naver_news: { label: "네이버 뉴스", color: "#03C75A", bg: "#E9FBF1" },
  naver_blog: { label: "네이버 블로그", color: "#2DB400", bg: "#EAFBE6" },
  google: { label: "구글 검색", color: "#4285F4", bg: "#EAF1FE" },
};

const DEFAULT_META: PlatformMeta = { label: "기타", color: "#64748B", bg: "#F1F5F9" };

export function getPlatformMeta(key: string): PlatformMeta {
  return PLATFORM_META[key] ?? DEFAULT_META;
}

export function allPlatformKeys(): string[] {
  return Object.keys(PLATFORM_META);
}
