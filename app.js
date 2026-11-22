(function () {
  'use strict';

  /* ---------- 資料 ---------- */
  var REGIONS = ['北部', '中部', '南部', '東部', '離島'];
  var REGION_COLORS = ['#FFB3C7', '#FFE066', '#8EE6B8', '#8FD3FF', '#D2B8FF'];
  // 名稱, 區域, 緯度, 經度
  var CITIES = [
    ['基隆市', 0, 25.128, 121.740], ['台北市', 0, 25.033, 121.565], ['新北市', 0, 25.012, 121.465],
    ['桃園市', 0, 24.994, 121.301], ['新竹市', 0, 24.804, 120.971], ['新竹縣', 0, 24.839, 121.018],
    ['苗栗縣', 1, 24.560, 120.820], ['台中市', 1, 24.148, 120.674], ['彰化縣', 1, 24.075, 120.542],
    ['南投縣', 1, 23.916, 120.686], ['雲林縣', 1, 23.709, 120.431],
    ['嘉義市', 2, 23.480, 120.449], ['嘉義縣', 2, 23.459, 120.293], ['台南市', 2, 22.999, 120.227],
    ['高雄市', 2, 22.627, 120.301], ['屏東縣', 2, 22.668, 120.486],
    ['宜蘭縣', 3, 24.757, 121.753], ['花蓮縣', 3, 23.992, 121.601], ['台東縣', 3, 22.756, 121.144],
    ['澎湖縣', 4, 23.571, 119.579], ['金門縣', 4, 24.449, 118.377], ['連江縣', 4, 26.160, 119.951]
  ];
  var MODES = [['outfit', '穿搭'], ['commute', '通勤'], ['sport', '運動'], ['laundry', '洗衣'], ['trip', '出遊']];
  var DEFAULT_CITY = '台北市';
  var KEY_CITY = 'wx_default_city';
  var KEY_MODE = 'wx_default_mode';
  var CACHE_MIN = 10;

  var CONFIG = window.WX_CONFIG || {};
  var state = { ci: 0, mode: 'outfit', data: null, token: 0 };

  /* ---------- 小工具 ---------- */
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function store(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function load(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }

  /* ---------- 天氣圖示（放大版） ---------- */
  var CLOUD = 'M20 46 C12 46 8 40 10 34 C12 28 18 27 22 28 C23 20 30 16 36 18 C42 20 45 24 45 29 C52 29 56 34 54 40 C53 44 49 46 44 46 Z';
  var INK = '#2B2A33';
  function svg(inner, label) {
    return '<svg viewBox="3 3 58 58" role="img" aria-label="' + label + '">' + inner + '</svg>';
  }
  var ICONS = {
    sun: function () {
      return svg(
        '<g stroke="' + INK + '" stroke-width="4" stroke-linecap="round">' +
        '<line x1="50" y1="32" x2="57" y2="32"/><line x1="44.7" y1="44.7" x2="49.7" y2="49.7"/><line x1="32" y1="50" x2="32" y2="57"/>' +
        '<line x1="19.3" y1="44.7" x2="14.3" y2="49.7"/><line x1="14" y1="32" x2="7" y2="32"/><line x1="19.3" y1="19.3" x2="14.3" y2="14.3"/>' +
        '<line x1="32" y1="14" x2="32" y2="7"/><line x1="44.7" y1="19.3" x2="49.7" y2="14.3"/></g>' +
        '<circle cx="32" cy="32" r="12" fill="#FFC83D" stroke="' + INK + '" stroke-width="3"/>', '晴天');
    },
    moon: function () {
      return svg(
        '<path d="M42 10 A22 22 0 1 0 54 44 A18 18 0 0 1 42 10 Z" fill="#FFE08A" stroke="' + INK + '" stroke-width="3" stroke-linejoin="round"/>' +
        '<circle cx="52" cy="16" r="2.5" fill="#FFC83D"/><circle cx="56" cy="28" r="1.8" fill="#FFC83D"/>', '夜晚');
    },
    partly: function () {
      return svg(
        '<g stroke="' + INK + '" stroke-width="3.5" stroke-linecap="round">' +
        '<line x1="10" y1="22" x2="5" y2="22"/><line x1="14.1" y1="12.1" x2="10.6" y2="8.6"/><line x1="24" y1="8" x2="24" y2="3"/><line x1="33.9" y1="12.1" x2="37.4" y2="8.6"/></g>' +
        '<circle cx="24" cy="22" r="10" fill="#FFC83D" stroke="' + INK + '" stroke-width="3"/>' +
        '<g transform="translate(8 12) scale(0.86)"><path d="' + CLOUD + '" fill="#D5E5F7" stroke="' + INK + '" stroke-width="3" stroke-linejoin="round"/></g>', '多雲時晴');
    },
    cloud: function () {
      return svg('<path d="' + CLOUD + '" fill="#CFE0F4" stroke="' + INK + '" stroke-width="3" stroke-linejoin="round"/>', '多雲');
    },
    rain: function () {
      return svg(
        '<g transform="translate(0 -8)"><path d="' + CLOUD + '" fill="#BCD3EE" stroke="' + INK + '" stroke-width="3" stroke-linejoin="round"/></g>' +
        '<g stroke="#3D9BFF" stroke-width="4" stroke-linecap="round"><line x1="22" y1="45" x2="19" y2="54"/><line x1="33" y1="45" x2="30" y2="54"/><line x1="44" y1="45" x2="41" y2="54"/></g>', '下雨');
    }
  };
  function icon(kind) { return (ICONS[kind] || ICONS.cloud)(); }

  /* ---------- 天氣代碼（WMO） ---------- */
  function codeInfo(code, isDay) {
    var kind, text;
    if (code === 0) { kind = 'sun'; text = '晴朗'; }
    else if (code === 1) { kind = 'sun'; text = '大致晴朗'; }
    else if (code === 2) { kind = 'partly'; text = isDay ? '多雲時晴' : '多雲'; }
    else if (code === 3) { kind = 'cloud'; text = '陰天'; }
    else if (code === 45 || code === 48) { kind = 'cloud'; text = '有霧'; }
    else if (code >= 51 && code <= 57) { kind = 'rain'; text = '毛毛雨'; }
    else if (code >= 61 && code <= 67) { kind = 'rain'; text = '下雨'; }
    else if (code >= 80 && code <= 82) { kind = 'rain'; text = '陣雨'; }
    else if (code >= 95) { kind = 'rain'; text = '雷雨'; }
    else { kind = 'cloud'; text = '多雲'; }
    if (!isDay && (kind === 'sun' || kind === 'partly')) kind = 'moon';
    return { kind: kind, text: text };
  }
  function beaufort(ms) {
    var th = [0.3, 1.6, 3.4, 5.5, 8.0, 10.8, 13.9, 17.2, 20.8, 24.5, 28.5, 32.7], n = 0;
    for (var i = 0; i < th.length; i++) if (ms >= th[i]) n = i + 1;
    return n;
  }

  /* ---------- 抓資料 ---------- */
  function getJSON(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }
  function fetchWeather(city) {
    var key = 'wx_cache_' + city[0];
    try {
      var c = JSON.parse(sessionStorage.getItem(key) || 'null');
      if (c && Date.now() - c.at < CACHE_MIN * 60000) return Promise.resolve(c.raw);
    } catch (e) {}
    var base = 'latitude=' + city[2] + '&longitude=' + city[3] + '&timezone=Asia%2FTaipei';
    var wUrl = 'https://api.open-meteo.com/v1/forecast?' + base +
      '&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,is_day' +
      '&hourly=temperature_2m,precipitation_probability,weather_code,is_day' +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max' +
      '&wind_speed_unit=ms&forecast_days=7';
    var aUrl = 'https://air-quality-api.open-meteo.com/v1/air-quality?' + base + '&current=us_aqi';
    return Promise.all([
      getJSON(wUrl),
      getJSON(aUrl).catch(function () { return null; })
    ]).then(function (res) {
      var raw = { w: res[0], a: res[1] };
      try { sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), raw: raw })); } catch (e) {}
      return raw;
    });
  }

  function normalize(city, raw) {
    var w = raw.w, cur = w.current, h = w.hourly, d = w.daily;
    var isDay = cur.is_day === 1;
    var info = codeInfo(cur.weather_code, isDay);
    var nowHour = cur.time.slice(0, 13) + ':00';
    var start = Math.max(0, h.time.indexOf(nowHour));
    var hrs = [];
    for (var k = 0; k < 12 && start + k < h.time.length; k++) {
      var i = start + k, hi = codeInfo(h.weather_code[i], h.is_day[i] === 1);
      hrs.push({
        label: k === 0 ? '現在' : h.time[i].slice(11, 16),
        temp: Math.round(k === 0 ? cur.temperature_2m : h.temperature_2m[i]),
        pop: h.precipitation_probability[i] == null ? 0 : h.precipitation_probability[i],
        kind: hi.kind
      });
    }
    var names = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];
    var days = d.time.map(function (t, i) {
      var p = t.split('-').map(Number), dt = new Date(p[0], p[1] - 1, p[2]);
      return {
        name: i === 0 ? '今天' : names[dt.getDay()],
        date: p[1] + '/' + p[2],
        hi: Math.round(d.temperature_2m_max[i]), lo: Math.round(d.temperature_2m_min[i]),
        pop: d.precipitation_probability_max[i] == null ? 0 : d.precipitation_probability_max[i],
        kind: codeInfo(d.weather_code[i], true).kind
      };
    });
    var tp = cur.time.split('T'), ymd = tp[0].split('-').map(Number);
    var aqi = raw.a && raw.a.current && raw.a.current.us_aqi != null ? Math.round(raw.a.current.us_aqi) : null;
    var uv = d.uv_index_max[0] == null ? 0 : Math.round(d.uv_index_max[0]);
    return {
      name: city[0], regionName: REGIONS[city[1]], regionColor: REGION_COLORS[city[1]],
      t: Math.round(cur.temperature_2m), feels: Math.round(cur.apparent_temperature),
      hi: days[0].hi, lo: days[0].lo, pop: days[0].pop,
      hum: Math.round(cur.relative_humidity_2m), uv: uv, aqi: aqi,
      wind: beaufort(cur.wind_speed_10m),
      kind: info.kind, skyText: info.text, hrs: hrs, days: days,
      stamp: { md: ymd[1] + '/' + ymd[2], wd: names[new Date(ymd[0], ymd[1] - 1, ymd[2]).getDay()], hm: tp[1].slice(0, 5) }
    };
  }
  function uvText(u) { return u <= 2 ? '低量' : u <= 5 ? '中量' : u <= 7 ? '高量' : u <= 10 ? '過量' : '危險'; }
  function aqiText(a) { return a <= 50 ? '良好' : a <= 100 ? '普通' : a <= 150 ? '對敏感族群不健康' : '不健康'; }

  /* ---------- 內建規則建議（AI 未連線或失敗時使用） ---------- */
  function ruleAdvice(c, mode) {
    var mp = Math.max.apply(null, c.hrs.map(function (h) { return h.pop; }).concat([0]));
    var rain = c.pop >= 60 ? '降雨機率 ' + c.pop + '%，出門請帶傘，鞋子選防水或好乾的。'
      : c.pop >= 30 ? '降雨機率 ' + c.pop + '%，包包放一把折傘比較安心。'
      : '降雨機率只有 ' + c.pop + '%，雨具可以放心留在家。';
    var uv = c.uv >= 6 ? '紫外線 ' + c.uv + '，偏強，白天外出擦防曬、戴帽子或撐傘。'
      : c.uv >= 3 ? '紫外線 ' + c.uv + '，中等，待在戶外比較久再補防曬。'
      : '紫外線 ' + c.uv + '，偏弱，不用特別防曬。';
    var air = c.aqi == null ? '空氣品質資料暫時沒有，外出前可再看一次。'
      : '空氣品質指數 ' + c.aqi + '（' + aqiText(c.aqi) + '），' + (c.aqi <= 50 ? '開窗透氣沒問題。' : '敏感族群外出可戴口罩。');
    var wind = c.wind >= 5 ? '風力 ' + c.wind + ' 級偏強，帽子和輕薄物品要抓緊。' : '風力 ' + c.wind + ' 級，體感不太受風影響。';
    var head, tips, o;
    if (mode === 'outfit') {
      o = c.t <= 19 ? ['今天偏涼，穿暖一點再出門', '長袖加厚外套，脖子和手也別忘了保暖。']
        : c.t <= 23 ? ['今天舒服偏涼，洋蔥式穿法最剛好', '長袖加薄外套，早晚溫差靠外套調整。']
        : c.t <= 27 ? ['今天溫暖，輕鬆穿就好', '短袖配薄襯衫剛剛好，室內冷氣房再披上。']
        : ['今天偏熱，穿透氣一點', '選透氣短袖和淺色衣服，隨身帶水瓶補水。'];
      head = o[0]; tips = [o[1], rain, c.uv >= 3 ? uv : wind];
    } else if (mode === 'commute') {
      head = c.pop >= 50 ? '今天通勤雨具必備，路上多抓一點時間' : '通勤順順的一天，出門吧';
      tips = [rain, '接下來 12 小時最高降雨機率 ' + mp + '%，' + (mp >= 50 ? '下班時間可能也要帶傘。' : '回程不太需要擔心。'), c.wind >= 5 ? wind : air];
    } else if (mode === 'sport') {
      head = c.pop >= 50 ? '今天改室內運動吧' : c.t >= 28 ? '天氣偏熱，避開中午再動' : '今天很適合動一動';
      tips = [c.pop >= 50 ? '降雨機率 ' + c.pop + '%，改成瑜珈、重訓或跳繩比較安全。' : '戶外運動沒問題，記得先熱身。',
        c.t >= 27 ? '氣溫 ' + c.t + '°，帶水並避開 11 到 15 點。' : c.t <= 19 ? '氣溫 ' + c.t + '°偏涼，先熱身再脫外套。' : '氣溫 ' + c.t + '°很舒服，慢跑、騎車都剛好。',
        c.uv >= 6 ? uv : air];
    } else if (mode === 'laundry') {
      var dry = c.pop <= 20 && c.hum <= 70;
      head = dry ? '超好曬的一天，衣服交給太陽' : c.pop >= 50 ? '今天曬衣服要小心，建議室內晾' : '可以洗，但乾得比較慢';
      tips = [rain, '濕度 ' + c.hum + '%，' + (c.hum >= 80 ? '偏潮濕，建議開除濕機或用烘衣輔助。' : '空氣乾爽，薄衣物大約半天就乾。'),
        dry ? '厚重衣物、棉被今天也適合洗，順便曬曬太陽。' : '厚重衣物和棉被，建議等晴天再洗。'];
    } else {
      head = c.pop >= 50 ? '今天是室內景點日' : '適合出門走走的一天';
      tips = [c.pop >= 50 ? '降雨 ' + c.pop + '%，推薦美術館、書店、咖啡廳等室內行程。' : '推薦公園、河堤或老街散步，拍照光線也不錯。',
        '氣溫 ' + c.t + '°（' + c.lo + ' 到 ' + c.hi + '°），' + (c.t <= 21 ? '帶件外套比較舒服。' : '輕便穿著就好。'),
        c.uv >= 6 ? uv : air];
    }
    return { head: head, tips: tips };
  }

  /* ---------- AI（透過 Cloudflare Worker） ---------- */
  function aiAdvice(c, mode) {
    if (!CONFIG.AI_ENDPOINT) return Promise.resolve(null);
    var now = new Date(), key = 'wx_ai_' + c.name + '_' + mode + '_' + now.toDateString() + '_' + now.getHours();
    try {
      var hit = JSON.parse(sessionStorage.getItem(key) || 'null');
      if (hit) return Promise.resolve(hit);
    } catch (e) {}
    var ctl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, 15000);
    var body = {
      city: c.name, mode: mode,
      weather: {
        temp: c.t, feels: c.feels, hi: c.hi, lo: c.lo, pop: c.pop, humidity: c.hum, uv: c.uv, aqi: c.aqi, wind: c.wind,
        sky: c.skyText,
        hours: c.hrs.slice(0, 12).map(function (h) { return { t: h.label, temp: h.temp, pop: h.pop }; })
      }
    };
    return fetch(CONFIG.AI_ENDPOINT, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      signal: ctl ? ctl.signal : undefined
    }).then(function (r) {
      clearTimeout(timer);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (j) {
      if (!j || typeof j.head !== 'string' || !Array.isArray(j.tips)) throw new Error('bad shape');
      var out = { head: j.head, tips: j.tips.filter(function (t) { return typeof t === 'string'; }).slice(0, 3) };
      try { sessionStorage.setItem(key, JSON.stringify(out)); } catch (e) {}
      return out;
    });
  }

  /* ---------- 畫面 ---------- */
  function setStatus(msg) {
    var s = $('status');
    if (!msg) { s.hidden = true; s.textContent = ''; return; }
    s.hidden = false; s.textContent = msg;
  }

  function renderStats(c) {
    var box = $('stats');
    box.textContent = '';
    var items = [
      ['降雨', '<b>' + c.pop + '</b>%', '#CDE9FF'],
      ['濕度', '<b>' + c.hum + '</b>%', '#CFF5E0'],
      ['紫外線', '<b>' + c.uv + '</b> ' + uvText(c.uv), '#FFE9A8'],
      ['空氣', c.aqi == null ? '—' : '<b>' + c.aqi + '</b> ' + aqiText(c.aqi), '#E6DAFF']
    ];
    items.forEach(function (it) {
      var s = el('div', 'stat'); s.style.background = it[2];
      s.appendChild(el('div', 'k', it[0]));
      var v = el('div', 'v'); v.innerHTML = it[1]; s.appendChild(v);
      box.appendChild(s);
    });
  }

  function renderHours(c) {
    var box = $('hours'); box.textContent = '';
    c.hrs.forEach(function (h, k) {
      var d = el('div', 'hour' + (k === 0 ? ' now' : h.pop >= 60 ? ' wet' : ''));
      d.appendChild(el('div', 't', h.label));
      var ic = el('div'); ic.innerHTML = icon(h.kind); d.appendChild(ic);
      d.appendChild(el('div', 'd', h.temp + '°'));
      d.appendChild(el('div', 'p', '雨 ' + h.pop + '%'));
      box.appendChild(d);
    });
  }

  function renderWeek(c) {
    var box = $('week'); box.textContent = '';
    var pa = ['#FFE9A8', '#CDE9FF', '#CFF5E0', '#E6DAFF', '#FFD3E3'];
    c.days.forEach(function (x, i) {
      var d = el('div', 'day'); d.style.background = pa[i % 5];
      d.appendChild(el('div', 'n', x.name));
      d.appendChild(el('div', 'dt', x.date));
      var ic = el('div'); ic.innerHTML = icon(x.kind); d.appendChild(ic);
      d.appendChild(el('div', 'r', x.hi + '° / ' + x.lo + '°'));
      d.appendChild(el('div', 'p', '雨 ' + x.pop + '%'));
      box.appendChild(d);
    });
  }

  function renderNow(c) {
    $('cityName').textContent = c.name;
    $('regionName').textContent = c.regionName;
    $('nowTitle').textContent = c.name;
    var tag = $('nowRegion'); tag.textContent = c.regionName; tag.style.background = c.regionColor;
    $('nowIcon').innerHTML = icon(c.kind);
    $('nowTemp').textContent = c.t + '°';
    $('nowSky').textContent = c.skyText;
    $('nowRange').textContent = '最高 ' + c.hi + '°　最低 ' + c.lo + '°　體感 ' + c.feels + '°';
    var s = c.stamp;
    $('stamp').innerHTML = '<b>' + s.md + '</b>　' + s.wd + '　' + s.hm + ' 更新';
    $('aiTitle').textContent = '給 ' + c.name + ' 的專屬建議';
  }

  function paintAdvice(a, source, loading) {
    $('aiHead').textContent = a.head;
    var box = $('aiTips'); box.textContent = '';
    a.tips.forEach(function (t) { box.appendChild(el('div', 'line', t)); });
    $('aiSource').textContent = source;
    document.querySelector('.note').classList.toggle('loading', !!loading);
  }

  function renderAdvice() {
    var c = state.data; if (!c) return;
    var token = ++state.token, mode = state.mode;
    var rule = ruleAdvice(c, mode);
    if (!CONFIG.AI_ENDPOINT) {
      paintAdvice(rule, '目前使用內建規則建議（AI 尚未連線）。', false);
      return;
    }
    paintAdvice(rule, 'AI 正在依即時天氣整理…', true);
    aiAdvice(c, mode).then(function (a) {
      if (token !== state.token) return;
      if (a && a.tips.length) paintAdvice(a, '由 AI 依即時天氣產生，僅供生活參考。', false);
      else paintAdvice(rule, '目前使用內建規則建議。', false);
    }).catch(function () {
      if (token !== state.token) return;
      paintAdvice(rule, 'AI 暫時沒有回應，先顯示內建規則建議。', false);
    });
  }

  function renderTabs() {
    var box = $('tabs'); box.textContent = '';
    MODES.forEach(function (m) {
      var b = el('button', 'tab', m[1]); b.type = 'button';
      b.setAttribute('aria-pressed', state.mode === m[0] ? 'true' : 'false');
      b.addEventListener('click', function () {
        state.mode = m[0]; store(KEY_MODE, m[0]); renderTabs(); renderAdvice();
      });
      box.appendChild(b);
    });
  }

  /* ---------- 縣市下拉 ---------- */
  function buildPanel() {
    var panel = $('cityPanel'); panel.textContent = '';
    REGIONS.forEach(function (rn, r) {
      var g = el('div');
      var t = el('div', 'group-title');
      var sw = el('span', 'swatch'); sw.style.background = REGION_COLORS[r];
      t.appendChild(sw); t.appendChild(document.createTextNode(rn)); g.appendChild(t);
      var items = el('div', 'group-items');
      CITIES.forEach(function (c, i) {
        if (c[1] !== r) return;
        var b = el('button', 'city-opt', c[0]); b.type = 'button';
        b.setAttribute('aria-pressed', i === state.ci ? 'true' : 'false');
        b.addEventListener('click', function () { choose(i); });
        items.appendChild(b);
      });
      g.appendChild(items); panel.appendChild(g);
    });
  }
  function openPanel(open) {
    var panel = $('cityPanel'), btn = $('cityBtn');
    panel.hidden = !open; btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) { buildPanel(); var cur = panel.querySelector('[aria-pressed="true"]'); if (cur) cur.focus(); }
  }
  function choose(i) {
    state.ci = i; store(KEY_CITY, CITIES[i][0]);
    openPanel(false); $('cityBtn').focus(); loadCity();
  }

  /* ---------- 主流程 ---------- */
  function loadCity() {
    var city = CITIES[state.ci];
    $('cityName').textContent = city[0]; $('regionName').textContent = REGIONS[city[1]];
    setStatus('正在抓 ' + city[0] + ' 的天氣…');
    var idx = state.ci;
    fetchWeather(city).then(function (raw) {
      if (idx !== state.ci) return;
      state.data = normalize(city, raw);
      setStatus('');
      renderNow(state.data); renderStats(state.data); renderHours(state.data); renderWeek(state.data);
      renderAdvice();
    }).catch(function () {
      if (idx !== state.ci) return;
      setStatus('天氣資料暫時抓不到，請稍後重新整理，或換一個縣市試試。');
    });
  }

  function init() {
    var saved = load(KEY_CITY), found = -1;
    CITIES.forEach(function (c, i) { if (c[0] === saved) found = i; });
    if (found < 0) CITIES.forEach(function (c, i) { if (c[0] === DEFAULT_CITY) found = i; });
    state.ci = found;
    var m = load(KEY_MODE);
    if (MODES.some(function (x) { return x[0] === m; })) state.mode = m;

    $('cityBtn').addEventListener('click', function () { openPanel($('cityPanel').hidden); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !$('cityPanel').hidden) { openPanel(false); $('cityBtn').focus(); }
    });
    document.addEventListener('click', function (e) {
      var p = $('cityPanel');
      if (!p.hidden && !p.contains(e.target) && !$('cityBtn').contains(e.target)) openPanel(false);
    });
    renderTabs();
    loadCity();
  }

  window.WX = { codeInfo: codeInfo, beaufort: beaufort, ruleAdvice: ruleAdvice, normalize: normalize, CITIES: CITIES };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
