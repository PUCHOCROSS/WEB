import type { Metadata } from "next";
import SimplePage, { Section } from "../../components/SimplePage";
import { CONTACT_EMAIL, SITE_NAME, SITE_URL } from "../../lib/site";

export const metadata: Metadata = {
  title: "개인정보처리방침",
  description: `${SITE_NAME} 개인정보처리방침`,
  alternates: { canonical: "/privacy" },
};

// 내용을 바꾸면 시행일도 함께 바꿔 주세요.
const EFFECTIVE_DATE = "2026년 11월 14일";

const linkCls = "font-semibold text-ink underline underline-offset-2";

export default function PrivacyPage() {
  return (
    <SimplePage title="개인정보처리방침">
      <p>
        {SITE_NAME}({SITE_URL}, 이하 &lsquo;사이트&rsquo;)는 「개인정보 보호법」 등 관련 법령을 지키며, 이용자의
        개인정보를 소중히 다룹니다. 이 방침은 사이트가 어떤 정보를 어떻게 처리하는지 알려 드리기 위한 것입니다.
      </p>

      <Section title="1. 수집하는 개인정보">
        <p>
          사이트는 회원가입, 로그인, 댓글 기능이 없으며 이름·연락처 같은 개인정보를 직접 입력받지 않습니다.
        </p>
        <p>다만 서비스를 이용하는 과정에서 아래 정보가 자동으로 생성되어 수집될 수 있습니다.</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>접속 IP 주소, 브라우저 종류, 운영체제, 방문 일시, 방문한 페이지 등 접속 기록</li>
          <li>방문 직전에 보던 사이트 주소(유입 경로). 어느 사이트에서 몇 명이 왔는지 날짜별 숫자로만 집계하며, 개인을 알아볼 수 있는 형태로는 저장하지 않습니다.</li>
          <li>쿠키 및 광고 식별자 (아래 4번 참고)</li>
        </ul>
        <p>
          이메일로 문의하시는 경우, 답변을 위해 보내 주신 이메일 주소와 문의 내용을 보관합니다.
        </p>
      </Section>

      <Section title="2. 이용 목적">
        <ul className="list-disc pl-5 space-y-1">
          <li>사이트 운영, 장애 대응 및 보안 (부정 이용 방지)</li>
          <li>방문자 수, 페이지 조회수 등 이용 통계 (개인을 식별하지 않는 형태로 집계)</li>
          <li>광고 게재 및 광고 효과 측정</li>
          <li>문의에 대한 답변</li>
        </ul>
      </Section>

      <Section title="3. 보유 기간 및 파기">
        <p>
          접속 기록은 호스팅 업체의 정책에 따라 일정 기간 보관된 뒤 자동으로 삭제됩니다. 문의 내용은 답변 완료 후
          1년간 보관한 뒤 지체 없이 삭제합니다. 법령에서 따로 보관 기간을 정한 경우에는 그 기간 동안 보관합니다.
        </p>
      </Section>

      <Section title="4. 쿠키 및 광고">
        <p>
          사이트는 광고 게재를 위해 Google 애드센스 등 제3자 광고 서비스를 이용할 수 있습니다. Google을 포함한 제3자
          광고 업체는 쿠키를 사용하여 이용자가 이 사이트와 다른 사이트를 방문한 기록을 바탕으로 맞춤 광고를 보여줄
          수 있습니다.
        </p>
        <p>
          이용자는{" "}
          <a href="https://adssettings.google.com" target="_blank" rel="noopener noreferrer" className={linkCls}>
            Google 광고 설정
          </a>
          에서 맞춤 광고를 끌 수 있으며, Google의 데이터 사용 방식은{" "}
          <a
            href="https://policies.google.com/technologies/partner-sites"
            target="_blank"
            rel="noopener noreferrer"
            className={linkCls}
          >
            여기
          </a>
          에서 확인할 수 있습니다.
        </p>
        <p>
          사이트에는 쿠팡 파트너스 등 제휴 링크가 포함될 수 있습니다. 제휴 링크를 누르면 해당 업체가 구매 실적 확인을
          위해 쿠키를 저장할 수 있으며, 이 경우 해당 업체의 개인정보처리방침이 적용됩니다.
        </p>
        <p>
          이용자는 브라우저 설정에서 쿠키 저장을 거부하거나 삭제할 수 있습니다. 다만 쿠키를 거부하면 일부 기능
          이용에 불편이 있을 수 있습니다.
        </p>
      </Section>

      <Section title="5. 처리 위탁 및 국외 이전">
        <p>사이트는 운영을 위해 아래 업체의 서비스를 이용하며, 이 과정에서 접속 정보가 처리될 수 있습니다.</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Vercel Inc. (미국) – 웹사이트 호스팅</li>
          <li>Supabase Inc. – 데이터베이스 (게시물·방문 통계 저장, 개인 식별 정보는 저장하지 않음)</li>
          <li>Google LLC (미국) – 광고 게재 (광고를 게재하는 경우)</li>
        </ul>
        <p>사이트는 위의 경우를 제외하고 이용자의 개인정보를 제3자에게 제공하지 않습니다.</p>
      </Section>

      <Section title="6. 이용자의 권리">
        <p>
          이용자는 언제든지 자신의 개인정보에 대한 열람, 정정, 삭제, 처리 정지를 요청할 수 있습니다. 아래 연락처로
          요청하시면 지체 없이 조치하겠습니다.
        </p>
      </Section>

      <Section title="7. 개인정보 보호책임자 및 문의처">
        <p>
          이메일:{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className={linkCls}>
            {CONTACT_EMAIL}
          </a>
        </p>
        <p>
          개인정보 침해에 대한 신고나 상담이 필요하시면 개인정보침해신고센터(privacy.kisa.or.kr, 국번 없이 118)에
          문의하실 수 있습니다.
        </p>
      </Section>

      <Section title="8. 방침의 변경">
        <p>이 방침은 {EFFECTIVE_DATE}부터 적용됩니다. 내용이 바뀌면 이 페이지를 통해 알려 드립니다.</p>
      </Section>
    </SimplePage>
  );
}
