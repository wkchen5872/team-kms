## Context

把 `apps/web` 對齊 `docs/design/default`。現有為乾淨 HSL token 系統(`:root`+`.dark`,`hsl(var(--x))` 映射,
`darkMode:"class"`,next-themes light/dark)。探索發現 files/settings 結構已與設計稿相符(差色盤 + 卡片/標籤細節),
wikis 列表差最多。使用者指定:light 換設計稿色盤、**dark 不動**、不做主題切換/ctc。

## Goals / Non-Goals

**Goals:** light 色盤與版面 motif 對齊 default 設計稿(4 畫面);dark 維持現況不破版;功能不變。
**Non-Goals:** 主題切換器、ctc、default dark 設計稿、GraphViewer canvas 上色、大幅重寫元件結構。

## Decisions

**D1. 只改 `:root`(light),`.dark` 保持。** 使用者明確要 dark 沿用現況。唯一例外:新增的
`--success`/`--warning` 必須同時在 `:root` 與 `.dark` 定義(否則 dark 下狀態色未定義)。

**D2. Motif 移植,不重寫結構。** 保留現有元件與資料流,只套色盤 + 加設計稿的視覺元素:eyebrow 標籤
(`KBASE // …`、numbered section)、狀態點/型別 pill、卡片圓角+陰影、雙語標題、user pill。降低風險、可漸進。

**D3. 色盤對應(light HSL)。**
`--background`=#f8fafc、`--card`/`--popover`=#fff、`--secondary`/`--muted`/`--accent`=#f1f5f9、
`--foreground`/`--card-foreground`=#0f172a、`--muted-foreground`=#64748b、`--border`/`--input`=#e2e8f0、
`--accent-blue`=#3b82f6、`--ring`≈#64748b、`--radius`=0.75rem(12px)。primary 維持深色(≈#0f172a,現況即是)。
`--success`=#10b981、`--warning`=#f59e0b;紅用既有 `--destructive`(#ef4444 系)。

**D4. 檔案型別上色** 用共用 helper(副檔名→顏色 class):md→success、pdf→destructive、doc/docx/ppt/pptx→accent-blue、
png/jpg/…→warning、其他→muted。pill 顯示大寫副檔名 + 檔案大小。

**D5. settings Appearance** 只呈現/切換現有 light/dark(對齊設計稿的「LIGHT THEME ACTIVE」列樣式),**不引入第三主題**。

## Risks / Trade-offs

- **dark 回歸** → 換 light 色盤時只動 `:root`;每頁在 light+dark 都要目視;新 token 同步補 `.dark` 值。
- **radius 全站變動**(1rem→0.75rem)→ 屬預期對齊,快速掃一遍卡片/按鈕/對話框外觀。
- **accent-blue 變鮮豔**(現 muted → #3b82f6)→ 確認連結/標題在 light 對比足夠;dark 的 accent-blue 維持現值。
- **GraphViewer** canvas 硬寫色不在範圍,light 下仍可讀即可。

## Migration Plan

無 migration/後端。先改 tokens(全站即時換膚)→ 逐頁對齊 motif → light+dark 目視 → tsc/build。

## Open Questions

- 右側 TOC(wiki 閱讀)本次選配;若時間有限先略過,不擋主線。
- 狀態色是否要在 dark 也調亮(neon)?本次 dark 沿用溫和值即可,不追設計稿。
