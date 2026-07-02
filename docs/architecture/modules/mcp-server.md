---
type: Architecture
title: 模組解析：apps/mcp
description: apps/mcp 作為 Claude 唯一入口的 10 個 MCP 工具、核心檔案與依賴。
tags: [architecture, module, mcp]
timestamp: 2025-07-02T00:00:00Z
---

# 模組解析：apps/mcp

[← 返回索引](/docs/architecture.md) · [模組地圖](/docs/architecture/module-map.md)

## 職責

`apps/mcp` 是 **Claude 的唯一入口**。它用官方 `@modelcontextprotocol/sdk`（v1.29.0）
以 stateless HTTP transport 暴露一組工具，讓 Claude 直接讀來源、寫 wiki、管理引用圖譜。
後端在此模組中**完全不呼叫任何 LLM**——所有理解與寫作邏輯都在 Claude 端。

## 核心檔案

### `index.ts`
- Hono app，兩個端點：`GET /health`、對應 MCP 的 `/mcp`。
- Transport 使用 `WebStandardStreamableHTTPServerTransport`（stateless HTTP-based MCP，
  無 session 概念，`tools/list` 不需先建 session 即可呼叫）。
- 每個請求先驗證 Supabase JWT，再建構一個 user-scoped 的 `PostgresVaultFS` 實例。

### `server.ts` — `buildMcpServer(fs: PostgresVaultFS)`
- 建構 `McpServer`，`name: "Team KMS Wiki"`，`version: "0.1.0"`。
- 帶 **server instructions**，引導 Claude 使用 `guide` 工具了解 wiki 結構
  （overview/concepts/entities/log 階層）、frontmatter 規範、citation 要求、核心工作流。
- 註冊 10 個工具，描述皆還原至完整豐富度（含 `search` 的 references 模式範例、`create`
  的 SVG/CSV asset 範例等），這是系統的「品質槓桿」——Prompt 的詳略直接影響 Claude
  產出品質，因此刻意不精簡。

| 工具 | 用途 |
|---|---|
| `guide` | 回傳 `prompts/guide.md` 全文——wiki 結構、寫作標準、核心工作流程 |
| `list_knowledge_bases` | 列出使用者可存取的知識庫 |
| `create_knowledge_base` | 建立新知識庫 |
| `search` | 三種模式：list（檔案/資料夾瀏覽）、search（關鍵字 + chunk 級全文搜尋，含頁碼）、references（uncited/stale 來源、forward refs、backlinks 圖譜查詢） |
| `read` | 讀單一檔案或 glob；分頁來源（PDF/Office）支援 page range；wiki 頁附 backlinks 摘要；`include_images=true` 時從 `document_pages.elements` 載 asset bytes、以 base64 ImageContent 回給 Claude（上限 12 張，比照原版），供視覺判讀圖表/流程圖 |
| `create` | 建立新 wiki 頁/筆記/資產（SVG/CSV）；缺 frontmatter 時自動補上；重名預設拒絕，需明確 `overwrite=true` |
| `edit` | find-and-replace，比對字串須唯一 |
| `append` | 附加段落，含 footnote 重新編號邏輯 |
| `delete` | 歸檔文件；保護 `/wiki/overview.md` 與 `/wiki/log.md` 不可刪除 |
| `lint` | 檢查 frontmatter 必填欄位（title/description/date/tags）、dangling wiki links、孤兒頁、未引用來源、過期頁面 |

### `tools.ts` — `WikiTools` class
- 所有工具的 handler 實作，回傳 markdown 字串（給 Claude 讀）。
- `loadGuide()`：從 repo 根目錄讀取 `prompts/guide.md`（外部化的 prompt 檔，非寫死在程式碼中，方便獨立調整）。

### `wiki.ts`
- 共用工具函式：`globMatch()`、`resolvePath()`、`parsePageRange()`、`parseFrontmatter()`、
  `ensureWikiFrontmatter()`、`appendMarkdownSection()`、`titleToFilename()` 等（測試也共用這些函式）。

### `read` 圖片回傳（`include_images`）
- `server.ts` 的 `read` schema 加 `include_images?: boolean`（預設關）。
- 開啟時 `tools.ts` 從目標文件的 `document_pages.elements.images` 取 asset docId → 載 asset bytes →
  以 base64 `ImageContent` 區塊回傳，**上限 `MAX = 12` 張**（超過截斷）。預設只回文字。
- 讓 Claude 能實際「看到」PDF 抽出的圖表/流程圖，而非只讀 OCR 文字。

### `references-sync.ts`
- 每次 `create`/`edit`/`append` 完成後呼叫 `updateReferences()`，重建該文件的引用圖譜邊
  （citations + wiki links），詳見 [workflows.md](/docs/architecture/workflows.md) 的第二個核心流程。

## 依賴關係

- 依賴 `packages/shared`：`PostgresVaultFS`（資料存取）、`auth.ts`（JWT 驗證）、
  `references.ts`（引用解析演算法）。
- 依賴 `@modelcontextprotocol/sdk` 提供 MCP 協議實作與 transport。
- 依賴外部檔案 `prompts/guide.md`（repo 根目錄）——這是系統唯一的「品質 prompt」來源，
  修改它會即時影響 Claude 的寫作行為（服務用 `tsx watch` 熱重載，工具描述則需重連 MCP session 才會生效）。
