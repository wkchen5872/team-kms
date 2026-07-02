## Context

小型前端修正。`/wikis` 是移植期精簡列表(只列 KB),建立入口漏做;`WikiSelector` 的 Create 只在工作區內可達,
零 KB 時無法進入工作區 → 無法建立第一個 KB。後端建立能力(`POST /v1/knowledge-bases`、`useKBStore.createKB`)
早已存在,只缺列表頁的 UI 入口。

## Goals / Non-Goals

**Goals:** `/wikis` 可建立 KB(含空狀態 CTA),建立後導向新工作區。
**Non-Goals:** 重寫 `/wikis` 成完整 in-shell 版;後端/schema 任何變更;rename/delete KB(已在 WikiSelector)。

## Decisions

**D1. 加入口到列表頁,不改後端。** 重用 `useKBStore.createKB(name)`(已含 `POST /v1/knowledge-bases` + 更新 store),
沿用 `components/ui/dialog` 對話框樣式,與 `WikiSelector` 一致。成功後 `router.push('/wikis/'+slug)`。

**D2. 空狀態獨立 CTA。** 零 KB 時除了標題列「+ New」,再放一個明顯的置中 CTA,避免新使用者找不到入口。

## Risks / Trade-offs

- **建立失敗(如 `public.users` 無列 → FK)** → handler catch 顯示錯誤 toast;不靜默。此屬帳號/資料層問題,非本修正範圍。
- 名稱重複 → 後端 UNIQUE(user_id,name) 會 409;toast 呈現後端訊息。

## Migration Plan

無 migration。純 UI。

## Open Questions

無。
