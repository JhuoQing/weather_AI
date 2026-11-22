// Cloudflare Worker：
//  1. 每天早（07:00）、中（12:00）、晚（18:00）向中央氣象署抓全台 22 縣市預報，
//     再請 Claude 為每個縣市產生「穿搭、通勤、運動、洗衣、出遊」建議，存進 KV。
//  2. 提供 GET /api/city?name=台北市 給網頁讀取。
// 金鑰（CWA_API_KEY、ANTHROPIC_API_KEY）只存在 Worker Secret，不會出現在網頁或 GitHub。

const CITIES = ['基隆市', '台北市', '新北市', '桃園市', '新竹市', '新竹縣', '苗栗縣', '台中市', '彰化縣', '南投縣', '雲林縣',
  '嘉義市', '嘉義縣', '台南市', '高雄市', '屏東縣', '宜蘭縣', '花蓮縣', '台東縣', '澎湖縣', '金門縣', '連江縣'];
const MODES = ['outfit', 'commute', 'sport', 'laundry', 'trip'];
const MODE_TEXT = {
  outfit: '穿搭', commute: '通勤', sport: '運動', laundry: '洗衣', trip: '出遊'
};
const CWA = 'https://opendata.cwa.gov.tw/api/v1/rest/datastore/';
const DATA_3DAY = 'F-D0047-089'; // 臺灣各縣市未來 3 天（逐 3 小時）
const DATA_7DAY = 'F-D0047-091'; // 臺灣各縣市未來 1 週（逐 12 小時）

/* ---------- 中央氣象署資料整理 ---------- */
const toCwa = (n) => n.replace(/台/g, '臺');
const num = (v) => {
  const x = parseFloat(v);
  return Number.isFinite(x) && x > -90 ? x : null; // CWA 用 -99、"-" 表示缺值
};

function locationsOf(json) {
  const r = json && json.records;
  const list = r && ((r.Locations && r.Locations[0] && r.Locations[0].Location) || (r.locations && r.locations[0] && r.locations[0].location));
  if (!Array.isArray(list)) throw new Error('unexpected_cwa_shape');
  return list;
}

// 把同一個縣市所有氣象因子，依開始時間合併成一列一列的時段
export function slotsOf(location) {
  const map = new Map();
  for (const el of location.WeatherElement || []) {
    for (const t of el.Time || []) {
      const start = String(t.StartTime || t.DataTime || '').slice(0, 16);
      if (!start) continue;
      const rec = map.get(start) || { start, v: {} };
      const ev = Array.isArray(t.ElementValue) ? t.ElementValue : [t.ElementValue];
      for (const o of ev) if (o && typeof o === 'object') Object.assign(rec.v, o);
      map.set(start, rec);
    }
  }
  return [...map.values()].sort((a, b) => (a.start < b.start ? -1 : 1));
}

export function buildCity(name, loc3, loc7) {
  const slots = slotsOf(loc3).map((s) => ({
    t: s.start,
    temp: num(s.v.Temperature), app: num(s.v.ApparentTemperature),
    hum: num(s.v.RelativeHumidity), pop: num(s.v.ProbabilityOfPrecipitation),
    wind: num(s.v.WindSpeed), bf: num(s.v.BeaufortScale),
    wx: s.v.Weather || null
  })).filter((s) => s.temp !== null || s.wx);

  const byDay = new Map();
  for (const s of slotsOf(loc7)) {
    const date = s.start.slice(0, 10), hour = Number(s.start.slice(11, 13));
    const d = byDay.get(date) || { date, hi: null, lo: null, pop: null, uv: null, hum: null, wx: null, wxNight: null };
    const hi = num(s.v.MaxTemperature), lo = num(s.v.MinTemperature), pop = num(s.v.ProbabilityOfPrecipitation), uv = num(s.v.UVIndex);
    if (hi !== null) d.hi = d.hi === null ? hi : Math.max(d.hi, hi);
    if (lo !== null) d.lo = d.lo === null ? lo : Math.min(d.lo, lo);
    if (pop !== null) d.pop = d.pop === null ? pop : Math.max(d.pop, pop);
    if (uv !== null) d.uv = d.uv === null ? uv : Math.max(d.uv, uv);
    const hm = num(s.v.RelativeHumidity); if (hm !== null) d.hum = hm;
    if (s.v.Weather) { if (hour >= 6 && hour < 18) d.wx = d.wx || s.v.Weather; else d.wxNight = d.wxNight || s.v.Weather; }
    byDay.set(date, d);
  }
  const days = [...byDay.values()].sort((a, b) => (a.date < b.date ? -1 : 1)).slice(0, 7)
    .map((d) => ({ date: d.date, hi: d.hi, lo: d.lo, pop: d.pop, uv: d.uv, hum: d.hum, wx: d.wx || d.wxNight }));
  return { name, slots, days };
}

async function fetchCwa(id, key) {
  const r = await fetch(CWA + id + '?Authorization=' + encodeURIComponent(key) + '&format=JSON');
  if (!r.ok) throw new Error('cwa_http_' + r.status);
  const j = await r.json();
  if (j.success === 'false' || j.success === false) throw new Error('cwa_rejected');
  return locationsOf(j);
}

/* ---------- AI ---------- */
const SYSTEM = [
  '你是台灣的生活氣象小助理，語氣親切、清楚、不誇張。',
  '只根據提供的中央氣象署預報數字給建議，不要編造數字，也不要說這是官方預報。',
  '用繁體中文。只輸出一個 JSON 物件，不要任何其他文字，格式：',
  '{"outfit":{"head":"…","tips":["…","…","…"]},"commute":{…},"sport":{…},"laundry":{…},"trip":{…}}',
  '五個分頁：穿搭（outfit）、通勤（commute）、運動（sport）、洗衣（laundry）、出遊（trip）。',
  '每個分頁 head 是一句 20 字內的總結，tips 固定三條，每條 45 字以內，具體、可立刻照做，並引用相關數字（氣溫、降雨機率、紫外線、風力、濕度）。',
  '依現在的時段調整語氣（早上、中午、傍晚），傍晚時多著重晚上與明天。'
].join('\n');

function twNow() { return new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 16); }

function aiContext(c) {
  const now = twNow();
  const next = c.slots.filter((s) => s.t >= now.slice(0, 13) + ':00').slice(0, 8);
  const cur = next[0] || c.slots[0] || {};
  const today = c.days[0] || {}, tmr = c.days[1] || {};
  return {
    city: c.name, taiwan_time: now.replace('T', ' '),
    now: { temp: cur.temp, feels: cur.app, humidity: cur.hum, rain_chance: cur.pop, weather: cur.wx, wind_level: cur.bf },
    today: { high: today.hi, low: today.lo, rain_chance: today.pop, uv: today.uv },
    next_24h: next.map((s) => ({ time: s.t.slice(11, 16), temp: s.temp, rain_chance: s.pop, weather: s.wx })),
    tomorrow: { high: tmr.hi, low: tmr.lo, rain_chance: tmr.pop, weather: tmr.wx }
  };
}

export function parseAll(text) {
  const m = String(text || '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  let j;
  try { j = JSON.parse(m[0]); } catch (e) { return null; }
  const out = {};
  for (const k of MODES) {
    const a = j && j[k];
    if (!a || typeof a.head !== 'string' || !Array.isArray(a.tips)) continue;
    const tips = a.tips.filter((t) => typeof t === 'string' && t.trim()).slice(0, 3).map((t) => t.trim().slice(0, 120));
    if (tips.length) out[k] = { head: a.head.trim().slice(0, 60), tips };
  }
  return Object.keys(out).length ? out : null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 遇到 429（太頻繁）或 5xx 時，等一下再試；總次數有上限，避免超過 Worker 的子請求數量限制
async function askClaude(env, c, budget) {
  let lastErr = 'claude_unknown';
  for (let attempt = 0; attempt < 3; attempt++) {
    if (budget.left <= 0) throw new Error('claude_budget_exhausted');
    budget.left--;
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: env.MODEL || 'claude-haiku-5-5',
        max_tokens: 3000,
        system: SYSTEM,
        messages: [{ role: 'user', content: '預報資料（JSON）：' + JSON.stringify(aiContext(c)) }]
      })
    });
    if (r.ok) {
      const d = await r.json();
      const text = (d.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
      const out = parseAll(text);
      if (!out) throw new Error('claude_bad_output');
      return out;
    }
    let detail = '';
    try { const j = await r.json(); detail = (j && j.error && (j.error.message || j.error.type)) || ''; } catch (e) {}
    lastErr = 'claude_http_' + r.status + (detail ? ':' + String(detail).slice(0, 80) : '');
    if (r.status !== 429 && r.status < 500) throw new Error(lastErr); // 金鑰錯、模型名稱錯等，重試沒有用
    const wait = Number(r.headers.get('retry-after'));
    await sleep(Math.min(20000, Number.isFinite(wait) && wait > 0 ? wait * 1000 : 3000 * (attempt + 1)));
  }
  throw new Error(lastErr);
}

/* ---------- 定時更新 ---------- */
// onlyMissing：只替還沒有 AI 建議的縣市補上，適合第一次部署後補跑
export async function refresh(env, opts) {
  const onlyMissing = !!(opts && opts.onlyMissing);
  if (!env.CWA_API_KEY) throw new Error('missing_CWA_API_KEY');
  const [l3, l7] = await Promise.all([fetchCwa(DATA_3DAY, env.CWA_API_KEY), fetchCwa(DATA_7DAY, env.CWA_API_KEY)]);
  const find = (list, n) => list.find((l) => l.LocationName === toCwa(n) || l.LocationName === n);
  const prev = (await env.WX_KV.get('snapshot', { type: 'json' })) || { cities: {} };
  const cities = {};
  for (const n of CITIES) {
    const a = find(l3, n), b = find(l7, n);
    if (!a || !b) continue;
    const c = buildCity(n, a, b);
    c.ai = prev.cities && prev.cities[n] ? prev.cities[n].ai || null : null; // AI 失敗時沿用上一次
    cities[n] = c;
  }
  if (!Object.keys(cities).length) throw new Error('no_city_matched');
  const snap = { updatedAt: new Date().toISOString(), aiUpdatedAt: prev.aiUpdatedAt || null, cities };
  await env.WX_KV.put('snapshot', JSON.stringify(snap)); // 先存天氣，AI 失敗也不影響天氣顯示

  if (!env.ANTHROPIC_API_KEY) return { weather: Object.keys(cities).length, ai: 0, errors: { missing_ANTHROPIC_API_KEY: 1 } };
  const names = Object.keys(cities).filter((n) => !(onlyMissing && cities[n].ai));
  const errors = {};
  const budget = { left: 38 }; // Worker 單次執行的子請求上限（免費方案 50）
  let ok = 0, i = 0;
  await Promise.all(Array.from({ length: 2 }, async () => {
    while (i < names.length) {
      const n = names[i++];
      try { cities[n].ai = await askClaude(env, cities[n], budget); ok++; } catch (e) {
        const k = String(e.message || e); errors[k] = (errors[k] || 0) + 1; // 沿用上一次的建議
      }
    }
  }));
  if (ok) snap.aiUpdatedAt = new Date().toISOString();
  await env.WX_KV.put('snapshot', JSON.stringify(snap));
  const withAi = Object.values(cities).filter((c) => c.ai).length;
  return { weather: Object.keys(cities).length, ai: withAi, aiRefreshed: ok, errors };
}

/* ---------- API ---------- */
const origins = (env) => String(env.ALLOWED_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
function cors(origin, env) {
  const list = origins(env);
  return {
    'Access-Control-Allow-Origin': list.includes(origin) ? origin : (list[0] || 'null'),
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Vary': 'Origin'
  };
}
const json = (body, status, h, cache) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': cache || 'no-store', ...h }
});

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';
    const h = cors(origin, env);
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });

    if (url.pathname === '/api/city' && request.method === 'GET') {
      if (origin && !origins(env).includes(origin)) return json({ error: 'forbidden_origin' }, 403, h);
      const name = url.searchParams.get('name');
      if (!CITIES.includes(name)) return json({ error: 'bad_city' }, 400, h);
      const snap = await env.WX_KV.get('snapshot', { type: 'json', cacheTtl: 60 });
      const c = snap && snap.cities && snap.cities[name];
      if (!c) return json({ error: 'no_data_yet' }, 503, h);
      return json({ updatedAt: snap.updatedAt, aiUpdatedAt: snap.aiUpdatedAt, city: c }, 200, h, 'public, max-age=300');
    }

    // 部署後手動更新一次：POST /api/refresh，帶 Authorization: Bearer <REFRESH_TOKEN>
    if (url.pathname === '/api/refresh' && request.method === 'POST') {
      if (!env.REFRESH_TOKEN || request.headers.get('Authorization') !== 'Bearer ' + env.REFRESH_TOKEN) return json({ error: 'unauthorized' }, 401, h);
      try { return json({ ok: true, ...(await refresh(env, { onlyMissing: url.searchParams.get('missing') === '1' })) }, 200, h); } catch (e) { return json({ error: String(e.message || e) }, 500, h); }
    }
    return json({ error: 'not_found' }, 404, h);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(refresh(env).catch((e) => console.log('refresh failed', e && e.message)));
  }
};

export { CITIES, MODES, MODE_TEXT };
