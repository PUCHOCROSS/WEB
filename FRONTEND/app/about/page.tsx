import type { Metadata } from "next";
import SimplePage, { Section } from "../../components/SimplePage";
import { CONTACT_EMAIL, SITE_NAME } from "../../lib/site";

export const metadata: Metadata = {
  title: "사이트 소개",
  description: `${SITE_NAME}는 흩어져 있는 쿠폰과 할인 행사 소식을 한곳에 모아 소개합니다.`,
  alternates: { canonical: "/about" },
  openGraph: {
    title: `사이트 소개 | ${SITE_NAME}`,
    description: `${SITE_NAME}는 흩어져 있는 쿠폰과 할인 행사 소식을 한곳에 모아 소개합니다.`,
    url: "/about",
  },
};

export default function AboutPage() {
  return (
    <SimplePage title="사이트 소개">
      <Section title={`${SITE_NAME}는 어떤 곳인가요?`}>
        <p>
          쇼핑몰, 외식, 통신, 여행, 편의점 등 여러 곳에 흩어져 있는 쿠폰과 할인 행사 소식을 키워드별로 모아
          한곳에서 볼 수 있게 정리하는 사이트입니다.
        </p>
        <p>
          각 소식에는 행사 내용과 함께 원문 링크를 달아 두었습니다. 행사 조건과 기간은 업체 사정에 따라 바뀔 수
          있으니, 이용하기 전에 원문에서 최신 내용을 꼭 확인해 주세요.
        </p>
      </Section>

      <Section title="콘텐츠의 저작권">
        <p>
          각 행사의 원문 내용과 이미지의 저작권은 해당 게시처에 있습니다. 게시를 원하지 않는 내용이 있다면 아래
          이메일로 알려 주세요. 확인 후 빠르게 내리겠습니다.
        </p>
      </Section>

      <Section title="광고 및 제휴 안내">
        <p>
          이 사이트는 운영비를 위해 광고를 게재하거나 제휴 링크를 사용할 수 있습니다. 제휴 링크를 통해 구매가
          이루어지면 운영자가 일정액의 수수료를 받을 수 있으며, 이용자가 추가로 부담하는 비용은 없습니다.
        </p>
      </Section>

      <Section title="문의">
        <p>
          제휴, 정정 요청, 게시 중단 요청 등은{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-ink underline underline-offset-2">
            {CONTACT_EMAIL}
          </a>
          로 보내 주세요.
        </p>
      </Section>
    </SimplePage>
  );
}
