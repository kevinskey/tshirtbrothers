# DTF Gang Sheet Store — Phase 2 (Customer Builder) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox syntax.

**Goal:** Let customers build a gang sheet in the browser at /dtf/builder and check out through the existing /dtf pipeline.

**Architecture:** Reuse everything. The existing admin `GangSheetBuilder` gains a `mode="customer"` that talks to new customer-scoped sheet endpoints (`gang_sheets` rows filtered by `created_by`), and its "Checkout" button exports the canvas PNG client-side, POSTs it to the EXISTING `/api/gangsheet-store/upload` (keeping the dims-in-key security model), writes the EXISTING DtfStorePage sessionStorage upload stash, and navigates to `/dtf` — where the restored stash + auto-set length drop the customer straight into the proven checkout. No new payment surface, no schema change.

**Tech Stack:** unchanged.

## Global Constraints
- Same rules as Phase 1: no npm locally except `npm install --legacy-peer-deps` in the worktree IS allowed for running real `tsc -b` (proven 08-16); node --check server files; droplet tsc is the deploy gate; one worktree branch `dtf-builder`; commits carry the Co-Authored-By trailer.
- Builder requires login (any role); own-sheets only, enforced SERVER-side by `created_by = req.user.id`.
- Customer sheet cap: 20 rows per user (400 'Sheet limit reached — delete an old sheet first').
- Admin routes (`/api/admin/gangsheets`, `/admin/gangsheet`) unchanged.
- Very long sheets may fail client-side export on weak devices — catch and show: "This sheet is too large to export in your browser — save it and use the Upload lane with your own file, or try on a desktop."

### Task 1: Server — customer sheet endpoints
**Files:** Modify `server/routes/gangsheetStore.js`.
**Produces:** All `authenticate`-guarded (NOT adminOnly), all scoped `created_by = req.user.id`:
- `GET /sheets` → own sheets (id, name, sheet_length_ft, status, updated_at; ORDER BY updated_at DESC LIMIT 20)
- `POST /sheets` `{name?}` → new row (enforce 20-row cap with a COUNT first) with `created_by = req.user.id`
- `GET /sheets/:id` → full own row (404 when not found OR not owner — same response, no existence leak)
- `PUT /sheets/:id` `{name?, sheet_length_ft?, pricing_tier?, total_cost?, designs?, layout_json?, status?}` → COALESCE update mirroring `server/routes/gangsheet.js:42`'s pattern, WHERE id AND created_by
- `DELETE /sheets/:id` → own-row delete
Steps: read gangsheet.js for the column/COALESCE idiom; append routes; `node --check`; commit `feat(dtf-builder): customer-scoped sheet endpoints`.

### Task 2: Client — customer builder mode + checkout handoff
**Files:** Modify `client/src/components/gangsheet/GangSheetBuilder.tsx` (add `mode?: 'admin' | 'customer'` prop, default 'admin'); Create `client/src/pages/DtfBuilderPage.tsx`; Modify `client/src/pages/DtfStorePage.tsx`, `client/src/App.tsx`, `client/src/pages/DtfSuccessPage.tsx` (only if the stash shape changes — avoid), Navbar catalogue? NO — just a "Build your sheet online →" card/link on /dtf near the upload dropzone, and on the builder a "back to /dtf" link.
**Behavior:**
- `mode='customer'`: API base switches from `/api/admin/gangsheets` to `/api/gangsheet-store/sheets`; the sheet-list UI shows only own sheets; any admin-only affordances hidden (read the component first and enumerate them in the report); page chrome header simplified ("Design your gang sheet — $/ft updates as you go", price ticker stays).
- New button `Checkout this sheet` (customer mode only): runs the existing full-res export path but instead of download: dataURL → `fetch(dataUrl)` → blob → FormData POST to `/api/gangsheet-store/upload` → on success write the DtfStorePage stash key (same shape: `{file_key, width_px, height_px, fileName: '<sheet name>.png', at: Date.now()}`) → `navigate('/dtf?from=builder')`. Surface upload errors inline (the server's message). Wrap export in try/catch with the too-large message from Global Constraints.
- `DtfStorePage.tsx`: when restoring the stash, if `lengthFt` is still at its default AND the stash has `height_px`, auto-set `lengthFt = clamp(ceil(height_px/3600), min_ft, max_ft)`; when `?from=builder`, show a small "Your built sheet is loaded — pick turnaround and check out" banner. Also add the "Or build your sheet online →" link (to /dtf/builder) near the upload section.
- `DtfBuilderPage.tsx`: login gate (any authenticated user: token + `/api/auth/me` ok → render `<GangSheetBuilder mode="customer" />`; no token → redirect `/auth?redirect=/dtf/builder`); route `/dtf/builder` in App.tsx.
- Umami: `dtf-builder-open`, `dtf-builder-checkout`.
Steps: read GangSheetBuilder fully first; implement; run REAL `npm install --legacy-peer-deps && npx tsc -b --force` in client/ (allowed per constraints — revert package-lock.json changes after); commit `feat(dtf-builder): customer builder mode + checkout handoff`.

### Task 3: Ops — deploy + verify
Droplet tsc (worktree+symlink trick) → ff-merge to main → quick-deploy → pm2 log check → verify: /dtf/builder redirects anonymous to /auth; GET /api/gangsheet-store/sheets 401 without token; /dtf shows the builder link. Browser QA of the full build-and-checkout loop needs a logged-in session — Kevin.
