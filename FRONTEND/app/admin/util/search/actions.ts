"use server";
// 검색엔진에 알리기 (관리자 전용): 지금 보이는 글 전부 + 주요 페이지를 IndexNow 로 보낸다
import { isAdmin } from "../../../../lib/admin";
import { SITE, submitUrls, type SubmitResult } from "../../../../lib/indexnow";
import { getAllCategories, getAllDeals } from "../../../../lib/seo-data";

export type NotifyState = { count: number; results: SubmitResult[] } | { error: string } | null;

export async function notifyAll(): Promise<NotifyState> {
  if (!(await isAdmin())) return { error: "다시 로그인해 주세요." };
  const [deals, cats] = await Promise.all([getAllDeals(), getAllCategories()]);
  if (deals.length === 0) return { error: "알릴 글이 없거나 글 목록을 불러오지 못했습니다." };
  const urls = [
    `${SITE}/`,
    `${SITE}/calendar`,
    `${SITE}/always`,
    `${SITE}/tips`,
    ...cats.map((c) => `${SITE}/category/${c.slug}`),
    ...deals.map((d) => `${SITE}/deal/${d.id}`),
  ];
  return { count: deals.length, results: await submitUrls(urls) };
}
