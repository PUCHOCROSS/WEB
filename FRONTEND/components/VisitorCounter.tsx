"use client";

import { useEffect, useState } from "react";

const SESSION_KEY = "visited-this-session";

export default function VisitorCounter() {
  const [total, setTotal] = useState<number | null>(null);

  useEffect(() => {
    // 같은 브라우저 세션(탭)에서 새로고침해도 중복으로 세지 않도록 sessionStorage 로 체크한다.
    const already = (() => {
      try {
        return sessionStorage.getItem(SESSION_KEY) === "1";
      } catch {
        return false;
      }
    })();

    const method = already ? "GET" : "POST";
    fetch("/api/visit", { method })
      .then((r) => r.json())
      .then((data) => {
        if (data?.ok) {
          setTotal(data.total);
          if (!already) {
            try {
              sessionStorage.setItem(SESSION_KEY, "1");
            } catch {
              /* 저장 실패해도 화면 표시에는 영향 없음 */
            }
          }
        }
      })
      .catch(() => {
        /* 방문자 수는 통계용 - 실패해도 화면에는 아무 것도 표시하지 않는다 */
      });
  }, []);

  if (total === null) return null;

  return <span className="text-sm text-slate-500">누적 방문 {total.toLocaleString()}명</span>;
}
