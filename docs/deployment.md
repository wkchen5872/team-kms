---
type: Playbook
title: Cloud Run Deployment
description: Deploy and operate the production Web/API/Converter stack with hosted Supabase; production MCP is intentionally not deployed.
tags: [deployment, cloud-run, gcp, supabase, ops]
timestamp: 2026-08-24T00:00:00Z
---

# Cloud Run 部署

這份文件處理的是 **production Web/API/Converter**，資料、認證與儲存由 **hosted Supabase**
提供。`apps/mcp` 不在這條部署流程中；production 目前提供的是 wiki 瀏覽入口，不是遠端 Claude
撰寫端點。env 檔責任見[環境變數配置](/docs/env-configuration.md)。

## 先理解：部署、schema 與內容是三件不同的事

| 工作 | 作用 | 會不會自動影響其他工作 |
|---|---|---|
| Cloud Run 部署 | 更新 Web/API/Converter 程式映像 | 不會搬移資料或 schema |
| `supabase db push` | 將版本庫 migrations 套用到 hosted schema | 不會搬移 wiki、來源檔或 Auth 使用者 |
| 內容／Storage 搬遷 | 明確複製既有資料與來源檔 | 不是持續同步，不能當成日常部署步驟 |

**目前狀態（2026-08-24）**：本機資料已經作過一次性複製到 hosted Supabase，production Web
可供他人瀏覽 wiki；production MCP 尚未部署。日後若要讓 Claude 直接編輯 production 資料，需另行
設計、部署與保護 MCP，不能把本機 MCP URL 當作 production 服務。

## 拓樸

```
team browser ──► web (Cloud Run) ──► api (Cloud Run) ──► hosted Supabase
                                          └──► converter (Cloud Run, ingress all + secret)

local Claude/Codex ──► local MCP（未部署到 production）
```

## 前置

- GCP 專案 + billing;啟用 `run` / `artifactregistry` API。
- **GCP 認證(專案級,不污染全域)**:`export CLOUDSDK_CONFIG="$PWD/.gcloud"` →
  `gcloud auth login` → `gcloud config set project <id>`。`deploy-cloudrun.sh`
  會自動用這份隔離登入。
- `.env`(A 憑證 + B-local)、`.env.cloud`(B-cloud,指向 hosted)填妥 —— 見
  env-configuration 的 readiness 標記。
- Docker Desktop(`buildx`,build amd64 image)。

## 一次性資料搬遷（已完成；不要當成日常部署）

| 步驟 | 腳本 | 說明 |
|---|---|---|
| Supabase 建置 | `scripts/supabase-push.sh` | link 正確專案(釘死 ref)→ 啟用 pgroonga → `db push` |
| 內容搬遷 | `scripts/migrate-content.sh` | `pg_dump` 6 張表 → restore,remap 單一 owner → 共用帳號 UUID |
| 原始檔搬遷 | `scripts/migrate-storage.sh` | 複製 owner 的 Storage 物件,前綴改成新 UUID |

三支腳本都**釘死目標專案**、寫入前先驗證，並支援 `--dry-run`。其中
`migrate-content.sh` 會先清空目標的內容表再還原，因此只應在明確核准的資料搬遷計畫中執行；不要因為
「本機少了一頁」或「production 少了一頁」就直接重跑。

資料搬遷後，本機與 hosted Supabase 不會持續同步。`supabase link` 只是讓 CLI 知道 remote 專案，
`db pull`／`db push` 只處理 schema migration；這是 Supabase CLI 的既定語義。[1]

## 部署程式

```bash
scripts/deploy-cloudrun.sh setup       # Artifact Registry + docker auth
scripts/deploy-cloudrun.sh converter   # build+push amd64 → deploy（ingress all + secret）
scripts/deploy-cloudrun.sh api         # deploy（session-affinity；注入 CONVERTER_URL + APP_URL）
scripts/deploy-cloudrun.sh web         # build 帶 NEXT_PUBLIC build-arg → deploy
scripts/deploy-cloudrun.sh all         # 一次跑完
scripts/deploy-cloudrun.sh urls        # 印出服務網址
```

順序固定 converter → api → web。runtime env 只從 `.env.cloud` 的 **15-key 白名單**
注入(`--env-vars-file`),不會誤送憑證或 `NEXT_PUBLIC_*`。deploy-output
(`CONVERTER_URL` / `APP_URL` / web 的 `NEXT_PUBLIC_API_URL`)由腳本自動回填。

> **CORS**：`APP_URL` 是 web 的 Cloud Run URL（deploy-output），api 靠它放行瀏覽器
> 來源。分享給團隊時用**確定性網址** `https://<service>-<projectnumber>.<region>.run.app`
> ——那才是 `APP_URL` 允許的 origin(Cloud Run 另有 `-xxxxx-an.a.run.app` 舊格式,
> CORS 不放行)。

## 部署後確認

```bash
scripts/deploy-cloudrun.sh urls
```

依輸出的 Web URL 開啟網站，確認登入後可以讀取既有 wiki。若是程式更新，確認 Web → API →
hosted Supabase 的讀取路徑即可；若是 schema 更新，再檢查 migration status。不要將「網站能顯示」誤判成
MCP 已經可用，因為 production MCP 目前不存在。

## 正式部署會踩、這次已解的雷

| 雷 | 解法 |
|---|---|
| 根 Dockerfile 沒 `CMD` | Cloud Run `--command` 指定進入點 |
| Mac arm64 ≠ Cloud Run amd64 | `buildx --platform linux/amd64` |
| 缺 `.dockerignore` → 複製 host `node_modules`(pnpm no-TTY abort)＋ 密鑰烤進 image | `.dockerignore` 排除 `node_modules` + `.env`/`.gcloud` |
| `@team-kms/shared` exports 指 `src` → 正式 node `ERR_MODULE_NOT_FOUND` | conditional exports:`development`→src、`default`→dist |
| api image 連 web 一起 build | 每服務 `BUILD_FILTER` build-arg |
| `.env.cloud` 值帶引號/行尾註解 → URL 非法 | 值只放純內容,不加引號/註解 |
| DB 密碼特殊字元 → auth 失敗 | 連線字串裡 percent-encode 密碼 |
| `Container failed to listen on PORT` | 服務讀 `process.env.PORT`（見 runtime-portability） |
| converter `--ingress internal` → api 呼叫回 `converter /extract failed (404)`（GFE 頁），檔案卡 `failed` | api 無 VPC connector、走公網呼叫 converter，`internal` 只收 VPC 流量。converter 用 `--ingress all`，靠 `CONVERTER_SECRET` bearer 保護；要真正鎖 internal 得幫 api 掛 VPC connector 並設 `--vpc-egress` |

## 回滾

回滾 Web/API/Converter 映像或刪除三個 Cloud Run 服務，不會自動回滾 hosted Supabase 的資料或
schema。資料為一次性複製後獨立存在；涉及資料回復時，先另外確認備份與目標範圍。

相關:[架構總覽](/docs/architecture.md)、[環境變數配置](/docs/env-configuration.md)。

# Citations

[1] [Supabase CLI reference](https://github.com/supabase/cli/blob/develop/apps/cli/docs/go-cli-reference.md) — `link` 關聯專案；`db pull` 從 remote 產生 local schema migration，`db push` 將 local migrations 套用到 remote。
