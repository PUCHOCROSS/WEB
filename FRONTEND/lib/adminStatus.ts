// 관리자 화면용 글 상태 (Work Hub page_posts.py 의 status_of 와 같은 규칙)
import type { Deal } from "./deals";
import { dealPeriod, diffDays, kstToday } from "./period";

export type AdminStatus = "ongoing" | "upcoming" | "ended" | "soldout" | "always" | "none";

export const STATUS_LABEL: Record<AdminStatus, string> = {
  ongoing: "진행 중",
  upcoming: "곧 시작",
  ended: "종료",
  soldout: "소진",
  always: "상시",
  none: "기간 없음",
};

/** [분류, 표시 문구]  예) ["ongoing", "D-3"] */
export function adminStatus(d: Deal, today = kstToday()): [AdminStatus, string] {
  const p = dealPeriod(d);
  if (p.end && p.end < today) return ["ended", "종료"];
  if (d.soldOut) return ["soldout", "소진"];
  if (d.always && !p.end) return ["always", "상시"];
  if (!p.start && !p.end) return ["none", "—"];
  if (p.start && p.start > today) {
    const n = diffDays(p.start, today);
    return ["upcoming", n === 1 ? "내일 시작" : `${n}일 뒤 시작`];
  }
  if (p.end) {
    const left = diffDays(p.end, today);
    return ["ongoing", left === 0 ? "오늘 마감" : `D-${left}`];
  }
  return ["ongoing", "진행 중"];
}
