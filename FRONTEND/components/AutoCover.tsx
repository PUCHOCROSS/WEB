import { coverFor, fitSize, type CoverPattern } from "../lib/autoCover";
import CategoryIcon from "./CategoryIcon";

/** 대표 이미지가 없을 때 그리는 자동 표지.
 *  글마다 색·무늬가 다르고, 브랜드 이름과 제목 속 혜택 문구(50%, 1+1 …)를 크게 보여 준다.
 *  사진·로고 없이 색과 글자만 쓰므로 저작권 걱정이 없다.
 *  칸 크기에 맞춰 글자가 커지고 작아진다(container query, cqw 단위). */
export default function AutoCover({
  seed,
  title,
  source,
  slug = "etc",
}: {
  seed: string;
  title: string;
  source?: string | null;
  slug?: string;
}) {
  const c = coverFor(seed, title, source);
  const { from, to, ink, chip } = c.palette;
  const big = c.headline ?? c.brand;

  return (
    <div
      className="relative h-full w-full overflow-hidden select-none"
      style={{ background: `linear-gradient(135deg, ${from}, ${to})`, color: ink, containerType: "size" }}
      aria-hidden
    >
      <Pattern kind={c.pattern} color={ink} />

      {/* 큰 카테고리 아이콘 (흐리게, 오른쪽 아래) */}
      <div className="absolute -bottom-[8cqh] -right-[6cqw] opacity-[.16]" style={{ width: "52cqmin", height: "52cqmin" }}>
        <CategoryIcon slug={slug} className="h-full w-full" />
      </div>

      {/* 작은 칸(달력·슬라이드): 문구 하나만 가운데 */}
      <div className="absolute inset-0 hidden items-center justify-center p-[8cqw] text-center @max-[150px]:flex">
        <span className="whitespace-nowrap font-black leading-none tracking-tight" style={{ fontSize: fitSize(big, 74, 26) }}>
          {big}
        </span>
      </div>

      {/* 보통 칸 */}
      <div className="absolute inset-0 flex flex-col justify-between p-[6cqw] @max-[150px]:hidden">
        <span
          className="max-w-full self-start truncate rounded-full font-bold"
          style={{ background: chip, fontSize: "max(11px, 5cqw)", padding: "1.2cqw 3.6cqw" }}
        >
          {c.brand}
        </span>

        <div style={{ transform: `rotate(${c.tilt * 0.4}deg)`, transformOrigin: "left bottom" }}>
          {c.headline ? (
            <>
              <div className="whitespace-nowrap font-black leading-[.95] tracking-tight" style={{ fontSize: fitSize(c.headline, 78, 17) }}>
                {c.headline}
              </div>
              <div className="mt-[1.5cqw] font-bold opacity-85" style={{ fontSize: "max(11px, 4.6cqw)" }}>
                오늘의 혜택
              </div>
            </>
          ) : (
            <div className="font-black leading-tight tracking-tight">
              <span className="block whitespace-nowrap" style={{ fontSize: fitSize(c.brand, 78, 14) }}>
                {c.brand}
              </span>
              <span className="block font-bold opacity-85" style={{ fontSize: "max(11px, 4.6cqw)" }}>
                진행 중인 행사
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** 바탕 무늬 (같은 색, 옅게) */
function Pattern({ kind, color }: { kind: CoverPattern; color: string }) {
  const common = { fill: "none", stroke: color, strokeWidth: 1.2 } as const;
  let body: React.ReactNode;
  switch (kind) {
    case "circles":
      body = (
        <>
          <circle cx="88" cy="8" r="22" fill={color} />
          <circle cx="6" cy="58" r="14" fill={color} />
        </>
      );
      break;
    case "rings":
      body = (
        <>
          {[10, 18, 26, 34].map((r) => (
            <circle key={r} cx="92" cy="6" r={r} {...common} />
          ))}
        </>
      );
      break;
    case "dots":
      body = (
        <>
          {Array.from({ length: 9 * 6 }, (_, i) => (
            <circle key={i} cx={6 + (i % 9) * 11} cy={5 + Math.floor(i / 9) * 11} r="1.1" fill={color} />
          ))}
        </>
      );
      break;
    case "stripes":
      body = (
        <>
          {Array.from({ length: 12 }, (_, i) => (
            <path key={i} d={`M${i * 12 - 40} 64 L${i * 12 + 10} -4`} stroke={color} strokeWidth="3" />
          ))}
        </>
      );
      break;
    case "waves":
      body = (
        <>
          {[14, 26, 38, 50].map((y) => (
            <path key={y} d={`M-5 ${y} q 12.5 -7 25 0 t 25 0 t 25 0 t 25 0 t 25 0`} {...common} strokeWidth="1.6" />
          ))}
        </>
      );
      break;
    case "confetti":
      body = (
        <>
          {[
            [12, 10, 20],
            [30, 48, -30],
            [55, 14, 45],
            [74, 40, 10],
            [90, 22, -60],
            [44, 32, 70],
            [8, 38, -15],
            [66, 54, 30],
          ].map(([x, y, r], i) => (
            <rect key={i} x={x} y={y} width="5" height="2.2" rx="1" fill={color} transform={`rotate(${r} ${x} ${y})`} />
          ))}
        </>
      );
      break;
  }
  return (
    <svg className="absolute inset-0 h-full w-full opacity-[.13]" viewBox="0 0 100 60" preserveAspectRatio="xMidYMid slice">
      {body}
    </svg>
  );
}
