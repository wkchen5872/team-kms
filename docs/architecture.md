# 🏗️ Project Architecture Guide

*This file defines the structural integrity of the project. AI agents must respect these boundaries.*

## 1. Directory Structure & Responsibilities
*(To be populated during project onboarding)*
- `/src`: Source code root.
- `/docs`: Project documentation.
- `/openspec`: Specifications and change management.
- `/scripts`: Automation and workflow scripts.

## 2. Dependency Rules
- **Layered Access:** Higher-level modules can call lower-level ones, but not vice versa.
- **External Isolation:** All external API calls and DB operations must be abstracted behind interfaces/services.

## 3. Technology Stack
- **Runtime:** (e.g., Node.js, Python, Go)
- **Framework:** (e.g., Express, FastAPI)
- **Verification Tools:** (e.g., Jest, Pytest, ESLint)
