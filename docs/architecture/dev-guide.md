---
type: Playbook
title: 擴展性與維護指南
description: 新增解析器、MCP 工具、API 路由、前端頁面與 schema 變更的切入點與慣例。
tags: [playbook, dev-guide, extension]
timestamp: 2025-07-02T00:00:00Z
---

# 擴展性與維護指南

[← 返回索引](/docs/architecture.md)

新進開發者若要新增功能，依功能類型參考以下切入點與慣例。

## 新增一個文件解析器（新副檔名支援）

- 參考 [`apps/converter/src/office.ts`](/apps/converter/src/office.ts) 的模式：
  獨立函式接收來源路徑、暫存目錄，回傳統一的 `PageContent[]`。
- 在 [`apps/converter/src/index.ts`](/apps/converter/src/index.ts) 的副檔名分流
  邏輯中註冊新的處理路徑（目前分兩類：PDF 直接進 opendataloader；Office 系列先經
  LibreOffice 轉 PDF 再進 opendataloader）。
- 若新格式有其獨立轉換引擎（非 LibreOffice/opendataloader 可處理），評估是否需要新增
  對應的系統依賴，並同步更新 `apps/converter/Dockerfile`。
- 前端與 API 端要同步：`apps/api/src/ingest.ts` 的 `TEXT_TYPES`/binary 分流、MIME 對照表
  （見 `apps/api/src/ingest.ts` 內的 MIME map）需加入新副檔名。

## 新增一個 MCP 工具

1. 在 [`apps/mcp/src/tools.ts`](/apps/mcp/src/tools.ts) 的 `WikiTools` class 加入
   新方法，回傳 markdown 字串（Claude 消費的格式）。
2. 在 [`apps/mcp/src/server.ts`](/apps/mcp/src/server.ts) 用 `registerTool` 註冊，
   **描述務必寫詳細**（含使用範例）——本系統的經驗是 MCP 工具描述與
   `prompts/guide.md` 是「品質槓桿」，過度精簡會直接劣化 Claude 的產出品質。
3. 若新工具涉及新的工作流程觀念，更新 [`prompts/guide.md`](/prompts/guide.md)
   （外部化的 prompt 檔，改動後 mcp 服務用 `tsx watch` 會即時 reload 內容；但工具描述
   本身是在 MCP handshake 時快取的，需要重連 client 才會生效）。
4. 若工具需要新的資料存取方法，先在 `packages/shared/src/vaultfs.ts` 的
   `PostgresVaultFS` 加方法，維持「所有 DB 存取都經 VaultFS」的邊界。

## 新增一個 API 路由

- 在 [`apps/api/src/index.ts`](/apps/api/src/index.ts) 加 Hono route。
- 資料存取一律經 `packages/shared` 的 `PostgresVaultFS`；選擇查詢輔助函式時：
  - 使用者觸發、且該操作應被 RLS 限定範圍 → 用 `scopedQuery`/`scopedExecute`
    （經 `PostgresVaultFS` 方法間接呼叫）。
  - 系統內部信任操作（背景 job、跨使用者系統維運）→ 才用 `serviceQuery`/`serviceExecute`，
    需清楚註明繞過 RLS 的理由。
- 若路由需要即時通知前端，複用 `apps/api/src/notify.ts` 的 pg LISTEN/NOTIFY + WebSocket
  relay 機制，不要另開一套推播管道。

## 新增一個前端頁面

- 遵循 Next.js 14 App Router 慣例：在 `apps/web/src/app/` 下新增對應路徑的
  `page.tsx`。
- 所有 API 呼叫一律透過 [`apps/web/src/lib/api.ts`](/apps/web/src/lib/api.ts) 的
  `apiFetch<T>()`（自動帶入 Supabase JWT），不要另寫 fetch 邏輯。
- 需要圖表/視覺化時，複用既有元件模式：`MermaidBlock.tsx`（動態載入 + SVG 渲染）、
  `GraphViewer.tsx`（`react-force-graph-2d`，`ssr:false` 動態載入）。

## 資料庫 schema 變更

- 依 [`.claude/rules/supabase-migrations.md`](/.claude/rules/supabase-migrations.md)
  規範：每個新 `CREATE TABLE public.xxx` 後**必須**附上
  `GRANT ... TO service_role` 與 `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`。
- 本專案 Workers/服務皆走 service_role 連線，**預設不要**加 `anon`/`authenticated`
  的 grant，除非該表確實需要瀏覽器端或登入使用者直連。
- 既有已套用的 migration 不需回頭補 GRANT。

## 一般開發流程

- 依 [`.claude/rules/tdd-enforcement.md`](/.claude/rules/tdd-enforcement.md)：
  先寫失敗測試（Red）→ 最小實作讓測試通過（Green）→ 重構（Refactor），測試全綠才進下一步。
- 測試指令：`pnpm test`（Vitest，對本機 Supabase stack 跑整合測試，見
  [`docs/testing.md`](/docs/testing.md)）。
- 依 [`.claude/rules/openspec-commits.md`](/.claude/rules/openspec-commits.md)：
  若透過 OpenSpec 流程開發，commit 訊息格式為 `feat(<change-id>): ...` /
  `docs(<change-id>): ...`，scope 對應 `openspec/changes/` 資料夾名稱。
