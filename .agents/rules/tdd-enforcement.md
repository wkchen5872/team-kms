# TDD 執行規範

## 強制流程

實作任何 task 時，必須依序執行以下步驟：

1. **先讀取 task 的測試要求**（tasks.md 中的「測試要求」欄位）
2. **Red**：先寫失敗的測試，確認測試確實失敗後再繼續
3. **Green**：實作最小程式碼讓測試通過
4. **Refactor**：在測試全部通過的前提下重構
5. **確認**：執行完整測試套件，所有測試通過才能進下一個 task

## 禁止行為

- 禁止在測試通過前 commit 或標記 task 為完成
- 禁止在測試通過前進行下一個 task
- 禁止只寫 happy path 測試而跳過 edge case（若 task 測試要求有列出）
- 禁止修改第三方 skill 的內容（規則應放在 rules/ 而非 skill 內）

## 測試執行指令

依專案類型選擇：

```bash
# Python
python -m pytest -q

# Node.js
npm test
```
