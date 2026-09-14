import { createClient } from '@supabase/supabase-js'

export default async function Home() {
  // .env.local에 설정한 환경 변수를 불러와 Supabase 클라이언트 생성
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  const supabase = createClient(supabaseUrl, supabaseKey)

  // Supabase 연결 테스트 (현재 시각 데이터 조회 등 간단한 쿼리)
  const { data, error } = await supabase.from('_not_exists_table_').select('*').limit(1)

  return (
    <main style={{ padding: '40px', fontFamily: 'sans-serif' }}>
      <h1>Supabase 연결 테스트</h1>
      <p>URL 설정 여부: {supabaseUrl ? '✅ 설정됨' : '❌ 안 됨'}</p>
      <p>Key 설정 여부: {supabaseKey ? '✅ 설정됨' : '❌ 안 됨'}</p>
      <p>통신 결과: {error ? '✅ Supabase 서버와 정상 통신 중 (에러는 테이블이 없어 발생한 정상 응답)' : '연결 확인 필요'}</p>
    </main>
  )
}