// 사이트 공통 정보. 도메인이나 이름을 바꿀 때는 여기만 고치면 됩니다.
export const SITE_URL = "https://www.dolmeori.com"; // 끝에 / 를 붙이지 마세요
export const SITE_NAME = "오늘의 쿠폰·행사";
export const SITE_DESCRIPTION = "키워드별로 모아 온 최신 쿠폰과 행사 소식";

// 문의 받을 이메일. 소개 / 개인정보처리방침 페이지에 표시됩니다. (꼭 실제 주소로 바꾸세요)
export const CONTACT_EMAIL = "contact@example.com";

// ── 쿠팡 파트너스 ────────────────────────────────────────────────────────
// 값이 비어 있으면 배너가 표시되지 않습니다. (가입 전에도 사이트는 그대로 동작)
//
// [방법 A] 다이내믹 배너 (추천)
//   쿠팡 파트너스 → 다이내믹 배너 → 배너 만들기 → 받은 코드에서
//   new PartnersCoupang.G({ "id": 123456, "trackingCode": "AF1234567", ... })
//   의 id 와 trackingCode 두 값만 아래에 옮겨 적으세요.
//
// [방법 B] 일반 배너 iframe
//   배너 코드가 <iframe src="https://..."> 형태라면 그 src 주소를 iframeSrc 에 넣으세요.
//   (iframeSrc 가 있으면 방법 A 보다 우선합니다)
export const COUPANG = {
  bannerId: "", // 예: "123456"
  trackingCode: "", // 예: "AF1234567"
  template: "carousel", // 다이내믹 배너 템플릿 (carousel / banner 등, 쿠팡 코드에 적힌 값)
  subId: "dolmeori", // 채널 구분용 (쿠팡 리포트에서 어느 사이트 실적인지 구분됨)
  iframeSrc: "",
  height: 140,
};

// 공정거래위원회 지침 + 쿠팡 파트너스 필수 고지 문구. 문구를 지우거나 작게 숨기면 활동 정지될 수 있습니다.
export const COUPANG_DISCLOSURE =
  "이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.";
