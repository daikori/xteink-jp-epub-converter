/**
 * Cloudflare Pages Function — /proxy?url=<encoded-url>
 *
 * サーバーサイドで対象URLを fetch し、レスポンスをそのまま返す。
 * ブラウザからは同一オリジンリクエストになるため CORS 問題が発生しない。
 * 青空文庫ドメイン以外はブロックする（オープンプロキシ防止）。
 */
export async function onRequest(context) {
  const { request } = context;

  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(),
    });
  }

  const incoming = new URL(request.url);
  const rawUrl = incoming.searchParams.get('url');

  if (!rawUrl) {
    return new Response('Missing ?url= parameter', { status: 400, headers: corsHeaders() });
  }

  let targetUrl;
  try {
    targetUrl = new URL(rawUrl);
  } catch {
    return new Response('Invalid URL', { status: 400, headers: corsHeaders() });
  }

  // 青空文庫ドメインのみ許可
  if (!targetUrl.hostname.endsWith('aozora.gr.jp')) {
    return new Response('Forbidden: only aozora.gr.jp is allowed', { status: 403, headers: corsHeaders() });
  }

  let upstream;
  try {
    upstream = await fetch(targetUrl.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; XteinkEpubConverter/1.0)',
        'Accept': 'text/html,application/xhtml+xml,application/xml,application/zip,*/*',
      },
    });
  } catch (e) {
    return new Response(`Upstream fetch failed: ${e.message}`, { status: 502, headers: corsHeaders() });
  }

  // レスポンスをそのままストリームで転送
  const responseHeaders = new Headers(corsHeaders());
  const ct = upstream.headers.get('content-type');
  if (ct) responseHeaders.set('content-type', ct);

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}
