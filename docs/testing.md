---
type: Playbook
title: 測試指南 (Testing Guide)
description: 依目的選擇自動化、手動端對端與 MCP 撰寫驗證，並清楚區分本機與 production。
tags: [testing, sop, mcp]
timestamp: 2026-08-24T00:00:00Z
---

# 測試指南 (Testing Guide)

先決定你要驗證什麼：**(A) 自動化測試**快速驗證程式與整條本機堆疊；**(B) 手動端對端**讓你親眼確認
「上傳來源 → Claude 經 MCP 寫 wiki → Web 顯示結果」。兩者都只測**本機**環境；production 網站目前
沒有 MCP，因此不能用它驗證 Claude 撰寫流程。

## 前置：本機 Supabase

整套測試打的是本機 Supabase 堆疊（Postgres + Auth + Storage + PGroonga）。

```bash
cd ~/wk_projects/team-kms
supabase status          # 沒開就 supabase start
```

`.env`（repo 根目錄）供 API/MCP/Converter 使用；`apps/web/.env.local` 供 Next.js 使用。若重建環境，
從 `supabase status -o env` 取本機 URL／keys 回填。這不會改動 hosted Supabase；環境邊界見
[環境變數配置](/docs/env-configuration.md)。

---

## (A) 自動化測試（83 個整合測試）

全部跑在真實 Supabase / LibreOffice / opendataloader / MCP 協定上，會自動建測試使用者、上傳、驅動工具再清掉。

```bash
pnpm -r test                                          # 全部
pnpm --filter @team-kms/shared    exec vitest run     # 42：VaultFS/RLS/auth/chunker/references/s3
pnpm --filter @team-kms/converter exec vitest run     # 18：PDF + 真實 docx(LibreOffice) 抽取
pnpm --filter @team-kms/api       exec vitest run     # 11：ingest/TUS/async jobs/api_keys/WS relay
pnpm --filter @team-kms/mcp       exec vitest run     # 12：10 個 MCP 工具(真實協定) + JWT handshake
```

其他檢查：

```bash
pnpm -r typecheck       # 型別
pnpm lint               # ESLint
pnpm -r build           # 全 build（含 next build）— docker-compose 用的就是這條
```

> Office live 測試需要 host 裝 LibreOffice（`soffice` on PATH）；沒裝會自動 skip。

---

## (B) 手動端到端

### 1. 起服務（一鍵）

```bash
supabase start          # DB（若未開）
pnpm dev                # 同時啟動四個服務，各自自動讀取正確的 env 檔
```

| 服務 | 本機位址 | 這一步在驗證什麼 |
|---|---|---|
| Web | http://localhost:3010 | 登入、KB／wiki 瀏覽、上傳與圖譜 |
| API | http://localhost:8010 | Web 的 REST／WebSocket 資料路徑 |
| MCP | http://localhost:8011/mcp | Claude/Codex 的來源讀取與 wiki 撰寫 |
| Converter | http://localhost:8012 | PDF／Office 解析 |

production 另依[部署指南](/docs/deployment.md)運作，並非以 `docker compose up` 作為目前正式入口。

### 2. 建一個使用者並拿 token

token 約 **1 小時** 有效，過期重跑這段。

```bash
set -a; . ./.env; set +a
EMAIL="demo@test.local"; PW="demo1234"
# 建立（已存在會回錯，可忽略）
curl -s -X POST "$SUPABASE_URL/auth/v1/admin/users" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PW\",\"email_confirm\":true}" >/dev/null
# 拿 access token
TOKEN=$(curl -s -X POST "$SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PW\"}" \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")
echo "$TOKEN"
```

> Supabase Studio：http://127.0.0.1:55323 （可直接看 DB / 使用者）。

### 3. 上傳來源檔

**方式一：Web UI** — 開 http://localhost:3010 ，用 `demo@test.local` / `demo1234` 登入 →
進一個 KB → 左側 **📎 Upload sources**（可 Cmd/Shift 多選）。PDF/Office 需 converter 在跑；.md/.txt 直接索引。

**方式二：API（curl）**

```bash
SLUG=$(curl -s -X POST localhost:8010/v1/knowledge-bases -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"name":"Demo"}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['slug'])")
printf 'Attention scales quadratically in sequence length. Flash attention reduces memory cost.' > /tmp/notes.md
curl -s -X POST "localhost:8010/v1/knowledge-bases/$SLUG/upload" \
  -H "Authorization: Bearer $TOKEN" -F "file=@/tmp/notes.md"
# 確認
curl -s "localhost:8010/v1/knowledge-bases/$SLUG/documents" -H "Authorization: Bearer $TOKEN"
```

### 4. 接上 MCP，讓 Claude 寫 wiki

MCP client 使用的 token 決定「哪一個帳號的資料可讀寫」；`.env` 決定 MCP server 連的是哪一個
Supabase。兩者須先確認，否則最常見的症狀是連線正常卻看不到預期 KB。

先用 curl 確認 MCP 通（可選）：

```bash
H=(-H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream")
curl -s -X POST localhost:8011/mcp "${H[@]}" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'   # 應列出 10 個工具
```

接 **Claude Code**（指令自動寫進 `~/.claude.json`，不用手動編輯）：

```bash
claude mcp add team-kms --transport http http://localhost:8011/mcp \
  --header "Authorization: Bearer $TOKEN"
claude mcp list          # 應看到 team-kms ✓ connected
```

接 **Codex CLI** 時，先把 key 放在 shell 環境變數，再啟動 Codex：

```bash
export TEAM_KMS_API_KEY="$TOKEN"
codex mcp add team-kms --url http://localhost:8011/mcp \
  --bearer-token-env-var TEAM_KMS_API_KEY
codex mcp list
```

已存在同名 server 時，先 `codex mcp remove team-kms` 再新增。Codex Desktop／IDE 必須重啟，才會讀取
新的 MCP 設定。[1]

寫進去的設定長這樣（要手改也行；加 `-s user` 可跨專案共用）：

```json
"mcpServers": {
  "team-kms": {
    "type": "http",
    "url": "http://localhost:8011/mcp",
    "headers": { "Authorization": "Bearer <TOKEN>" }
  }
}
```

然後在 Claude Code session 裡說：

> 用 team-kms 的 `guide` 看一下；讀 Demo 的來源，幫我在 `/wiki/concepts/` 寫一頁 attention 的 wiki 並引用來源。

Claude 會呼叫 `search` / `read` / `create`，wiki 頁寫進 DB，引用 / wikilink 自動進 reference graph。

> **Claude Desktop**（非 Claude Code）對 remote HTTP MCP 支援差，需透過 `mcp-remote` 代理，且要完全重啟 App；建議用 Claude Code。

### 5. Web 看結果

http://localhost:3010 用 **同一個** `demo@test.local` 登入（RLS 隔離，帳號要一致）→
點該 KB → 看到 Claude 寫的 wiki 頁（markdown + mermaid 圖）→ 點 **📊 graph** 看引用關係圖。

---

## 疑難排解

| 症狀 | 原因 / 解法 |
|---|---|
| web `TypeError: Failed to fetch` / CORS | api 未在跑，或 `APP_URL` 不符。CORS 已內建允許 `localhost:3010`；確認 `pnpm dev` 的 api 有起來 |
| MCP / API 回 `401` | token 過期（~1h）。重跑步驟 2，`claude mcp remove team-kms` 再 add（或改 `~/.claude.json` 的 Bearer） |
| PDF/Office 上傳失敗 | converter 沒跑，或 host 沒裝 LibreOffice（Office 才需要）。`pnpm dev` 會起 converter |
| KB 清單空的 | 先確認登入帳號、MCP token 與 `.env` 的 Supabase 環境是否一致。RLS 下新帳號只看得到自己的 KB；本機與 hosted 也不會自動同步 |
| port 被占用 | Team KMS 預設使用 Web `3010`、API `8010`、MCP `8011`、Converter `8012`。先找出佔用該 port 的程序，不要直接關閉不屬於本專案的服務 |
| 自動化測試全 skip | 沒連到 DB — 確認 `supabase start` 且 `.env` 的 `DATABASE_URL` 正確 |

## 與其他本機專案並行

Team KMS 已保留 Web `3010`、API `8010`、MCP `8011`、Converter `8012`，local Supabase 使用
`55320–55329`。這能避開常見的 `3000`／`8000`／`5432x` 預設值；若仍衝突，先在本機環境設定中調整
整個 Team KMS 區段，並同步更新 Web、API、MCP 與 Supabase URL。

# Citations

[1] [OpenAI Codex MCP documentation](https://developers.openai.com/codex/mcp/) — Codex 支援 Streamable HTTP MCP、bearer token 環境變數與重啟後載入設定。
