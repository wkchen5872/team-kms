# OpenSpec Commit 規範

## 完整流程與 Commit 時機

一個 change 從頭到尾最少產生 **2-3 個獨立 commit**：

```
1. [建立階段] /opsx:new 或 /opsx:ff
   → docs(<change-id>): initialize OpenSpec artifacts
     時機：完成 proposal.md、design.md、specs/、tasks.md 後

2a. [實作階段 + 歸檔階段 分開] /opsx:apply → /opsx:archive
   → feat(<change-id>): <實作描述>          ← 程式碼完成後
   → docs(<change-id>): archive completed change  ← archive 後

2b. [實作階段 + 歸檔階段 合併] /opsx:apply → /opsx:archive
   → feat(<change-id>): implement and archive <change-id>
     時機：程式碼實作完成且 archive 後一併提交
     注意：此情境下 openspec/ 歸檔變更與程式碼變更合入同一 commit
```

## Commit 訊息格式

**規格文件（建立 / 歸檔階段）：**
```
docs(<change-id>): <description>
```

**程式碼實作（apply 階段）：**
```
feat(<change-id>): <description>
fix(<change-id>): <description>
```

- **scope**：完全對應 `openspec/changes/` 的資料夾名稱
- **description**：動詞開頭（initialize、refine、define、implement、fix、archive）

## 常用範例

| 情境 | Commit 訊息 |
|------|------------|
| 初始化 artifacts | `docs(parallel-init-download): initialize OpenSpec artifacts` |
| 修改設計方案 | `docs(parallel-init-download): refine design.md architecture` |
| 定義技術規格 | `docs(parallel-init-download): define delta specs for executor` |
| 更新任務進度 | `docs(parallel-init-download): update task progress in tasks.md` |
| 實作新功能 | `feat(parallel-init-download): implement concurrent runner with ThreadPoolExecutor` |
| 修正 bug | `fix(parallel-init-download): fix thread-safety issue in result accumulation` |
| 歸檔完成變更 | `docs(parallel-init-download): archive completed change` |

## 執行規範

- **禁止省略 scope**：`change-id` 不可省略
- **apply 後 type 用 feat/fix**：程式碼變更不使用 `docs`
- **路徑核對**：docs commit 的檔案必須位於 `openspec/changes/{CHANGE_NAME}/` 下

## 納入版本控制的檔案

- `openspec/changes/{CHANGE_NAME}/proposal.md`
- `openspec/changes/{CHANGE_NAME}/design.md`
- `openspec/changes/{CHANGE_NAME}/specs/**/*.md`
- `openspec/changes/{CHANGE_NAME}/tasks.md`
- `openspec/changes/{CHANGE_NAME}/.openspec.yaml`
