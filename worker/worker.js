// Cloudflare Worker: Google Cloud Vision API Proxy
// APIキーはCloudflareの環境変数（シークレット）に保存
// クライアント側にAPIキーが一切漏れない

const ALLOWED_ORIGIN = 'https://y194275.github.io';

export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: corsHeaders()
      });
    }

    // POST以外は拒否
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' }
      });
    }

    // Origin チェック（自分のサイト以外からのリクエストを拒否）
    const origin = request.headers.get('Origin');
    if (origin && origin !== ALLOWED_ORIGIN) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    try {
      const body = await request.json();

      if (!body.image) {
        return new Response(JSON.stringify({ error: 'No image provided' }), {
          status: 400,
          headers: { ...corsHeaders(), 'Content-Type': 'application/json' }
        });
      }

      // Google Cloud Vision API を呼び出し（APIキーはサーバー側の環境変数）
      const visionResponse = await fetch(
        `https://vision.googleapis.com/v1/images:annotate?key=${env.GOOGLE_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requests: [{
              image: { content: body.image },
              features: [{ type: 'TEXT_DETECTION' }]
            }]
          })
        }
      );

      const data = await visionResponse.json();

      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' }
      });

    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' }
      });
    }
  }
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}
