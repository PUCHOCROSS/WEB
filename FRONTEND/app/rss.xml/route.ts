// app/rss.xml/route.ts → /rss.xml
// 네이버 서치어드바이저는 RSS 제출을 권장합니다 (새 글 수집이 빨라짐).
import { getAllDeals } from "@/lib/data";

const SITE_URL = "https://www.dolmeori.com";
export const revalidate = 3600;

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export async function GET() {
  const deals = (await getAllDeals()).slice(0, 50);
  const items = deals
    .map(
      (d: any) => `
    <item>
      <title>${esc(d.title)}</title>
      <link>${SITE_URL}/deal/${d.id}</link>
      <guid isPermaLink="true">${SITE_URL}/deal/${d.id}</guid>
      <description>${esc((d.summary ?? "").slice(0, 300))}</description>
      <pubDate>${new Date(d.createdAt).toUTCString()}</pubDate>
    </item>`
    )
    .join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>오늘의 쿠폰·행사</title>
    <link>${SITE_URL}</link>
    <description>통신사·카드 멤버십 쿠폰과 할인 행사 소식</description>
    <language>ko</language>${items}
  </channel>
</rss>`;

  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
}
