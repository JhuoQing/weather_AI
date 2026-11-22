// Cloudflare Worker：替天氣網頁呼叫 Claude API。
// 金鑰（ANTHROPIC_API_KEY）只存在 Worker 的 Secret，不會出現在網頁或 GitHub。

const CITIES = ['基隆市', '台北市', '新北市', '桃園市', '新竹市', '新竹縣', '苗栗縣', '台中市', '彰化縣', '南投縣', '雲林縣',
  '嘉義市', '嘉義縣', '台南市', '高雄市', '屏東縣', '宜蘭縣', '花蓮縣', '台東縣', '澎湖縣', '金門縣', '連江縣'];

const MODES = {
  outfit: '穿搭（今天該穿什麼、要不要帶外套）',
  commute: '通勤（上下班路上的雨具、時間、風、空氣）',
  sport: '運動（適不適合戶外運動、時段、補水、防曬）',
  laundry: '洗衣（適不適合洗與曬衣服、棉被）',
  trip: '出遊（適合的行程類型、室內或戶外、要帶什麼）'
};

const SYSTEM = [
  '你是台灣的生活氣象小助理，語氣親切、清楚、不誇張。',
  '只根據使用者提供的天氣數字給建議，不要編造數字，也不要宣稱這是官方預報。',
  '用繁體中文。輸出一個 JSON 物件，不要任何其他文字或標記，格式：',
  '{"head":"一句話總結（20 字內）","tips":["建議一","建議二","建議三"]}',
  'tips 固定三條，每條 45 字以內，要具體、可立刻照做，並引用相關的天氣數字。'
].join('\n');

function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
}

function corsHeaders(origin, env) {
  const list = allowedOrigins(env);
  const ok = list.includes(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin : (list[0] || 'null'),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers }
  });
}

const num = (v, lo, hi) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n))) : null;
};

// 驗證並重新整理輸入，避免網頁被拿來送任意內容給模型
export function sanitize(input) {
  if (!input || typeof input !== 'object') return null;
  if (!CITIES.includes(input.city) || !Object.prototype.hasOwnProperty.call(MODES, input.mode)) return null;
  const w = input.weather || {};
  const hours = Array.isArray(w.hours) ? w.hours.slice(0, 12).map((h) => ({
    t: String(h && h.t || '').slice(0, 5),
    temp: num(h && h.temp, -20, 50),
    pop: num(h && h.pop, 0, 100)
  })) : [];
  return {
    city: input.city,
    mode: input.mode,
    weather: {
      temp: num(w.temp, -20, 50), feels: num(w.feels, -20, 60), hi: num(w.hi, -20, 50), lo: num(w.lo, -20, 50),
      pop: num(w.pop, 0, 100), humidity: num(w.humidity, 0, 100), uv: num(w.uv, 0, 20),
      aqi: num(w.aqi, 0, 500), wind: num(w.wind, 0, 17),
      sky: String(w.sky || '').slice(0, 12), hours
    }
  };
}

export function parseAdvice(text) {
  const m = String(text || '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]);
    if (typeof j.head !== 'string' || !Array.isArray(j.tips)) return null;
    const tips = j.tips.filter((t) => typeof t === 'string' && t.trim()).slice(0, 3).map((t) => t.trim().slice(0, 120));
    if (!tips.length) return null;
    return { head: j.head.trim().slice(0, 60), tips };
  } catch (e) {
    return null;
  }
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin, env);
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (url.pathname !== '/api/advice') return json({ error: 'not_found' }, 404, cors);
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, cors);
    if (!allowedOrigins(env).includes(origin)) return json({ error: 'forbidden_origin' }, 403, cors);
    if (!env.ANTHROPIC_API_KEY) return json({ error: 'server_not_configured' }, 500, cors);

    let raw;
    try {
      const text = await request.text();
      if (text.length > 4000) return json({ error: 'too_large' }, 413, cors);
      raw = JSON.parse(text);
    } catch (e) {
      return json({ error: 'bad_json' }, 400, cors);
    }
    const input = sanitize(raw);
    if (!input) return json({ error: 'bad_input' }, 400, cors);

    const userMsg = '縣市：' + input.city + '\n想看的方面：' + MODES[input.mode] + '\n天氣資料（JSON）：' + JSON.stringify(input.weather);

    let resp;
    try {
      resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: env.MODEL || 'claude-haiku-5-5',
          max_tokens: 500,
          system: SYSTEM,
          messages: [{ role: 'user', content: userMsg }]
        })
      });
    } catch (e) {
      return json({ error: 'upstream_unreachable' }, 502, cors);
    }
    if (!resp.ok) return json({ error: 'upstream_error', status: resp.status }, 502, cors);

    const data = await resp.json();
    const text = data && Array.isArray(data.content) ? data.content.filter((b) => b.type === 'text').map((b) => b.text).join('') : '';
    const advice = parseAdvice(text);
    if (!advice) return json({ error: 'bad_model_output' }, 502, cors);
    return json(advice, 200, cors);
  }
};
