export default function BlogHome() {
  // 샘플 블로그 포스트 데이터
  const posts = [
    {
      id: 1,
      title: "Next.js와 Vercel로 나만의 웹사이트 배포하기",
      date: "2026년 9월 15일",
      category: "Development",
      summary: "복잡한 서버 설정 없이 Vercel을 이용해 Next.js 프로젝트를 쉽고 빠르게 배포하는 방법을 알아봅니다.",
    },
    {
      id: 2,
      title: "Supabase를 활용한 데이터베이스 기초 연동",
      date: "2026년 9월 12일",
      category: "Database",
      summary: "백엔드 구축 없이 안전하게 데이터를 저장하고 관리할 수 있는 Supabase의 핵심 기능을 살펴봅니다.",
    },
    {
      id: 3,
      title: "Tailwind CSS로 트렌디한 UI 디자인 만들기",
      date: "2026년 9월 10일",
      category: "Design",
      summary: "클래스 이름 몇 개만으로 모바일과 PC 화면에서 모두 완벽하게 반응하는 디자인을 구성하는 팁입니다.",
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col justify-between">
      {/* 블로그 헤더 */}
      <header className="border-b border-slate-200 bg-white sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 h-16 flex justify-between items-center">
          <h1 className="text-xl font-bold tracking-tight text-slate-900 cursor-pointer">
            ✨ My Dev Log
          </h1>
          <nav className="flex gap-6 text-sm font-medium text-slate-600">
            <span className="hover:text-blue-600 cursor-pointer transition-colors">Home</span>
            <span className="hover:text-blue-600 cursor-pointer transition-colors">About</span>
            <a 
              href="https://github.com" 
              target="_blank" 
              rel="noopener noreferrer"
              className="hover:text-blue-600 transition-colors"
            >
              GitHub
            </a>
          </nav>
        </div>
      </header>

      {/* 블로그 메인 콘텐츠 */}
      <main className="max-w-4xl mx-auto px-6 py-12 w-full flex-grow">
        {/* 블로그 소개 인트로 */}
        <section className="mb-12 text-center sm:text-left">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 mb-3 tracking-tight">
            개발과 일상을 기록하는 공간입니다.
          </h2>
          <p className="text-slate-600 text-lg">
            Next.js, Supabase, Vercel을 이용해 직접 만들어가는 성장의 기록들입니다.
          </p>
        </section>

        {/* 글 목록 카드 그리드 */}
        <section className="grid gap-6">
          {posts.map((post) => (
            <article 
              key={post.id}
              className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all cursor-pointer group"
            >
              <div className="flex items-center gap-3 mb-3">
                <span className="text-xs font-semibold bg-blue-50 text-blue-600 px-3 py-1 rounded-full border border-blue-100">
                  {post.category}
                </span>
                <span className="text-xs text-slate-400">{post.date}</span>
              </div>
              <h3 className="text-xl font-bold text-slate-900 group-hover:text-blue-600 transition-colors mb-2">
                {post.title}
              </h3>
              <p className="text-slate-600 text-sm leading-relaxed">
                {post.summary}
              </p>
            </article>
          ))}
        </section>
      </main>

      {/* 블로그 푸터 */}
      <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-400">
        <p>© 2026 My Dev Log. All rights reserved. Powered by Next.js & Vercel.</p>
      </footer>
    </div>
  );
}