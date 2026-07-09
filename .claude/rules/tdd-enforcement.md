# TDD 執行規範

## 強制流程

實作任何 task 時，必須依序執行以下步驟：

1. **先讀取 task 的測試要求**（tasks.md 中的「測試要求」欄位）
2. **Red**：先寫失敗的測試，**實際執行**並在對話中貼出原始失敗輸出（失敗測試名 + 錯誤訊息或非零 exit code），再繼續。以「已確認測試失敗」等自述代替實際輸出視為違規。
3. **Green**：實作最小程式碼讓測試通過
4. **Refactor**：在測試全部通過的前提下重構
5. **確認**：執行完整測試套件，所有測試通過才能進下一個 task
6. **revert-check**：標記 task 完成前，暫時 revert 該 task 的實作（stash 或註解），確認相關測試由綠轉紅——證明測試確實在守護該行為——再還原實作。若 revert 後測試仍綠，該測試無效，需修正後才可標記完成。

## 禁止行為

- 禁止在測試通過前 commit 或標記 task 為完成
- 禁止在測試通過前進行下一個 task
- 禁止只寫 happy path 測試而跳過 edge case（若 task 測試要求有列出）
- 禁止修改第三方 skill 的內容（規則應放在 rules/ 而非 skill 內）

## 存活 mutant 的 triage

若對變更範圍跑過 `/mutation-check` 並報告存活 mutant，每個存活 mutant 必須經
triage（補測試殺死 / 標記 equivalent / 記錄理由的 skip）後，該範圍實作才算完成。
mutation score **不作為自動 gate**——triage 是 advisory 追蹤，不阻擋 commit。

## 測試執行指令

依專案類型選擇：

```bash
# Python
python -m pytest -q

# Node.js
npm test
```
