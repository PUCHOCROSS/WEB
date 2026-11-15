// 글이 바뀌었을 때 화면 갱신 (발행 API · 관리자 화면 공용, 서버 전용)
import { revalidatePath } from "next/cache";

/** 홈 / 카테고리 / 달력 / 상시 혜택 / 사이트맵 / 관리자 화면을 바로 갱신. id 를 주면 그 글의 상세 페이지도 */
export function refreshPages(id?: string) {
  revalidatePath("/");
  if (id) revalidatePath(`/deal/${id}`);
  revalidatePath("/category/[slug]", "page");
  revalidatePath("/calendar");
  revalidatePath("/always");
  revalidatePath("/sitemap.xml");
  revalidatePath("/rss.xml");
  revalidatePath("/admin", "layout");
}
