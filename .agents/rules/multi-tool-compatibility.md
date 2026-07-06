# Hook 腳本多工具相容性規範

> **適用範圍：** 只在撰寫 Hook 腳本（`.claude/settings.json` 的 PreToolUse/PostToolUse 等）或 AI CLI 整合腳本時適用。一般業務功能無需遵循此規範。

## 核心要求

Hook 腳本以 **Claude Code** 為主要工具，並應可攜到任何其他 AGENTS.md-aware 的 AI CLI/IDE（best-effort，不綁定特定次要工具）。不要為單一具名次要工具寫死路徑或偵測邏輯。

## 實作準則

1. **環境偵測**：優先檢查 `CLAUDE_PROJECT_DIR` → fallback `PWD`（其他工具通常於 workspace 內執行，`PWD` 即足夠）
2. **stdin 優先**：Hook 腳本應支援 stdin 接收 JSON（Claude Code Hook 格式）
3. **Silent Fail**：背景 Hook 失敗不應阻斷主流程
4. **Idempotency**：安裝與更新腳本需冪等
