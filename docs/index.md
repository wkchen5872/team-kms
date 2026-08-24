---
okf_version: "0.1"
---

# Docs Knowledge Bundle

## Start Here

* [README](../README.md) - 先選擇本機開發、測試、production 瀏覽或部署路徑

## Agent Protocol

* [Agent Operating Protocol](agent-protocol.md) - What to read first, hard prohibitions, task-scale protocol, done criteria (managed by wk-agent-ops)

## Architecture & Design

* [Architecture](architecture.md) - Module boundaries and data flow
* [系統總覽與全域架構](architecture/overview.md) - 全域架構圖、資料流摘要、技術棧與部署拓樸
* [核心模組拆解與目錄映射](architecture/module-map.md) - 6 個邏輯模組、目錄對照與依賴方向
* [核心業務流程與時序圖](architecture/workflows.md) - 上傳解析索引 / MCP 讀寫兩大核心流程時序圖
* [資料庫 Schema 與資料流參考](architecture/database.md) - 每個資料表的欄位/索引/RLS/trigger 與資料流程
* [擴展性與維護指南](architecture/dev-guide.md) - 新增解析器、MCP 工具、API 路由、前端頁面與 schema 變更的切入點

### 模組解析

* [apps/api](architecture/modules/api-server.md) - 職責、核心檔案、REST/WebSocket 路由總表
* [apps/converter](architecture/modules/converter.md) - 文件轉換微服務的格式、解析管線與依賴
* [apps/mcp](architecture/modules/mcp-server.md) - Claude 唯一入口的 10 個 MCP 工具
* [apps/web](architecture/modules/web.md) - Next.js 前端路由、元件、狀態層、認證與流程
* [packages/shared](architecture/modules/shared.md) - config、RLS 資料庫存取、JWT、S3、chunker、references、VaultFS

## Conventions & SOP

* [Coding Conventions](conventions.md) - Naming, formatting, and style rules for AI agents
* [環境變數配置](env-configuration.md) - 各 env 檔職責、local/cloud 切分、readiness 標記與常見坑
* [Cloud Run 部署](deployment.md) - production Web/API/Converter、hosted Supabase、一次性資料搬遷與 MCP 邊界
* [Wiki 整理 SOP](architecture/wiki-authoring-sop.md) - Claude 端 model / effort / thinking 設定
* [測試指南](testing.md) - 自動化測試套件、手動端對端、連接 Claude over MCP 與疑難排解

## Planning

* [開發路線圖](team-kms-roadmap.md) - Development roadmap
* [技術架構規格書](team-kms-tech-architecture.md) - Technical architecture specification

## Meta

* [OKF Conventions](okf-conventions.md) - OKF authoring rules for this bundle
