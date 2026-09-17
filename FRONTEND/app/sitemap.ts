import { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://www.dolmeori.com/'; // 본인의 실제 도메인 주소로 수정

  return [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1.0,
    },
    // 나중에 페이지나 글이 늘어나면 여기에 주소를 추가할 수 있습니다.
  ];
}