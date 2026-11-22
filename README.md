# 今日天氣手帳

選縣市，看天氣，附 AI 穿搭、通勤、運動、洗衣、出遊建議的小網頁。

- 天氣資料：交通部中央氣象署開放資料
- AI 建議：每天 7:00、12:00、18:00 更新
- 縣市選擇會記在瀏覽器，下次自動帶入

```
index.html  styles.css  app.js   網頁（GitHub Pages）
config.js                        Worker 網址
worker/                          Cloudflare Worker（抓資料、產生 AI 建議）
```

本機預覽：`python3 -m http.server 8000`

天氣與 AI 建議僅供生活參考，請以中央氣象署公布的預報與警特報為準。
