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
    const bodyText = await upstream.text();

    let raw;
    try{ raw = JSON.parse(bodyText); }
    catch(parseErr){
      // eBay가 JSON이 아닌 걸(HTML 에러페이지, 빈 응답 등) 줬을 때 원문 그대로 보여줘서
      // 다음엔 추측 없이 바로 원인을 알 수 있게 해요.
      return res.status(502).json({
        error: 'eBay 응답이 JSON이 아니에요',
        upstreamStatus: upstream.status,
        rawBody: bodyText.slice(0, 500)
      });
    }

    // eBay 에러 응답은 성공 응답이랑 구조가 달라요 (findItemsByKeywordsResponse 대신 errorMessage)
    if (raw.errorMessage) {
      return res.status(502).json({ error: 'eBay가 에러를 반환했어요', detail: raw.errorMessage });
    }

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