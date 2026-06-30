# Hook 腳本多工具相容性規範

> **適用範圍：** 只在撰寫 Hook 腳本（`.claude/settings.json` 的 PreToolUse/PostToolUse 等）或 AI CLI 整合腳本時適用。一般業務功能無需遵循此規範。

## 核心要求

Hook 腳本需同時支援以下工具環境：

- **Claude Code** — 主要工具
- **Antigravity** — Google agentic IDE（次要環境）

## 實作準則

1. **環境偵測**：優先檢查 `CLAUDE_PROJECT_DIR` → fallback `PWD`（Antigravity 於 workspace 內執行）
2. **stdin 優先**：Hook 腳本應支援 stdin 接收 JSON（Claude Code Hook 格式）
3. **Silent Fail**：背景 Hook 失敗不應阻斷主流程
4. **Idempotency**：安裝與更新腳本需冪等
