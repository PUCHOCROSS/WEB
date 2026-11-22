import { after } from "next/server";

/** 새 글·고친 글을 검색엔진(네이버·빙 등)에 바로 알리기 — IndexNow
 *  검색 로봇이 찾아올 때까지 며칠 기다리지 않고 "이 주소가 새로 생겼어요"라고 알려 준다.
 *  키는 비밀번호가 아니라 '이 사이트 주인이 보낸 것'을 확인하는 표시라 공개돼도 된다
 *  (public/<키>.txt 파일과 같아야 함). */
export const SITE = "https://www.dolmeori.com";
const HOST = "www.dolmeori.com";
export const INDEXNOW_KEY = "08caeb9f18852f8e1a868b110df7f2b4";

const ENDPOINTS = [
  "https://searchadvisor.naver.com/indexnow", // 네이버
  "https://api.indexnow.org/indexnow", // 빙·얀덱스 등 (서로 공유)
];

export type SubmitResult = { name: string; ok: boolean; status: string };

const NAMES: Record<string, string> = {
  "https://searchadvisor.naver.com/indexnow": "네이버",
  "https://api.indexnow.org/indexnow": "빙 등",
};

/** 주소 목록을 검색엔진에 보내고 결과를 돌려준다 (한 번에 최대 10,000개) */
export async function submitUrls(urls: string[]): Promise<SubmitResult[]> {
  const body = JSON.stringify({ host: HOST, key: INDEXNOW_KEY, keyLocation: `${SITE}/${INDEXNOW_KEY}.txt`, urlList: urls.slice(0, 10000) });
  return Promise.all(
    ENDPOINTS.map(async (ep): Promise<SubmitResult> => {
      const name = NAMES[ep] ?? ep;
      try {
        const res = await fetch(ep, {
          method: "POST",
          headers: { "Content-Type": "application/json; charset=utf-8" },
          body,
          signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) console.warn(`[indexnow] ${ep} → ${res.status}`);
        return { name, ok: res.ok, status: String(res.status) };
      } catch (e) {
        console.warn(`[indexnow] ${ep} 실패:`, e);
        return { name, ok: false, status: "연결 실패" };
      }
    }),
  );
}

const send = async (urls: string[]) => {
  await submitUrls(urls);
};

/** 글 id 들을 검색엔진에 알린다. 응답을 기다리지 않음(발행 속도에 영향 없음). 개발 PC에서는 보내지 않음. */
export function notifySearchEngines(dealIds: string[]) {
  const ids = dealIds.filter(Boolean);
  if (ids.length === 0 || process.env.VERCEL_ENV !== "production") return;
  const urls = [...ids.map((id) => `${SITE}/deal/${id}`), `${SITE}/`];
  try {
    after(() => send(urls));
  } catch {
    void send(urls); // after() 를 쓸 수 없는 곳에서 불린 경우
  }
}
