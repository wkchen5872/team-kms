---
type: Reference
title: Team KMS 開發路線圖 (Development Roadmap)
description: 給開發人員的執行清單，依「由核心往外」排列，每個 Task 列目標、輸出物與依賴。
tags: [roadmap, planning]
timestamp: 2026-06-30T00:00:00Z
---

# Team KMS 開發路線圖 (Development Roadmap)

> **版本**：v0.1
> **狀態**：草稿（持續更新中）
> **建立日期**：2026-06-30
>
> **文件定位**：本文件是給開發人員的具體執行清單，依「由核心往外」的順序排列，每個 Task 列出目標、輸出物、依賴關係，以及進入開發時需要討論的技術細節（待討論項目刻意留白，不在此預先決定）。
>
> 與另外兩份文件的關係：《技術架構規格書》定義環境與部署模式的決策，本文件定義「先蓋什麼、後蓋什麼、每一塊蓋出來長什麼樣子」。實際開發順序以本文件為準。

---

## 一、整體流程總覽

**PoC Phase 0 核心線（已驗證可行，現在做）** — 實線主線：

```
                    ┌─────────────┐
                    │   upload    │ ← CLI（PoC 主要） / Watcher(dev-only) / Web(後)
                    └──────┬──────┘
                           ↓
                  Hash 比對（新檔案？）
                           ↓
                  Ingest Queue（待處理清單）
                           ↓
                    Parser Pipeline
              （純文字 → PDF → Image，分階段）
                           ↓
                    Wiki Compile（Prompt B）
                           ↓
                    Auto-publish
                           ↓
            DB（唯一權威來源）─ 可選單向匯出檔案（dev/debug 瀏覽用）
                           ↓
                    MCP Server（read-only）
              供任意 MCP-compatible app 查詢
```

**矛盾偵測 / Review Queue — Observe-first，PoC 不實作（條件性分支）**：

```
   〔待觀察到真實矛盾後才接上〕
                    Parser Pipeline
                           ┊（虛線：尚未建）
                  【矛盾偵測步驟（Prompt A）】
                查詢現有 wiki → LLM 比對
              ┌──────────┴──────────┐
           無矛盾                 有矛盾
              ↓                     ↓
         Auto-publish          Review Queue → 人工審查 → 核准後 Compile
```

> **為什麼是虛線**：使用者實際用過參考專案**從未撞到矛盾**；「矛盾」是另一個 AI 推測、未經觀察的需求。依 YAGNI，先跑通核心線、餵真實文件，**真的出現矛盾再拿真實案例設計** Prompt A + Review Queue。詳見 §四「觀察點」。

兩個觸發 ingest 的路徑（**皆 Deferred，PoC Phase 0 不做**；Phase 0 直接用 CLI 單發觸發核心線）：

| 路徑 | 現階段用途 | 最終定位 |
|---|---|---|
| MCP ingest tool（Task 7） | 人工觸發，方便逐步檢查 Prompt 輸出，debug 用 | 保留作測試工具 |
| Daemon 背景處理（Task 8） | — | 正式運作的主要路徑 |

---

## 二、開發任務總表

#### PoC Phase 0 — 已驗證核心（現在做）

對應參考專案 lucasastorian/llmwiki 那條「沒有矛盾步驟」的線，是使用者已親身驗證可行的核心：

| Task | 名稱 | 依賴 | 狀態 |
|---|---|---|---|
| Task 0 | 專案初始化 | — | ☐ |
| Task 1B | Prompt B — Wiki Compile 設計與模板化 | — | ☐ |
| Task 2 | Wiki 儲存結構（DB Schema，DB 為唯一權威） | Task 0 | ☐ |
| Task 3 | 新檔案偵測與 Upload 進入點（CLI 優先） | Task 0 | ☐ |
| Task 4 | Parser Pipeline（純文字 → PDF → Image 分階段） | Task 3 | ☐ |
| Task 5′ | Compile + Auto-publish（**不含**矛盾偵測路由） | Task 1B, 2, 4 | ☐ |
| Task 9 | MCP Server — Read-only 查詢介面（團隊存取的近期介面） | Task 2 | ☐ |

#### Deferred — 待觀察到需求再做

| Task | 名稱 | 解鎖條件 | 狀態 |
|---|---|---|---|
| Task 1A | Prompt A — 矛盾偵測設計與模板化 | 核心跑通後**真的觀察到矛盾** | ☐ |
| Task 5″ | 矛盾偵測 + 路由（無矛盾→publish / 有矛盾→Review） | 同上（需 Task 1A） | ☐ |
| Task 6 | Queue 設計（完整狀態機 + Review Queue） | 出現矛盾、或量大到最小清單不夠用 | ☐ |
| Task 7 | MCP Server — Ingest 工具（開發用） | 需要透過 LLM app 人工觸發 debug 時 | ☐ |
| Task 8 | Daemon / Worker | 要從單發 CLI 轉為背景自動處理時 | ☐ |
| Task 10 | Web UI（非技術人員存取介面） | 核心邏輯穩定後（PoC 範圍外） | ☐ |

> 狀態欄可在開發過程中更新為 ☐ 未開始 / 🔶 進行中 / ✅ 完成，方便追蹤。
> Deferred 不代表不做——是**等真實訊號（觀察到矛盾、量級、自動化需求）出現**才解鎖，避免預先蓋推測性的基礎設施。

---

## 三、各 Task 詳細說明

### Task 0：專案初始化

**目標**：建立可開發的基礎環境。

**輸出物**：
- Node.js 專案結構、`package.json`
- 環境變數管理機制（`.env`）
- 開發用資料庫連線（PostgreSQL Docker 或 Supabase，擇一）

**開發時待討論**：
- Repo 結構（單一 repo 或拆分套件）
- 是否使用 TypeScript，型別策略
- Lint / format 規範

---

### Task 1：Prompt 設計與模板化

**目標**：確認核心 LLM 邏輯正確，並讓 MCP 與 Daemon 共用同一套提示詞。

**範圍**：拆成兩個獨立 prompt，分開測試：

| Prompt | 輸入 | 輸出 | PoC 狀態 |
|---|---|---|---|
| **B — Wiki Compile** | 新文件內容 | 格式化 wiki 頁面（frontmatter + 正文 + wikilinks） | **Phase 0，現在做** |
| **A — 矛盾偵測** | 新文件內容 + 現有 wiki 相關頁面 | 有矛盾 / 無矛盾（結構化判斷） | **Deferred（Observe-first）** |

> **Prompt A 延後**：矛盾是未經觀察的推測需求，PoC Phase 0 只做 Prompt B（compile）。待核心跑通、真的觀察到矛盾，再拿真實案例設計 Prompt A（屆時門檻、誤報率都有實例可調，不必閉眼猜）。

**流程**：先在 Chat 測試邏輯 → 確認後落地成獨立模板檔案（不寫死在程式碼中）。

**輸出物**：`/prompts/contradiction-detection.md`、`/prompts/wiki-compile.md`（或類似命名規則）

**開發時待討論**：
- 模板格式（純文字 / 含變數插值的樣板語法）
- Prompt A 需要的 wiki context 範圍與筆數（多少才夠判斷，又不會 token 爆炸）
- 兩個 prompt 之間的呼叫順序與資料傳遞介面
- 載入方式先用「讀取 prompt」這層抽象包裝，未來若需要 build 步驟打包（Cloudflare Worker 場景），不影響呼叫端介面

---

### Task 2：Wiki 儲存結構（DB Schema）

**目標**：建立 wiki 內容與來源檔案的資料結構。需要提前完成，因為 Task 9（MCP read）查詢、以及未來 Task 5″ 的矛盾偵測，都要能查詢「現有 wiki」。

**輸出物**：
- Wiki pages 資料表（frontmatter 欄位、正文、wikilinks）
- Raw files 資料表（hash、原始檔名、來源關聯）
- DB 為唯一權威來源；**可選的單向匯出**（DB → 檔案）作為除錯／無 Web UI 時的瀏覽用途，非真相、可隨時由 DB 重生（見 tech-arch §6.4）

**開發時待討論**：
- Schema 欄位設計（wiki page 與 raw file 的關聯方式）
- Frontmatter 規格（標題、標籤、來源 hash、建立時間等必要欄位）
- 匯出時機與開關（compile 完成立即匯出、批次匯出，或預設關閉）
- 查詢介面（供 Task 9 read 與未來 Task 5″ 使用：先用關鍵字搜尋即可，或一開始就上向量搜尋）

---

### Task 3：新檔案偵測與 Upload 進入點

**目標**：實作統一的攝入進入點。

**核心邏輯**：

```
upload → hash 比對（新檔案？）→ 寫入待處理清單
```

`upload` 是唯一核心進入點，三種觸發方式最終收斂到同一個函式：

| 觸發方式 | 適用情境 |
|---|---|
| CLI 工具 | PoC 階段主要操作方式 |
| Watcher（dev-only） | 監控 `raw/` 目錄異動，偵測到新檔案後呼叫 CLI 執行 `upload` |
| Web 介面 | 待 Task 10 開發 |

**開發時待討論**：
- Hash 演算法選擇
- 待處理清單（Queue）的最小可行 schema（先做到能跑，完整狀態機留到 Task 6）
- 重複上傳同一份檔案（hash 相同）的處理方式

---

### Task 4：Parser Pipeline

**目標**：將原始檔案轉換成可供 LLM 處理的文字內容。

**範圍**：
- **Image** → 嘗試讀取內容（名片、表格、文件翻拍等情境）
- **PDF** → 萃取文字與圖片

**開發時待討論**：
- 第一階段先支援哪些格式（建議：純文字 → PDF → Image 依序擴充）
- Third-party 服務選型（OCR / Vision API）
- 解析失敗的錯誤處理與重試機制

---

### Task 5：Compile 邏輯整合（拆兩段）

#### Task 5′ — Compile + Auto-publish（Phase 0，現在做）

**目標**：串接 Parser 與 Prompt B，完成「解析 → 編譯 → 發布」的核心線。

**邏輯**：
1. Parser 取得文件內容
2. 呼叫 Prompt B → Compile → 寫入 Task 2 的 DB（auto-publish）
3. （可選）依設定單向匯出檔案供瀏覽

**設計哲學**：publish-first，correct-by-exception——預設自動發布。**但例外處理器（矛盾偵測）待真的觀察到例外再蓋**（見 Task 5″）。

#### Task 5″ — 矛盾偵測 + 路由（Deferred，Observe-first）

**解鎖條件**：Phase 0 核心跑通後，用真實文件觀察到矛盾確實發生。

**邏輯（屆時才接上）**：
1. 用 Task 2 的查詢能力，找出與新文件相關的現有 wiki 頁面
2. 呼叫 Prompt A 判斷是否矛盾
3. 無矛盾 → 走 Task 5′ 的 publish
4. 有矛盾 → 進入 Review Queue（見 Task 6），等待人工審查

**開發時待討論（解鎖後）**：
- 矛盾判斷的信心門檻（避免把單純補充資訊誤判為矛盾）——**有真實案例才好調**
- 誤報的處理方式（先接受、之後再用實際案例調整 prompt）
- 漏報是模型本身的限制，目前設計上接受此風險

---

### Task 6：Queue 設計（完整狀態機）

**目標**：把 Task 3 的最小可行清單，擴充成完整的狀態管理。

**兩個 Queue**：
- **Ingest Queue**：`pending → processing → (published | review | error)`
- **Review Queue**：矛盾偵測路由進來的項目，等待人工審查；核准後重新觸發 Compile

**開發時待討論**：
- Queue 實作方式（DB table 是否足夠，或需要額外鎖定機制）
- Review Queue 的審查介面與 context 呈現（審查者需要看到什麼資訊才能判斷）
- 核准 / 駁回後的後續處理流程

---

### Task 7：MCP Server — Ingest 工具（開發階段）

**目標**：提供 `ingest` tool，讓使用者透過 LLM app 人工觸發 Task 5 的完整流程，逐步檢查 Prompt A/B 的實際輸出，加速除錯。

**部署**：Local，`npx` 安裝啟動

**開發時待討論**：
- Tool 的輸入輸出介面定義
- 與 Daemon（Task 8）共用底層 ingest 邏輯的程式碼結構，避免兩條路徑各寫一份維護成本

---

### Task 8：Daemon / Worker

**目標**：串接 Task 3–6，背景自動處理，成為正式運作的主要路徑。

**邏輯**：`Watcher/Upload → Queue → Parser → 矛盾偵測 → Compile → Publish`

**原則**：單執行緒、依序處理一個檔案，避免矛盾偵測查詢同時寫入造成的 race condition。

**開發時待討論**：
- Daemon 啟動與監控方式（PM2、systemd 等）
- 失敗重試策略、日誌與監控
- Daemon 穩定後，逐步將 Task 7 的 MCP ingest 角色收斂為純測試用途，並加入鎖定機制，防止兩條路徑同時處理同一份檔案

---

### Task 9：MCP Server — Read-only 查詢介面

**目標**：提供標準 MCP 介面，讓任意 MCP-compatible app 查詢 wiki 知識。

**範圍**：`search`、`read` 工具

**部署**：Local（`npx`）；Remote（Cloudflare Worker）部分留到 PoC 之後

**開發時待討論**：
- Search 工具的查詢邏輯（關鍵字 / FTS，是否之後擴充向量搜尋）
- 回傳格式設計

---

### Task 10：Web UI（PoC 範圍外，暫緩）

**目標**：非技術人員友善的操作介面。

**範圍（之後開發時再展開）**：
- 上傳介面
- Wiki 瀏覽
- Review Queue 審查介面

**現況**：PoC 階段明確不開發，待核心邏輯（Task 1–9）驗證穩定後再啟動。

---

## 四、開發順序建議

**PoC Phase 0 — 跑通已驗證核心線：**

```
Task 0 ──┬── Task 1B（Prompt B compile，可與其他 Task 平行）
         ├── Task 2（DB Schema，DB 為唯一權威）
         └── Task 3（Upload 進入點，CLI 優先）
                ↓
         Task 4（Parser，純文字優先）
                ↓
         Task 5′（Compile + Auto-publish，需要 Task 1B / 2 / 4）
                ↓
         Task 9（MCP read-only 查詢介面）
                ↓
        ┌──────────────────────────────────┐
        │  ★ 觀察點（Decision Gate）★       │
        │  餵真實文件跑核心線               │
        │  → 矛盾到底會不會出現？           │
        └──────────────────────────────────┘
                ↓                    ↓
              不會（很可能）        會
                ↓                    ↓
        砍掉 Task 1A/5″/6 的    解鎖 Deferred：
        矛盾相關部分，核心      Task 1A → 5″ → 6
        即成品                 （拿真實案例設計 Prompt A）
```

Task 1B 可以最早開始，且不依賴任何程式碼——在 Chat 裡測試 prompt 邏輯即可，建議與 Task 0 同時進行。

### ★ 觀察點（Decision Gate）

核心線（Task 0、1B、2、3、4、5′、9）跑通後，**用你自己的真實文件餵進去**，觀察：

- **矛盾是否真的發生？** 否 → 矛盾偵測整套（Task 1A、5″、6 的 Review Queue）不必蓋，核心線即 PoC 成品。是 → 此時你手上有**真實矛盾案例**，據以設計 Prompt A 的判斷門檻與誤報處理，而非閉眼猜。
- **量級是否大到需要完整狀態機 / Daemon？** 否 → 最小可行 Queue + 單發 CLI 即可。是 → 解鎖 Task 6 / Task 8。
- **是否需要透過 LLM app 人工 debug？** 是 → 解鎖 Task 7（MCP ingest）。

原則：**等真實訊號出現才解鎖 Deferred，不預先蓋推測性基礎設施。**
