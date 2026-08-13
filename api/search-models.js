// Vercel 서버리스 함수 — /api/search-shopping
// eBay Finding API(findItemsByKeywords)를 대신 호출해줘요. App ID는 여기, 그리고
// Vercel 프로젝트의 Environment Variables 설정에만 있어요. 브라우저로 내려가는
// 코드(index.html)에는 절대 포함되지 않아요.

export default async function handler(req, res) {
  const query = req.query.q;
  if (!query) {
    return res.status(400).json({ error: 'q 파라미터가 필요해요' });
  }

  const appId = process.env.EBAY_APP_ID;
  if (!appId) {
    return res.status(500).json({ error: 'EBAY_APP_ID가 Vercel 환경변수에 설정되어 있지 않아요' });
  }

  try {
    const url = 'https://svcs.ebay.com/services/search/FindingService/v1'
      + '?OPERATION-NAME=findItemsByKeywords'
      + '&SERVICE-VERSION=1.0.0'
      + '&SECURITY-APPNAME=' + encodeURIComponent(appId)
      + '&RESPONSE-DATA-FORMAT=JSON'
      + '&paginationInput.entriesPerPage=12'
      + '&keywords=' + encodeURIComponent(query);
    const upstream = await fetch(url);
    const raw = await upstream.json();

    // eBay 응답은 중첩이 깊어서(findItemsByKeywordsResponse[0].searchResult[0].item[])
    // 프런트에서 쓰기 편하게 우리 쪽에서 한번 정리해서 내려줘요.
    const root = raw.findItemsByKeywordsResponse && raw.findItemsByKeywordsResponse[0];
    const rawItems = (root && root.searchResult && root.searchResult[0] && root.searchResult[0].item) || [];
    const items = rawItems.map(it => ({
      title: it.title && it.title[0],
      image: it.galleryURL && it.galleryURL[0],
      link: it.viewItemURL && it.viewItemURL[0],
      price: it.sellingStatus && it.sellingStatus[0].currentPrice && it.sellingStatus[0].currentPrice[0].__value__,
      currency: it.sellingStatus && it.sellingStatus[0].currentPrice && it.sellingStatus[0].currentPrice[0]['@currencyId'],
      mallName: 'eBay'
    }));

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    return res.status(200).json({ items });
  } catch (e) {
    return res.status(502).json({ error: 'eBay 요청 실패', detail: String(e) });
  }
}