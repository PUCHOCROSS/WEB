// 달력 계산 (서버 / 브라우저 공용, 순수 함수만)
import type { DealSummary } from "./categories";
import { addDays, diffDays } from "./period";

/** 달력에 그릴 행사 하나. 브라우저로 넘기므로 필요한 값만 담는다. */
export type CalEvent = {
  id: string;
  title: string;
  category: string;
  image: string | null;
  source: string;
  start: string; // 달력에 그릴 시작일
  end: string; // 달력에 그릴 종료일
  startsOn: string | null; // 실제로 알려진 시작일 (없으면 null)
  endsOn: string | null;
  openEnd: boolean; // 시작일만 알려진 행사
  badge: DealSummary["badge"];
};

const kstDayOf = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date(iso));

/** 종료일만 있으면 등록일부터, 시작일만 있으면 그날 하루로 그린다 */
export function toCalEvent(d: DealSummary): CalEvent | null {
  if (!d.startsOn && !d.endsOn) return null;
  let start: string, end: string;
  if (d.startsOn && d.endsOn) [start, end] = [d.startsOn, d.endsOn];
  else if (d.endsOn) {
    const posted = kstDayOf(d.publishedAt);
    [start, end] = [posted < d.endsOn ? posted : d.endsOn, d.endsOn];
  } else [start, end] = [d.startsOn!, d.startsOn!];
  return {
    id: d.id,
    title: d.title,
    category: d.category,
    image: d.image,
    source: d.source,
    start,
    end,
    startsOn: d.startsOn,
    endsOn: d.endsOn,
    openEnd: Boolean(d.startsOn && !d.endsOn),
    badge: d.badge,
  };
}

export type Segment = { ev: CalEvent; col: number; span: number; lane: number; head: boolean; tail: boolean };

/** 한 주(7일) 안에서 행사 막대가 겹치지 않게 줄(lane)을 나눈다. 넘치는 행사 수는 날짜별로 센다. */
export function layoutWeek(events: CalEvent[], weekStart: string, maxLanes: number) {
  const weekEnd = addDays(weekStart, 6);
  const inWeek = events
    .filter((e) => e.start <= weekEnd && e.end >= weekStart)
    .sort((a, b) => a.start.localeCompare(b.start) || diffDays(b.end, b.start) - diffDays(a.end, a.start));

  const laneEnds: number[] = [];
  const segments: Segment[] = [];
  const hidden = Array(7).fill(0) as number[];

  for (const ev of inWeek) {
    const from = Math.max(0, diffDays(ev.start, weekStart));
    const to = Math.min(6, diffDays(ev.end, weekStart));
    let lane = laneEnds.findIndex((last) => last < from);
    if (lane === -1) lane = laneEnds.length;
    if (lane >= maxLanes) {
      for (let c = from; c <= to; c++) hidden[c]++;
      continue;
    }
    laneEnds[lane] = to;
    segments.push({ ev, col: from, span: to - from + 1, lane, head: ev.start >= weekStart, tail: ev.end <= weekEnd });
  }
  return { segments, hidden };
}

/** 그날 진행 중인 행사: 마감이 가까운 순 → 그날 시작하는 순 */
export function eventsOn(events: CalEvent[], day: string) {
  return events
    .filter((e) => e.start <= day && e.end >= day)
    .sort((a, b) => (a.endsOn ?? "9999").localeCompare(b.endsOn ?? "9999") || a.start.localeCompare(b.start));
}
