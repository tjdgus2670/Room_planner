// Vercel 서버리스 함수 — 이 저장소에서 /api 폴더 안에 있으면 Vercel이 자동으로
// https://내프로젝트.vercel.app/api/search-models 라는 주소로 배포해줘요.
//
// Poly Pizza API 키는 여기, 그리고 Vercel 프로젝트의 Environment Variables 설정에만
// 존재해요. 브라우저로 내려가는 코드(room_planner.html)에는 절대 포함되지 않아요.

export default async function handler(req, res) {
  const query = req.query.q;
  if (!query) {
    return res.status(400).json({ error: 'q 파라미터가 필요해요' });
  }

  const apiKey = process.env.POLYPIZZA_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'POLYPIZZA_API_KEY가 Vercel 환경변수에 설정되어 있지 않아요' });
  }

  try {
    const upstream = await fetch(
      'https://api.poly.pizza/v1/search/' + encodeURIComponent(query) + '?limit=12',
      { headers: { 'X-Auth-Token': apiKey } }
    );
    const data = await upstream.json();
    // 브라우저 쪽 캐시/CDN에 잠깐 캐싱해서 같은 검색어 반복 요청을 줄여줘요.
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    return res.status(upstream.status).json(data);
  } catch (e) {
    return res.status(502).json({ error: 'Poly Pizza 요청 실패', detail: String(e) });
  }
}