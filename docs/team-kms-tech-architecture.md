# Team KMS 技術架構規格書 (Technical Architecture Specification)

> **版本**：v0.1
> **狀態**：草稿（持續更新中）
> **建立日期**：2026-06-30
>
> **文件定位**：本文件聚焦於「系統要怎麼蓋」——環境、部署模式、模組行為模式（design pattern）的具體決策，作為後續模組開發的技術依據。與概念性的「為什麼這樣設計」（業務邏輯、矛盾與缺口分析）屬於不同文件。

---

## 一、開發環境

- Runtime：Node.js

---

## 二、部署模式

系統有三種部署目標，彼此定位不同：

| 部署目標 | 環境 | 定位 | 持久化檔案系統 | 可跑常駐程序 |
|---|---|---|:---:|:---:|
| Local Host | Mac | 開發 / 個人使用 | ✅ | ✅ |
| Remote Host (Self-hosted) | GCP / AWS Linux | Self-hosted 正式環境 | ✅ | ✅ |
| Remote Host (Cloudflare Worker) | Cloudflare Workers | 商業化 / SaaS | ❌ | ❌ |

**關鍵分界**：Local Host 與 Remote Host (Self-hosted) 屬於同一類執行模型——皆具備持久檔案系統與長駐程序能力，Watcher、Daemon、Parser 的「本機 tool」選項，都能在這兩種環境下運作，邏輯一致。

Cloudflare Worker 是結構上完全不同的執行模型（V8 isolate，serverless），無法跑常駐 watcher / daemon，也無法執行需要二進位執行檔的本機解析工具。相關模組需要對應的替代設計，詳見第七節「待釐清問題」。

---

## 三、MCP

| 模式 | 部署方式 |
|---|---|
| Local | `npx` 安裝啟動 |
| Remote | 部署至 Cloudflare Worker |

---

## 四、資料庫

**Development**：Supabase（推薦）或 PostgreSQL（Docker, local）——兩者為對等選項，依個人偏好選擇。

---

## 五、流程設計

### 5.1 流程一：來源檔案更新

統一的核心邏輯：

```
upload → 檢查是否為新檔案（hash 比對）→ 待處理清單（Ingest Queue）→ Parser Pipeline
```

`upload` 是所有觸發路徑共用的單一進入點，依環境與情境不同，有以下觸發方式：

| 觸發方式 | 適用情境 |
|---|---|
| Web 介面選擇上傳 | 有 Web UI 時的主要路徑 |
| CLI 工具 | 無 Web UI 時的主要路徑；PoC 階段的主要操作方式 |
| Watcher（dev-only） | Local 開發階段，模擬「丟檔案到資料夾自動處理」的體驗：監控 `raw/` 目錄異動，偵測到新檔案後呼叫 CLI 工具執行 `upload` |

> **設計重點**：Watcher 不是架構本身的必要元件，只是 local 開發階段用來觸發 `upload` 的其中一種方式。`upload` 才是唯一核心進入點，讓 Web / CLI / Watcher 三種觸發方式最終收斂到同一條 pipeline，不因部署環境不同而需要不同邏輯。

Parser Pipeline 依檔案類型解析（**分階段擴充**：純文字 → PDF → Image）：
- **純文字** → 直接讀入（第一階段優先支援）
- **PDF** → 萃取文字與圖片
- **Image** → 嘗試讀取內容（名片、表格、文件翻拍等情境）

### 5.2 流程二：Ingest 來源檔案內容製作成 Wiki

```
ingest (compile) → wiki/
```

兩條觸發路徑：

| 路徑 | 觸發者 | 現階段用途 | 最終目標 |
|---|---|---|---|
| MCP ingest | 使用者透過 LLM app | Prompt 測試與 debug（人工觸發，方便逐步檢查 LLM 輸出） | 開發階段保留作為測試工具 |
| Daemon 背景處理 | 系統自動觸發 | — | 正式運作的主要路徑 |

> **已知風險（暫不處理）**：兩條路徑若同時對同一份來源檔案觸發，會有寫入順序競態。現階段 MCP ingest 僅用於開發測試，與 Daemon 不會同時對同一批檔案運作，風險可接受。**待 Daemon 成為主要運作路徑後，需要加入鎖定機制**（例如：處理中狀態標記、樂觀鎖）。詳見第七節「待釐清問題」。

---

## 六、系統設計要求

### 6.1 Prompt 模板化

Prompt 不寫在程式碼中，獨立成文件，讓 MCP 與 Daemon 共用同一套提示詞。

| 部署模式 | 載入方式 |
|---|---|
| Local Host / Remote Host (Self-hosted) | Runtime 直接讀取檔案系統 |
| Remote Host (Cloudflare Worker) | 無法 runtime 動態讀取外部檔案，需要 **build 步驟** 將 prompt 模板打包進部署產物 |

Prompt 模板目錄在 repo 中維持獨立、單一來源；差異只在「如何被載入到執行環境」，由 build 流程處理，不影響模板本身的維護方式。

### 6.2 Parser

依部署環境決定可用選項：

| 部署模式 | 可用方式 |
|---|---|
| Local Host / Remote Host (Self-hosted) | Third-party 服務 **或** 本機 tool（皆可） |
| Remote Host (Cloudflare Worker) | 僅能使用 Third-party 服務（無法執行本機二進位工具） |

### 6.3 部署方式

**Development**
- Local 啟動服務
- 資料庫：PostgreSQL (Docker) 或 Supabase

**Production**
- 三種部署目標（見第二節）
- 資料庫：PostgreSQL (Docker) 或 Supabase
- Storage：
  - Local Host / Self-hosted：`raw/`、`wiki/` 存於指定目錄
  - Cloudflare Worker：Cloudflare Storage (S3) / AWS S3 等

### 6.4 Wiki 儲存

- **DB 為唯一權威來源（single source of truth）**。
  - **選 DB 的理由（load-bearing，非跟風）**：終態是掛到 Remote Host 的**團隊共用 wiki**，使用者包含**非技術人員**。若以 git／檔案當存取介面，非技術人員無法使用；因此真相必須放在可由 server 多人查詢存取的 DB。「team／非技術人員存取」是本專案一級目標。
  - 團隊存取的真正介面是 **MCP read（近期）** 與 **Web UI（PoC 後）**，皆讀自 DB。
- **檔案匯出（export）是單向、可選、可拋棄的便利機制，不是真相，也不是團隊存取路徑**：
  - 用途：沒有 Web 介面時、單人方便直接瀏覽整個 wiki 內容、檢查整理品質是否有誤（dev／debug）。
  - 行為：DB → 檔案的**單向**寫出，做成一個可開關的設定（export toggle）；隨時可由 DB 重新生成。
  - 因為是單向衍生（非雙向 sync），檔案層**不存在同步競態問題**——檔案永遠是 DB 的下游快照。
  - 正式有 Web 介面後，此匯出可視情況保留或移除。

### 6.5 PoC 範圍

現階段目標是驗證核心邏輯是否正確，以下暫不在範圍內：
- Web 介面
- Remote Host (Cloudflare Worker) 部署細節（例如 Storage 串接方式）

---

## 七、待釐清問題（Open Questions）

> **註：Daemon 相關問題隨 Daemon 一起延後。** Daemon、MCP ingest、矛盾偵測／Review Queue 在 PoC Phase 0 皆不實作（見 roadmap 的 Observe-first 決策），下列問題待對應模組進入開發時再處理。

| # | 問題 | 觸發時機 |
|---|------|----------|
| 1 | MCP ingest 與 Daemon 同時運作時的鎖定機制設計（**隨 Daemon 一起延後**） | Daemon 成為主要路徑、且 MCP ingest 仍保留供人工觸發時 |
| 2 | Cloudflare Worker 模式下，「背景自動處理」（相當於 Daemon 的角色）如何實現？Workers 無法跑常駐程序，需評估 Cloudflare Queues / Durable Objects / Cron Triggers 等替代機制 | 進入商業化／Cloudflare Worker 部署階段 |
| 3 | PostgreSQL (Docker) 在 self-hosted 環境，如何讓 Cloudflare Worker（若未來有混合部署需求）可達？需要 Cloudflare Tunnel 或公開連線等額外網路架設 | 若未來有跨部署模式的混合需求 |

