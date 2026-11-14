"use client";

import { useEffect, useState } from "react";

const DAY_KEY = "dm-visit-day";

/** 오늘(한국 시간) 날짜 YYYY-MM-DD */
const kstToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());

/** 오늘 방문자 수. 같은 브라우저는 하루에 한 번만 센다. */
export default function VisitorCounter() {
  const [today, setToday] = useState<number | null>(null);

  useEffect(() => {
    const day = kstToday();
    let counted = false;
    try {
      counted = localStorage.getItem(DAY_KEY) === day;
    } catch {
      /* 저장소를 못 쓰는 브라우저(시크릿 모드 일부)는 매번 조회만 */
      counted = true;
    }

    const params = new URLSearchParams(window.location.search);
    const req = counted
      ? fetch("/api/visit")
      : fetch("/api/visit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            referrer: document.referrer,
            campaign: params.get("utm_source") ?? params.get("ref") ?? "",
          }),
        });

    req
      .then((r) => r.json())
      .then((data) => {
        if (!data?.ok) return;
        setToday(Number(data.today) || 0);
        if (!counted) {
          try {
            localStorage.setItem(DAY_KEY, day);
          } catch {
            /* 표시에는 영향 없음 */
          }
        }
      })
      .catch(() => {
        /* 통계용 - 실패해도 화면에는 아무 것도 표시하지 않는다 */
      });
  }, []);

  if (today === null || today === 0) return null;

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-stamp/90 px-3 py-1 text-[13px] font-semibold text-ink">
      오늘 {today.toLocaleString()}명 방문
    </span>
  );
}
