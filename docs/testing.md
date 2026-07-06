---
type: Playbook
title: 測試指南 (Testing Guide)
description: 自動化測試套件、手動端對端、連接 Claude over MCP 與疑難排解。
tags: [testing, sop, mcp]
timestamp: 2026-06-30T00:00:00Z
---

# 測試指南 (Testing Guide)

兩種測法：**(A) 自動化測試套件**（最快證明整套能跑），**(B) 手動端到端**（親眼看 Claude 經 MCP 寫 wiki）。

## 前置：本機 Supabase

整套測試打的是本機 Supabase 堆疊（Postgres + Auth + Storage + PGroonga）。

```bash
cd ~/wk_projects/team-kms
supabase status          # 沒開就 supabase start
```

`.env`（repo 根目錄）已含本機 Supabase 的金鑰；`apps/web/.env.local` 含前端用的 `NEXT_PUBLIC_*`。
若重建環境，從 `supabase status -o env` 取金鑰回填。

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
pnpm dev                # 同時起 converter:8002 · api:8000 · mcp:8001 · web:3000，各自自動載 .env
```

正式環境則是 `docker compose up`。

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

> Supabase Studio：http://127.0.0.1:54323 （可直接看 DB / 使用者）。

### 3. 上傳來源檔

**方式一：Web UI** — 開 http://localhost:3000 ，用 `demo@test.local` / `demo1234` 登入 →
進一個 KB → 左側 **📎 Upload sources**（可 Cmd/Shift 多選）。PDF/Office 需 converter 在跑；.md/.txt 直接索引。

**方式二：API（curl）**

```bash
SLUG=$(curl -s -X POST localhost:8000/v1/knowledge-bases -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"name":"Demo"}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['slug'])")
printf 'Attention scales quadratically in sequence length. Flash attention reduces memory cost.' > /tmp/notes.md
curl -s -X POST "localhost:8000/v1/knowledge-bases/$SLUG/upload" \
  -H "Authorization: Bearer $TOKEN" -F "file=@/tmp/notes.md"
# 確認
curl -s "localhost:8000/v1/knowledge-bases/$SLUG/documents" -H "Authorization: Bearer $TOKEN"
```

### 4. 接上 MCP，讓 Claude 寫 wiki

先用 curl 確認 MCP 通（可選）：

```bash
H=(-H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream")
curl -s -X POST localhost:8001/mcp "${H[@]}" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'   # 應列出 10 個工具
```

接 **Claude Code**（指令自動寫進 `~/.claude.json`，不用手動編輯）：

```bash
claude mcp add team-kms --transport http http://localhost:8001/mcp \
  --header "Authorization: Bearer $TOKEN"
claude mcp list          # 應看到 team-kms ✓ connected
```

寫進去的設定長這樣（要手改也行；加 `-s user` 可跨專案共用）：

```json
"mcpServers": {
  "team-kms": {
    "type": "http",
    "url": "http://localhost:8001/mcp",
    "headers": { "Authorization": "Bearer <TOKEN>" }
  }
}
```

然後在 Claude Code session 裡說：

> 用 team-kms 的 `guide` 看一下；讀 Demo 的來源，幫我在 `/wiki/concepts/` 寫一頁 attention 的 wiki 並引用來源。

Claude 會呼叫 `search` / `read` / `create`，wiki 頁寫進 DB，引用 / wikilink 自動進 reference graph。

> **Claude Desktop**（非 Claude Code）對 remote HTTP MCP 支援差，需透過 `mcp-remote` 代理，且要完全重啟 App；建議用 Claude Code。

### 5. Web 看結果

http://localhost:3000 用 **同一個** `demo@test.local` 登入（RLS 隔離，帳號要一致）→
點該 KB → 看到 Claude 寫的 wiki 頁（markdown + mermaid 圖）→ 點 **📊 graph** 看引用關係圖。

---

## 疑難排解

| 症狀 | 原因 / 解法 |
|---|---|
| web `TypeError: Failed to fetch` / CORS | api 未在跑，或 `APP_URL` 不符。CORS 已內建允許 `localhost:3000`；確認 `pnpm dev` 的 api 有起來 |
| MCP / API 回 `401` | token 過期（~1h）。重跑步驟 2，`claude mcp remove team-kms` 再 add（或改 `~/.claude.json` 的 Bearer） |
| PDF/Office 上傳失敗 | converter 沒跑，或 host 沒裝 LibreOffice（Office 才需要）。`pnpm dev` 會起 converter |
| KB 清單空的 | 正常 — RLS 下新帳號只看得到自己的 KB。上傳或讓 Claude 建即可 |
| port 8000/8001 被占用 | 先 `lsof -ti:8000 | xargs kill`（8001 同理）再 `pnpm dev` |
| 自動化測試全 skip | 沒連到 DB — 確認 `supabase start` 且 `.env` 的 `DATABASE_URL` 正確 |

## 與原版 lucasastorian/llmwiki 並排跑(port remap)

原版佔 web `:3000` / api `:8000`。要同時跑我們的做視覺對照,用 env 覆蓋我們這邊的 port(不改碼):

```bash
# 我們的 api 改 8010、web 改 3010,並讓 web 指向新的 api port
API_PORT=8010 APP_URL=http://localhost:3010 pnpm --filter @team-kms/api dev
NEXT_PUBLIC_API_URL=http://localhost:8010 pnpm --filter @team-kms/web dev -- -p 3010
```

mcp(8001)/converter(8002)一般不與原版衝突。**在自己的終端機跑,收工時 `Ctrl-C` 收乾淨**
(避免孤兒 process 佔 port)。
