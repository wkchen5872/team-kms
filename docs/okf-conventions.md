---
type: Reference
title: Docs OKF Conventions
description: Project-specific OKF v0.1 authoring rules for this repo's docs/ bundle.
tags: [meta, conventions, okf]
timestamp: 2025-07-02T00:00:00Z
---

<!-- Managed by wk-agent-ops · do not edit here — re-running install.sh overwrites this file. -->

# OKF v0.1 — 本專案文件規範

Full spec: <https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md>

## 必要 Frontmatter（所有 .md 除 index.md / log.md 外）

```yaml
---
type: <見下表>        # REQUIRED
title: <顯示名稱>
description: <一行摘要>
tags: [<tag1>, <tag2>]
timestamp: <ISO 8601>  # e.g. 2025-07-02T00:00:00Z
---
```

## 本專案核准的 type 值

| type | 使用時機 |
|------|---------|
| `Architecture` | 系統設計、模組邊界 |
| `Reference` | 慣例、風格指南、元文件 |
| `Playbook` | 操作手冊、SOP |
| `Spec` | 需求規格（對應 OpenSpec） |
| `API` | API endpoint 說明 |
| `Decision` | ADR（架構決策紀錄） |

## Cross-link 規則

優先使用 bundle-relative 絕對路徑（§5.1）：

```markdown
見 [架構說明](/docs/architecture.md)
```

## Citations 規則（§8）

有外部來源依據的聲明，在文末加 `# Citations` 區塊：

```markdown
# Citations

[1] [OKF SPEC](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md)
```

## 既有文件遷移

`architecture.md` 和 `conventions.md` 需補上 frontmatter 才符合 OKF conformance（§9 要求每個非 reserved .md 有 `type`）。
