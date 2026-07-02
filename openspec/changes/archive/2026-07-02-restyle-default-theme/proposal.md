## Why

現有 web UI 是移植期的 shadcn 預設外觀,尚未對齊團隊的設計稿。使用者要把畫面對齊
`docs/design/default` 的設計語言,讓產品有一致、成熟的視覺。範圍已明確縮小:**不做主題切換、不做 ctc**;
**light mode 採用設計稿色盤,dark mode 保持現有** `.dark` tokens 不動。

## What Changes

- **Light 色盤換膚**:`:root` 改為設計稿的 slate/blue 色盤(`--background #f8fafc`、`--card #fff`、
  `--foreground #0f172a`、`--muted-foreground #64748b`、`--border #e2e8f0`、`--accent-blue #3b82f6`、`--radius 12px`),
  primary 維持深色。新增狀態 tokens `--success`(green)、`--warning`(amber);紅色重用 `--destructive`。
  **`.dark` 區塊不變**(僅補上 success/warning 的深色值以免 dark 下狀態色壞掉)。
- **wikis 列表對齊 dashboard**:加 header(eyebrow + 雙語標題「知識管理系統｜Team KMS」+ user pill +
  SYSTEM STATUS ● ONLINE + Settings 連結);KB 卡片改 eyebrow(`KBASE // …`)+ accent-blue 標題 + 描述 +
  `slug:` + READY 狀態點;沿用既有建立入口。
- **files/sources polish**:檔案卡加**型別 pill**(MD/PDF/DOCX…)+ 大小標籤 + 依型別上色的 icon(md 綠/pdf 紅/docx·pptx 藍/圖 amber)+
  圓角/陰影 + processing「EXTRACTING」;頂部 breadcrumb + 篩選/上傳;sidebar 分區(WIKI / DATA SOURCES)+ 底部使用者區塊。
- **settings 對齊**:外層 panel 卡片 + 返回 link + numbered 雙語 section header;沿用現有 light/dark 切換(**不加新主題**);API keys 清單樣式。
- **wiki 閱讀**:markdown 排版對齊 + toolbar polish;右側 TOC 選配。
- 保留所有現有元件結構與功能,只調整視覺呈現(motif 移植)。

明確**不做**:主題切換器、ctc 主題、default 的 dark 設計稿(dark 沿用現況)、GraphViewer canvas 上色。

## Capabilities

### New Capabilities
- `web-visual-default-theme`: web 介面視覺對齊 `docs/design/default`(light 色盤 + 版面 motif),dark 維持現況。

### Modified Capabilities
<!-- openspec/specs/ 為空;純視覺調整,無既有 capability 規格變更。 -->

## Impact

- **`apps/web/src/app/globals.css`**:`:root` light 色盤 + 新狀態 token;`.dark` 僅補 success/warning。
- **`apps/web/tailwind.config.ts`**:補 `success`/`warning` 顏色映射;`--radius` 對齊。
- **`app/(dashboard)/wikis/page.tsx`**、**`components/kb/FilesGrid.tsx`**、**`components/kb/KBSidenav.tsx`**、
  **`app/(dashboard)/settings/page.tsx`**、**`components/wiki/WikiContent.tsx`**、**`components/layout/AppShell.tsx`**:版面對齊。
- 純前端;無後端/DB/測試邏輯變更。docs 視需要記一筆設計對齊。
