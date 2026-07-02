## 1. Implement

- [x] 1.1 `wikis/page.tsx`: add "+ New" button (header) + empty-state CTA opening a create dialog (reuse `components/ui/dialog`)
- [x] 1.2 Wire dialog submit → `useKBStore.createKB(name)` → on success `router.push('/wikis/<slug>')`; on error show toast
- [x] 1.3 Render list only when KBs exist; keep loading state

## 2. Verify

- [x] 2.1 Web `tsc` clean
- [x] 2.2 (user, verified) E2E: fresh account (zero KBs) → `/wikis` → create → lands in new workspace; create another via "New"; duplicate name → error toast
