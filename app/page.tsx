export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-950 to-slate-900 text-white flex flex-col justify-between p-6 sm:p-12">
      {/* 상단 헤더 */}
      <header className="max-w-4xl mx-auto w-full flex justify-between items-center py-4 border-b border-white/10">
        <h1 className="text-xl font-bold tracking-wider">MY PORTFOLIO</h1>
        <span className="text-xs bg-emerald-500/20 text-emerald-400 px-3 py-1 rounded-full border border-emerald-500/30">
          ● Live Online
        </span>
      </header>

      {/* 메인 소개 영역 */}
      <section className="max-w-4xl mx-auto w-full my-auto py-12 flex flex-col items-center text-center">
        <div className="w-24 h-24 rounded-full bg-gradient-to-r from-pink-500 to-violet-500 flex items-center justify-center text-3xl font-bold mb-6 shadow-lg shadow-purple-500/30">
          🚀
        </div>
        <h2 className="text-4xl sm:text-6xl font-extrabold tracking-tight mb-4 bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-200 to-slate-400">
          안녕하세요, 반갑습니다!
        </h2>
        <p className="text-slate-400 text-lg sm:text-xl max-w-xl mb-8 leading-relaxed">
          Next.js와 Supabase, 그리고 Vercel을 활용해 멋진 나만의 웹사이트를 성공적으로 구축하고 배포했습니다.
        </p>

        {/* 버튼 그룹 */}
        <div className="flex flex-wrap gap-4 justify-center">
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="bg-white text-slate-900 font-semibold px-6 py-3 rounded-xl hover:bg-slate-200 transition-all shadow-md"
          >
            GitHub 구경하기
          </a>
          <button 
            onClick={() => alert('방문해 주셔서 감사합니다!')}
            className="bg-purple-600 hover:bg-purple-500 text-white font-semibold px-6 py-3 rounded-xl transition-all shadow-lg shadow-purple-600/30"
          >
            인사 남기기
          </button>
        </div>
      </section>

      {/* 하단 푸터 */}
      <footer className="max-w-4xl mx-auto w-full text-center text-xs text-slate-500 py-4 border-t border-white/10">
        © 2026 My Website. Powered by Next.js & Vercel.
      </footer>
    </main>
  );
}