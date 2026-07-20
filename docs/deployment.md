---
type: Playbook
title: Cloud Run Deployment
description: Deploy the demo to Google Cloud Run (web/api/converter) backed by hosted Supabase, via the guarded scripts.
tags: [deployment, cloud-run, gcp, supabase, ops]
timestamp: 2026-07-08T00:00:00Z
---

# Cloud Run 部署

把 `web`/`api`/`converter` 三個容器部到 **Google Cloud Run**,資料/認證/儲存走
**hosted Supabase**(內建 `pgroonga`)。`mcp` 不部署。env 檔職責見
[環境變數配置](/docs/env-configuration.md)。

## 拓樸

```
team browser ──► web (Cloud Run) ──► api (Cloud Run) ──► hosted Supabase
                                          └──► converter (Cloud Run, ingress all + secret)
   project: hardy-thinker-257409 · region: asia-northeast1（配合 Supabase ap-northeast-1）
```

## 前置

- GCP 專案 + billing;啟用 `run` / `artifactregistry` API。
- **GCP 認證(專案級,不污染全域)**:`export CLOUDSDK_CONFIG="$PWD/.gcloud"` →
  `gcloud auth login` → `gcloud config set project <id>`。`deploy-cloudrun.sh`
  會自動用這份隔離登入。
- `.env`(A 憑證 + B-local)、`.env.cloud`(B-cloud,指向 hosted)填妥 —— 見
  env-configuration 的 readiness 標記。
- Docker Desktop(`buildx`,build amd64 image)。

## 一次性資料搬遷(部署前)

| 步驟 | 腳本 | 說明 |
|---|---|---|
| Supabase 建置 | `scripts/supabase-push.sh` | link 正確專案(釘死 ref)→ 啟用 pgroonga → `db push` |
| 內容搬遷 | `scripts/migrate-content.sh` | `pg_dump` 6 張表 → restore,remap 單一 owner → 共用帳號 UUID |
| 原始檔搬遷 | `scripts/migrate-storage.sh` | 複製 owner 的 Storage 物件,前綴改成新 UUID |

三支腳本都**釘死目標專案**、寫入前先驗證,並支援 `--dry-run`。

## 部署

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

> **CORS**:`APP_URL` 是 web 的 Cloud Run URL(deploy-output),api 靠它放行瀏覽器
> 來源。分享給團隊時用**確定性網址** `https://<service>-<projectnumber>.<region>.run.app`
> ——那才是 `APP_URL` 允許的 origin(Cloud Run 另有 `-xxxxx-an.a.run.app` 舊格式,
> CORS 不放行)。

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

刪除三個 Cloud Run 服務即可;本機 `docker-compose.yml` 未變動,資料為單向複製,
hosted Supabase 專案可獨立保留或刪除。

相關:[架構總覽](/docs/architecture.md)、[環境變數配置](/docs/env-configuration.md)。
