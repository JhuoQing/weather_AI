(function () {
  'use strict';

  /* ---------- 資料 ---------- */
  var REGIONS = ['北部', '中部', '南部', '東部', '離島'];
  var REGION_COLORS = ['#FFB3C7', '#FFE066', '#8EE6B8', '#8FD3FF', '#D2B8FF'];
  var CITIES = [
    ['基隆市', 0], ['台北市', 0], ['新北市', 0], ['桃園市', 0], ['新竹市', 0], ['新竹縣', 0],
    ['苗栗縣', 1], ['台中市', 1], ['彰化縣', 1], ['南投縣', 1], ['雲林縣', 1],
    ['嘉義市', 2], ['嘉義縣', 2], ['台南市', 2], ['高雄市', 2], ['屏東縣', 2],
    ['宜蘭縣', 3], ['花蓮縣', 3], ['台東縣', 3],
    ['澎湖縣', 4], ['金門縣', 4], ['連江縣', 4]
  ];
  var MODES = [['outfit', '穿搭'], ['commute', '通勤'], ['sport', '運動'], ['laundry', '洗衣'], ['trip', '出遊']];
  var DEFAULT_CITY = '台北市';
  var KEY_CITY = 'wx_default_city';
  var KEY_MODE = 'wx_default_mode';
  var CONFIG = window.WX_CONFIG || {};
  var state = { ci: 0, mode: 'outfit', data: null, raw: null };

  /* ---------- 小工具 ---------- */
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function store(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function load(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function val(v, unit) { return v == null ? '—' : v + (unit || ''); }
  var WD = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];

  // 取得「台灣時間」的各部分，不受使用者所在時區影響
  function twParts(date) {
    var f = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Taipei', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    var p = {};
    f.formatToParts(date).forEach(function (x) { p[x.type] = x.value; });
    var wd = WD[new Date(Number(p.year), Number(p.month) - 1, Number(p.day)).getDay()];
    return { ymd: p.year + '-' + p.month + '-' + p.day, hm: p.hour + ':' + p.minute, md: Number(p.month) + '/' + Number(p.day), wd: wd, key: p.year + '-' + p.month + '-' + p.day + 'T' + p.hour + ':' + p.minute };
  }

  /* ---------- 天氣圖示 ---------- */
  var CLOUD = 'M20 46 C12 46 8 40 10 34 C12 28 18 27 22 28 C23 20 30 16 36 18 C42 20 45 24 45 29 C52 29 56 34 54 40 C53 44 49 46 44 46 Z';
  var INK = '#2B2A33';
  function svg(inner, label) { return '<svg viewBox="3 3 58 58" role="img" aria-label="' + label + '">' + inner + '</svg>'; }
  var ICONS = {
    sun: function () {
      return svg('<g stroke="' + INK + '" stroke-width="4" stroke-linecap="round">' +
        '<line x1="50" y1="32" x2="57" y2="32"/><line x1="44.7" y1="44.7" x2="49.7" y2="49.7"/><line x1="32" y1="50" x2="32" y2="57"/>' +
        '<line x1="19.3" y1="44.7" x2="14.3" y2="49.7"/><line x1="14" y1="32" x2="7" y2="32"/><line x1="19.3" y1="19.3" x2="14.3" y2="14.3"/>' +
        '<line x1="32" y1="14" x2="32" y2="7"/><line x1="44.7" y1="19.3" x2="49.7" y2="14.3"/></g>' +
        '<circle cx="32" cy="32" r="12" fill="#FFC83D" stroke="' + INK + '" stroke-width="3"/>', '晴天');
    },
    moon: function () {
      return svg('<path d="M42 10 A22 22 0 1 0 54 44 A18 18 0 0 1 42 10 Z" fill="#FFE08A" stroke="' + INK + '" stroke-width="3" stroke-linejoin="round"/>' +
        '<circle cx="52" cy="16" r="2.5" fill="#FFC83D"/><circle cx="56" cy="28" r="1.8" fill="#FFC83D"/>', '夜晚');
    },
    partly: function () {
      return svg('<g stroke="' + INK + '" stroke-width="3.5" stroke-linecap="round">' +
        '<line x1="10" y1="22" x2="5" y2="22"/><line x1="14.1" y1="12.1" x2="10.6" y2="8.6"/><line x1="24" y1="8" x2="24" y2="3"/><line x1="33.9" y1="12.1" x2="37.4" y2="8.6"/></g>' +
        '<circle cx="24" cy="22" r="10" fill="#FFC83D" stroke="' + INK + '" stroke-width="3"/>' +
        '<g transform="translate(8 12) scale(0.86)"><path d="' + CLOUD + '" fill="#D5E5F7" stroke="' + INK + '" stroke-width="3" stroke-linejoin="round"/></g>', '多雲時晴');
    },
    cloud: function () {
      return svg('<path d="' + CLOUD + '" fill="#CFE0F4" stroke="' + INK + '" stroke-width="3" stroke-linejoin="round"/>', '多雲');
    },
    rain: function () {
      return svg('<g transform="translate(0 -8)"><path d="' + CLOUD + '" fill="#BCD3EE" stroke="' + INK + '" stroke-width="3" stroke-linejoin="round"/></g>' +
        '<g stroke="#3D9BFF" stroke-width="4" stroke-linecap="round"><line x1="22" y1="45" x2="19" y2="54"/><line x1="33" y1="45" x2="30" y2="54"/><line x1="44" y1="45" x2="41" y2="54"/></g>', '下雨');
    }
  };
  function icon(kind) { return (ICONS[kind] || ICONS.cloud)(); }

  // 依中央氣象署的「天氣現象」文字決定圖示
  function wxKind(text, isDay) {
    var t = String(text || '');
    var kind;
    if (/雨|雷|雪/.test(t)) kind = 'rain';
    else if (/^晴(天)?$/.test(t)) kind = 'sun';
    else if (/晴/.test(t)) kind = 'partly';
    else kind = 'cloud';
    if (!isDay && (kind === 'sun' || kind === 'partly')) kind = 'moon';
    return kind;
  }
  function isDayHour(hm) { var h = Number(hm.slice(0, 2)); return h >= 6 && h < 18; }

  /* ---------- 抓資料（Cloudflare Worker，內含中央氣象署資料） ---------- */
  function fetchCity(name) {
    if (!CONFIG.API_BASE) return Promise.reject(new Error('no_api'));
    return fetch(CONFIG.API_BASE.replace(/\/+$/, '') + '/api/city?name=' + encodeURIComponent(name)).then(function (r) {
      if (r.status === 503) throw new Error('no_data');
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  // 3 小時預報的各欄位開始時間不一定一致，缺的欄位用「同時間或之前最近的一筆」補
  function pick(slots, field, t) {
    var v = null, i;
    for (i = 0; i < slots.length; i++) if (slots[i].t <= t && slots[i][field] != null) v = slots[i][field];
    if (v == null) for (i = 0; i < slots.length; i++) if (slots[i][field] != null) { v = slots[i][field]; break; }
    return v;
  }

  function normalize(name, raw) {
    var city = raw.city, slots = city.slots || [], now = twParts(new Date());
    var main = slots.filter(function (s) { return s.temp != null; });
    if (!main.length) throw new Error('empty');
    var idx = 0;
    main.forEach(function (s, i) { if (s.t <= now.key) idx = i; });
    var cur = main[idx], t0 = cur.t;
    var hrs = main.slice(idx, idx + 8).map(function (s, k) {
      return {
        label: k === 0 ? '現在' : s.t.slice(11, 16),
        temp: Math.round(s.temp),
        pop: pick(slots, 'pop', s.t),
        kind: wxKind(pick(slots, 'wx', s.t), isDayHour(s.t.slice(11, 16)))
      };
    });
    var days = (city.days || []).map(function (d, i) {
      var p = d.date.split('-').map(Number);
      return {
        name: i === 0 ? '今天' : WD[new Date(p[0], p[1] - 1, p[2]).getDay()], date: p[1] + '/' + p[2],
        hi: d.hi == null ? null : Math.round(d.hi), lo: d.lo == null ? null : Math.round(d.lo),
        pop: d.pop, uv: d.uv, kind: wxKind(d.wx, true)
      };
    });
    var today = days[0] || {};
    var ci = 0; CITIES.forEach(function (c, i) { if (c[0] === name) ci = i; });
    var upd = twParts(new Date(raw.updatedAt));
    var ai = raw.aiUpdatedAt ? twParts(new Date(raw.aiUpdatedAt)) : null;
    return {
      name: name, regionName: REGIONS[CITIES[ci][1]], regionColor: REGION_COLORS[CITIES[ci][1]],
      t: Math.round(cur.temp), feels: pick(slots, 'app', t0) == null ? null : Math.round(pick(slots, 'app', t0)),
      hi: today.hi, lo: today.lo,
      pop: today.pop != null ? today.pop : pick(slots, 'pop', t0),
      hum: pick(slots, 'hum', t0), uv: today.uv, wind: pick(slots, 'bf', t0),
      kind: wxKind(pick(slots, 'wx', t0), isDayHour(t0.slice(11, 16))),
      skyText: pick(slots, 'wx', t0) || '—',
      hrs: hrs, days: days, ai: city.ai || null,
      updated: upd, aiUpdated: ai
    };
  }
  function uvText(u) { return u == null ? '' : u <= 2 ? '低量' : u <= 5 ? '中量' : u <= 7 ? '高量' : u <= 10 ? '過量' : '危險'; }

  /* ---------- 內建規則建議（AI 還沒有資料時使用） ---------- */
  function ruleAdvice(c, mode) {
    var pop = c.pop == null ? 0 : c.pop, uvv = c.uv == null ? 0 : c.uv, hum = c.hum == null ? 70 : c.hum, wind = c.wind == null ? 0 : c.wind;
    var hi = c.hi == null ? c.t : c.hi, lo = c.lo == null ? c.t : c.lo;
    var mp = Math.max.apply(null, c.hrs.map(function (h) { return h.pop == null ? 0 : h.pop; }).concat([0]));
    var rain = pop >= 60 ? '降雨機率 ' + pop + '%，出門請帶傘，鞋子選防水或好乾的。'
      : pop >= 30 ? '降雨機率 ' + pop + '%，包包放一把折傘比較安心。'
      : '降雨機率只有 ' + pop + '%，雨具可以放心留在家。';
    var uv = uvv >= 6 ? '紫外線 ' + uvv + '，偏強，白天外出擦防曬、戴帽子或撐傘。'
      : uvv >= 3 ? '紫外線 ' + uvv + '，中等，待在戶外比較久再補防曬。'
      : '紫外線 ' + uvv + '，偏弱，不用特別防曬。';
    var windT = wind >= 5 ? '風力 ' + wind + ' 級偏強，帽子和輕薄物品要抓緊。' : '風力 ' + wind + ' 級，體感不太受風影響。';
    var head, tips, o;
    if (mode === 'outfit') {
      o = c.t <= 19 ? ['今天偏涼，穿暖一點再出門', '長袖加厚外套，脖子和手也別忘了保暖。']
        : c.t <= 23 ? ['今天舒服偏涼，洋蔥式穿法最剛好', '長袖加薄外套，早晚溫差靠外套調整。']
        : c.t <= 27 ? ['今天溫暖，輕鬆穿就好', '短袖配薄襯衫剛剛好，室內冷氣房再披上。']
        : ['今天偏熱，穿透氣一點', '選透氣短袖和淺色衣服，隨身帶水瓶補水。'];
      head = o[0]; tips = [o[1], rain, uvv >= 3 ? uv : windT];
    } else if (mode === 'commute') {
      head = pop >= 50 ? '今天通勤雨具必備，路上多抓一點時間' : '通勤順順的一天，出門吧';
      tips = [rain, '接下來 24 小時最高降雨機率 ' + mp + '%，' + (mp >= 50 ? '下班時間可能也要帶傘。' : '回程不太需要擔心。'), windT];
    } else if (mode === 'sport') {
      head = pop >= 50 ? '今天改室內運動吧' : c.t >= 28 ? '天氣偏熱，避開中午再動' : '今天很適合動一動';
      tips = [pop >= 50 ? '降雨機率 ' + pop + '%，改成瑜珈、重訓或跳繩比較安全。' : '戶外運動沒問題，記得先熱身。',
        c.t >= 27 ? '氣溫 ' + c.t + '°，帶水並避開 11 到 15 點。' : c.t <= 19 ? '氣溫 ' + c.t + '°偏涼，先熱身再脫外套。' : '氣溫 ' + c.t + '°很舒服，慢跑、騎車都剛好。',
        uvv >= 6 ? uv : windT];
    } else if (mode === 'laundry') {
      var dry = pop <= 20 && hum <= 70;
      head = dry ? '超好曬的一天，衣服交給太陽' : pop >= 50 ? '今天曬衣服要小心，建議室內晾' : '可以洗，但乾得比較慢';
      tips = [rain, '濕度 ' + hum + '%，' + (hum >= 80 ? '偏潮濕，建議開除濕機或用烘衣輔助。' : '空氣乾爽，薄衣物大約半天就乾。'),
        dry ? '厚重衣物、棉被今天也適合洗，順便曬曬太陽。' : '厚重衣物和棉被，建議等晴天再洗。'];
    } else {
      head = pop >= 50 ? '今天是室內景點日' : '適合出門走走的一天';
      tips = [pop >= 50 ? '降雨 ' + pop + '%，推薦美術館、書店、咖啡廳等室內行程。' : '推薦公園、河堤或老街散步，拍照光線也不錯。',
        '氣溫 ' + c.t + '°（' + lo + ' 到 ' + hi + '°），' + (c.t <= 21 ? '帶件外套比較舒服。' : '輕便穿著就好。'),
        uvv >= 6 ? uv : windT];
    }
    return { head: head, tips: tips };
  }

  /* ---------- 畫面 ---------- */
  function setStatus(msg) {
    var s = $('status');
    if (!msg) { s.hidden = true; s.textContent = ''; return; }
    s.hidden = false; s.textContent = msg;
  }

  function renderStats(c) {
    var box = $('stats'); box.textContent = '';
    var items = [
      ['降雨', c.pop == null ? '—' : '<b>' + c.pop + '</b>%', '#CDE9FF'],
      ['濕度', c.hum == null ? '—' : '<b>' + Math.round(c.hum) + '</b>%', '#CFF5E0'],
      ['紫外線', c.uv == null ? '—' : '<b>' + c.uv + '</b> ' + uvText(c.uv), '#FFE9A8'],
      ['風力', c.wind == null ? '—' : '<b>' + c.wind + '</b> 級', '#E6DAFF']
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
      var d = el('div', 'hour' + (k === 0 ? ' now' : h.pop != null && h.pop >= 60 ? ' wet' : ''));
      d.appendChild(el('div', 't', h.label));
      var ic = el('div'); ic.innerHTML = icon(h.kind); d.appendChild(ic);
      d.appendChild(el('div', 'd', h.temp + '°'));
      d.appendChild(el('div', 'p', '雨 ' + val(h.pop, '%')));
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
      d.appendChild(el('div', 'r', val(x.hi, '°') + ' / ' + val(x.lo, '°')));
      d.appendChild(el('div', 'p', '雨 ' + val(x.pop, '%')));
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
    $('nowRange').textContent = '最高 ' + val(c.hi, '°') + '　最低 ' + val(c.lo, '°') + '　體感 ' + val(c.feels, '°');
    $('stamp').innerHTML = '預報 <b>' + c.updated.md + '</b>　' + c.updated.wd + '　' + c.updated.hm + ' 更新';
    $('aiTitle').textContent = '給 ' + c.name + ' 的專屬建議';
  }

  function renderAdvice() {
    var c = state.data; if (!c) return;
    var a = c.ai && c.ai[state.mode], src;
    if (a && a.tips && a.tips.length) {
      src = 'AI 建議，' + (c.aiUpdated ? c.aiUpdated.md + ' ' + c.aiUpdated.hm : '') + ' 更新。每天 7:00、12:00、18:00 更新，僅供生活參考。';
    } else {
      a = ruleAdvice(c, state.mode);
      src = 'AI 建議準備中，先顯示內建規則建議。每天 7:00、12:00、18:00 更新。';
    }
    document.querySelector('.note').setAttribute('data-mode', state.mode);
    $('aiHead').textContent = a.head;
    var box = $('aiTips'); box.textContent = '';
    a.tips.forEach(function (t) { box.appendChild(el('div', 'line', t)); });
    $('aiSource').textContent = src;
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
    openPanel(false); $('cityBtn').focus(); loadCity(true);
  }

  /* ---------- 主流程 ---------- */
  function loadCity(animate) {
    var city = CITIES[state.ci], idx = state.ci, body = document.body, t0 = Date.now();
    $('cityName').textContent = city[0]; $('regionName').textContent = REGIONS[city[1]];
    body.classList.remove('swap-in');
    if (animate) body.classList.add('swap-out');
    setStatus('正在讀取 ' + city[0] + ' 的天氣…');
    fetchCity(city[0]).then(function (raw) {
      if (idx !== state.ci) return;
      var data = normalize(city[0], raw);
      // 讓淡出動畫至少播完（約 0.16 秒）再換內容
      var wait = animate ? Math.max(0, 170 - (Date.now() - t0)) : 0;
      setTimeout(function () {
        if (idx !== state.ci) return;
        state.data = data;
        setStatus('');
        renderNow(data); renderStats(data); renderHours(data); renderWeek(data); renderAdvice();
        body.classList.remove('swap-out'); void body.offsetWidth; body.classList.add('swap-in');
        setTimeout(function () { if (idx === state.ci) body.classList.remove('swap-in'); }, 900);
      }, wait);
    }).catch(function (e) {
      if (idx !== state.ci) return;
      body.classList.remove('swap-out');
      var m = e && e.message;
      setStatus(m === 'no_api' ? '還沒有設定天氣服務網址（請在 config.js 填入 API_BASE）。'
        : m === 'no_data' ? '天氣資料還在準備中，請稍後再試。資料每天 7:00、12:00、18:00 更新。'
        : '天氣資料暫時讀不到，請稍後重新整理，或換一個縣市試試。');
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

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
