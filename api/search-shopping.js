// Vercel 서버리스 함수 — /api/search-shopping
// eBay의 최신 Browse API를 대신 호출해줘요 (구버전 Finding API가 서버발 요청을
// 계속 차단해서 이걸로 바꿨어요). Browse API는 OAuth 토큰이 필요해서
// App ID(Client ID) + Cert ID(Client Secret) 둘 다 있어야 해요.
// 둘 다 여기, 그리고 Vercel 환경변수에만 있어요 — 브라우저로는 절대 안 내려가요.

let cachedToken = null;
let cachedTokenExpiry = 0;

async function getEbayToken(appId, certId) {
  if (cachedToken && Date.now() < cachedTokenExpiry) return cachedToken;
  const basic = btoa(appId + ':' + certId); // Buffer 대신 어디서든 되는 btoa로
  const res = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + basic
    },
    body: 'grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope'
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('토큰 발급 실패: ' + JSON.stringify(data).slice(0, 300));
  cachedToken = data.access_token;
  cachedTokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return cachedToken;
}

export default async function handler(req, res) {
  const query = req.query.q;
  if (!query) {
    return res.status(400).json({ error: 'q 파라미터가 필요해요' });
  }

  const appId = process.env.EBAY_APP_ID;
  const certId = process.env.EBAY_CERT_ID;
  if (!appId || !certId) {
    return res.status(500).json({ error: 'EBAY_APP_ID / EBAY_CERT_ID가 Vercel 환경변수에 설정되어 있지 않아요' });
  }

  try {
    const token = await getEbayToken(appId, certId);
    const url = 'https://api.ebay.com/buy/browse/v1/item_summary/search'
      + '?q=' + encodeURIComponent(query) + '&limit=12';
    const upstream = await fetch(url, {
      headers: {
        'Authorization': 'Bearer ' + token,
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US'
      }
    });
    const bodyText = await upstream.text();

    let raw;
    try { raw = JSON.parse(bodyText); }
    catch (parseErr) {
      return res.status(502).json({
        error: 'eBay 응답이 JSON이 아니에요',
        upstreamStatus: upstream.status,
        rawBody: bodyText.slice(0, 500)
      });
    }

    if (raw.errors) {
      return res.status(502).json({ error: 'eBay가 에러를 반환했어요', detail: raw.errors });
    }

    const items = (raw.itemSummaries || []).map(it => ({
      title: it.title,
      image: it.image && it.image.imageUrl,
      link: it.itemWebUrl,
      price: it.price && it.price.value,
      currency: it.price && it.price.currency,
      mallName: 'eBay'
    }));

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    return res.status(200).json({ items });
  } catch (e) {
    console.error('search-shopping error:', e); // Vercel Logs 탭에도 남게
    return res.status(502).json({ error: 'eBay 요청 실패', detail: String(e && e.stack || e) });
  }
}