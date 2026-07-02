## Why

新帳號(或剛 `db reset` 後)登入落在 `/wikis`,只看到「No knowledge bases yet」卻**無法建立第一個
knowledge base**——建立 KB 的 UI 只存在於 `WikiSelector`(sidebar 下拉),而那個只在進入某個 KB 工作區
(`/wikis/[slug]`)後才出現。零 KB 時沒有工作區可進 → 雞生蛋的死結,使用者完全卡住。

## What Changes

- 在 `/wikis` 列表頁加入建立入口:標題列的「+ New」按鈕,以及**空狀態的 CTA**(「Create your first
  knowledge base」),兩者開一個建立對話框(沿用 `WikiSelector` 樣式)。
- 送出後呼叫既有 `useKBStore.createKB(name)`,成功即導向新 KB 的 `/wikis/:slug`;失敗顯示 toast。
- 純前端修正,無後端/schema 變更(建立走既有 `POST /v1/knowledge-bases`)。

## Capabilities

### New Capabilities
- `web-kb-list-create`: `/wikis` 列表頁可建立 knowledge base(含空狀態入口),解決零 KB 無法起步的死結。

### Modified Capabilities
<!-- openspec/specs/ 為空;無既有 capability 規格需修改。 -->

## Impact

- **`apps/web/src/app/(dashboard)/wikis/page.tsx`**:加建立按鈕 + 空狀態 CTA + 建立對話框。
- 重用 `useKBStore.createKB`、`components/ui/dialog`;無後端變更。
