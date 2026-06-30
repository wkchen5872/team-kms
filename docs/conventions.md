# 📝 Coding Conventions & Styles

*This file defines the "Muscle Memory" for AI agents. Adhere to these styles strictly.*
*Starting template — customize per project, and keep only the language(s) you use.*

## 1. Naming Conventions

Follow the host language's idiomatic convention — do not impose another language's style.

| Element | Python | JS / TS |
|---------|--------|---------|
| Variables / Functions | `snake_case` | `camelCase` |
| Classes / Types | `PascalCase` | `PascalCase` |
| Constants | `UPPER_SNAKE_CASE` | `UPPER_SNAKE_CASE` |
| Files | `snake_case` | `kebab-case` |

## 2. Prohibited Patterns (Anti-Patterns)
- ❌ No stray debug output in production code (Python `print`, JS `console.log`) — use a logger.
- ❌ No hardcoded secrets or sensitive configs (use environment variables).
- ❌ No logic-heavy constructors.

## 3. Error Handling
- Use structured error responses.
- Always handle edge cases and null/None/undefined checks.

## 4. Documentation
- Document all exported functions and classes (Docstrings for Python, JSDoc for JS/TS).
- Keep comments meaningful (Why, not What).
