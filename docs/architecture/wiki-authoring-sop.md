---
type: Guide
title: Wiki 整理 SOP — Claude 端 model / effort / thinking 設定
description: 用 Claude(經 MCP)整理 KB wiki 時，如何選 model、effort、thinking 以兼顧品質與 token 效率，含每次整理的開場 SOP。
tags: [guide, mcp, wiki, sop, cost]
timestamp: 2026-07-03T00:00:00Z
---

# Wiki 整理 SOP — Claude 端設定

[← 返回索引](/docs/architecture.md) · 相關：[mcp-server.md](/docs/architecture/modules/mcp-server.md)、[workflows.md](/docs/architecture/workflows.md)

> 適用對象：**操作 Claude(Desktop / client）整理某個 KB 的人**。這不是後端設定——
> 後端零 LLM 呼叫；這裡談的是「你在 client 端跑 guide/ingest 時的 model 與推理旋鈕」。

## 任務形狀決定旋鈕

guide/ingest 的循環是：

```
讀 source(MCP read) → 理解 → 寫 wiki 頁(create/edit) → 檢查 citation → 下一份
        └─────────── 66 份來源 × 十幾頁，大量工具往返 ───────────┘
```

特徵：**大量工具往返 + 結構化寫作 + 嚴格遵守慣例**(frontmatter / citation / 每頁一個視覺元素)。
它要的是「穩定的指令遵循 + 好的綜整」，**不是難的推理謎題**。這決定了每個旋鈕怎麼開。

## 為什麼「Sonnet + max + thinking」是最糟組合

```
Sonnet  max effort + thinking
   ↑慢的來源    ↑慢的來源      ← 兩個延遲稅都付了
   └─────────────┬─────────────┘
        但 Sonnet 的品質天花板  ← 拿不到對應的品質回報
        = 慢的代價全付、品質沒拿到（worst of both）
```

- **很久** = max effort + thinking 的延遲，× 幾百個步驟複利放大。
- **效果沒很好** = 多來源綜整 + 嚴格格式，超過 Sonnet 的天花板。

## 建議設定

| 階段 | Model | Effort | Thinking |
|---|---|---|---|
| 規劃整站結構(一次) | Opus 4.8 | high | **ON** |
| 逐頁 ingest/書寫(主循環) | Opus 4.8 | **medium** | **OFF** |
| lint / 修引用 | Opus 4.8 | low–medium | OFF |

Desktop 不好中途換設定時，**單一實用預設就用「Opus 4.8 / medium / thinking off」跑主循環**，
只有要它「先規劃整站結構」時手動開 thinking。這通常又快又好，跟 worst-of-both 相反。

### 旋鈕理由速查

- **Effort 不要 max**：循環裡多數步驟是機械路由(「接下來 read 還是 create」)，max 會在瑣事上燒推理 token 又慢。只有結構/引用出錯時再局部拉 high。
- **Thinking 主循環關**：逐頁書寫時 thinking 多半只是重想一遍已知的事，換來延遲。→ 見下方「什麼時候再開 thinking」。
- **Model 選 Opus**：品質敏感 + 嚴格格式的任務，Opus 慣例遵循更穩、第一次就對的機率高 → 少一輪修正；Sonnet 的「便宜」常被重工 token 吃掉。

## 什麼時候再開 thinking（提醒）

主循環預設 **OFF**；**只有以下時機手動開 ON**，做完就關回去：

1. **開場規劃整站結構**——「這個 KB 要拆哪些 overview / concepts / entities / log 頁、彼此怎麼引用」。
2. **綜整一頁牽涉多份互相矛盾的來源**，需要判斷取捨時。
3. **解 citation / 引用圖衝突**(例如同一實體多份來源、該引哪一份)。

一句話：**thinking 留給「想清楚要做什麼」，不要花在「照著做」。**

## 每次整理 KB 的開場 SOP

1. **開新對話**(不要接續舊的——舊脈絡會帶著過時結論漂，見 [workflows.md](/docs/architecture/workflows.md) 的引用說明)。
2. 設 **Opus 4.8 / medium / thinking off**(要先規劃就臨時開 thinking，規劃完關掉)。
3. 貼開場白：

> 先用 `team-kms:guide` 了解 wiki 結構與工作流程，再用 `team-kms:get_project_instruction` 帶 `knowledge_base="<slug>"` 讀該 KB 的慣例，並照它整理這個 KB 的 wiki。
> 注意：citation parser 已修好——含空格與 ` - ` 的檔名(如 `2025 - 台糖 - 陳平段.md`)會照原樣正確追蹤，
> 全形 `；` 複合來源也會自動拆。**不要**把 footnote 檔名的空格改成底線(真實檔名就是有空格，改了反而斷)。
> 判斷「未引用」請用 `search(mode="references", query="uncited")` 查引用圖，不要用肉眼看檔名。

4. 若要刷新既有頁面的引用圖(如剛改過 parser)：呼叫 `POST /v1/knowledge-bases/<slug>/rebuild-references`，
   不必動任何 footnote 文字。

## 最大的省 token 槓桿不是旋鈕

旋鈕省邊際 token；真正大頭是**避免重工 + 讀得聰明**：

1. **避免重工**：第一次就照 guide 寫對 > 反覆被 lint/人退回重改。靠 Opus + 清楚的 project prompt，不是靠 effort。
2. **讀得聰明**：`read` 支援 glob 批次與 page range；別讓它把同一份大 PDF 反覆整份讀進來——那個 input token 才是成本主體。
3. **別做白工**：基於錯誤前提的整輪重寫(例如「把空格改底線」)是最大的 token 黑洞。**開新對話 + 正確框架**比任何旋鈕都省。
