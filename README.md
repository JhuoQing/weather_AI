# 今日天氣手帳

選縣市、看天氣，並有 AI 依即時天氣整理「穿搭、通勤、運動、洗衣、出遊」建議的小網頁。

- 網頁：純 HTML / CSS / JS，放在 GitHub Pages。
- 天氣資料：[Open-Meteo](https://open-meteo.com/)（免金鑰）。
- AI：網頁呼叫 Cloudflare Worker，由 Worker 帶著金鑰呼叫 Claude。**金鑰只存在 Worker，不會出現在網頁或這個倉庫。**
- 縣市會記在瀏覽器裡，下次打開自動帶入。

```
index.html / styles.css / app.js   網頁
config.js                          只放 Worker 網址（公開檔案，不放金鑰）
worker/                            Cloudflare Worker（AI 轉接）
```

## 1. 啟用 GitHub Pages

倉庫 Settings → Pages → Source 選 `Deploy from a branch`，Branch 選 `main` / `(root)`，儲存。
網址會是 `https://jhuoqing.github.io/weather_AI/`。

這時網頁已經可以用，AI 建議會先用內建規則產生。

## 2. 部署 Cloudflare Worker（讓 AI 上線）

需要：Cloudflare 帳號（免費方案即可）、Node.js、一把 Anthropic API 金鑰。

```bash
cd worker
npx wrangler login
npx wrangler deploy
npx wrangler secret put ANTHROPIC_API_KEY    # 貼上你的金鑰，Enter
```

部署完會看到網址，例如 `https://weather-ai.<你的帳號>.workers.dev`。

## 3. 把 Worker 網址填回網頁

編輯 `config.js`：

```js
AI_ENDPOINT: 'https://weather-ai.<你的帳號>.workers.dev/api/advice'
```

commit 並推送，約一分鐘後重新整理網頁，建議區下方會顯示「由 AI 依即時天氣產生」。

## 設定

`worker/wrangler.toml`

| 變數 | 說明 |
|---|---|
| `ALLOWED_ORIGIN` | 允許呼叫的網頁來源（只寫網域），預設 `https://jhuoqing.github.io` 與本機 `http://localhost:8000`。你的 Pages 網域不同就改這裡。 |
| `MODEL` | 使用的模型，預設 `claude-haiku-5-5`。 |

## 費用與安全

- 每次按「穿搭／通勤…」都可能呼叫一次 AI。網頁會把同縣市、同分頁、同一小時的結果存在瀏覽器，減少重複呼叫。
- 來源檢查只擋瀏覽器端的亂用，擋不了刻意偽造請求的人。想防止被刷，請在 Cloudflare 後台替這個 Worker 加一條 Rate Limiting 規則，並到 Anthropic 後台設定用量上限。
- Worker 只接受 22 個縣市與 5 種分頁，並重新整理天氣數字後才送給模型，不會轉送任意文字。

## 本機預覽

```bash
python3 -m http.server 8000
# 打開 http://localhost:8000
```

## 注意

AI 建議是生活參考，不是官方預報。出門前請以中央氣象署的預報與警特報為準。
