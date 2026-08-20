# Quick Quote Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the multi-question `/quote` flow with a five-card picker (T-shirt / Hoodie / Sweatshirt / Hat / Other) followed by a minimal form: total quantity, color swatch, Front/Back/Both, optional art upload — live price with smart defaults for everything else.

**Architecture:** All changes live in one file, `client/src/pages/InstantQuotePage.tsx` (line numbers below refer to commit `24261ff`). The `ItemDraft`/`Inputs` state shape, `/api/quote/calculate` payload, and `/api/quote/save` payload are unchanged — removed questions simply keep their defaults (`qualityTier: 'Standard'`, `methodName: 'DTF'`, `colorsPerLocation: 1`, `rush: false`), and total quantity rides on the first row of the existing `sizes` array. No server, DB, or admin changes.

**Tech Stack:** React 18 + TypeScript, TanStack Query, Tailwind, lucide-react. Vite build gated by `tsc -b`.

## Global Constraints

- **No test framework exists in the client** (no vitest/jest, no test files) and `client npm ci` FAILS on the local Mac (lockfile missing rollup platform binaries). The verification cycle is therefore: edit → commit → **type-check on the droplet** (Task 4) → manual QA (Task 5). This is a documented deviation from per-task TDD, matching how this repo already works.
- Working tree: the git worktree at `/private/tmp/claude-501/-Users-kevinjohnson/718e9e7a-2d57-43f7-b750-51af11309cc2/scratchpad/tsb-main`, branch `quick-quote-simplify`.
- Droplet: `root@198.211.113.144`, live checkout `/var/www/tshirtbrothers` (do NOT build or switch branches inside it; use a worktree — Task 4).
- Deploy (after merge to main only): `ssh root@198.211.113.144 bash /var/www/tshirtbrothers/quick-deploy.sh`.
- Entry points that MUST keep working: `?service=dtf|embroidery|screen-print|dtg`, `?product=<ss_id>`, and the Design Studio handoff (`fromDesignStudio` navigation state). All three set `kind: 'catalog'` directly and bypass the card picker — none of the code paths that do this may be removed.
- The `SaveQuoteModal`, upload endpoint calls, lock-in flow, and admin editors are untouched.
- Commits end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Five-card picker replaces the Catalog/Custom fork and category screen

**Files:**
- Modify: `client/src/pages/InstantQuotePage.tsx:96` (ItemKind union), `:562-573` (itemValidity), `:610-644` (setItemKind/pickItemCategory), `:751` (ItemCard prop wiring), `:944-963` (collapsed summary), `:1054-1117` (unset + catalog-category JSX)

**Interfaces:**
- Consumes: existing `ItemDraft`, `normalizeSizesForProduct(product, garmentName, sizes)`, `setItems`, `Section`/`Chip` helpers.
- Produces: `function pickItemType(itemId: string, key: string): void` on the page component, passed to `ItemCard` as `onPickType: (key: string) => void` (replacing `onPickCategory`). `ItemKind` becomes `'unset' | 'catalog' | 'custom'`. Task 2 renders the catalog form only for `kind === 'catalog'` and returns to the picker via the existing `onSetKind('unset')`.

- [ ] **Step 1: Shrink the ItemKind union**

At line 91–96 replace the comment + type:

```tsx
// Which shape of question set the item is currently in.
//   unset   — the five-card "what are you quoting?" picker
//   catalog — minimal priced form (garment preset by the picked card)
//   custom  — free-form describe-it form ("Other" card)
type ItemKind = 'unset' | 'catalog' | 'custom';
```

- [ ] **Step 2: Replace `pickItemCategory` with `pickItemType`**

Delete the whole `pickItemCategory` function (lines 614–644, including its comment) and put this in its place:

```tsx
  // A card tap from the five-card picker. Garment cards drop straight into
  // the minimal priced form with garmentName preset; "other" routes to the
  // free-form custom flow.
  function pickItemType(itemId: string, key: string) {
    setItems((prev) => prev.map((it) => {
      if (it.id !== itemId) return it;
      if (key === 'other') return { ...it, kind: 'custom' };
      const garments: Record<string, string> = {
        tshirt: 'T-shirt',
        hoodie: 'Hoodie',
        sweatshirt: 'Sweatshirt',
        hat: 'Hat',
      };
      const g = garments[key] || 'T-shirt';
      const nextInputs = { ...it.inputs, garmentName: g };
      nextInputs.sizes = normalizeSizesForProduct(it.pickedProduct, g, it.inputs.sizes);
      return { ...it, kind: 'catalog', inputs: nextInputs };
    }));
  }
```

- [ ] **Step 3: Update itemValidity**

At line 566, `if (it.kind === 'unset' || it.kind === 'catalog-category') return false;` becomes:

```tsx
    if (it.kind === 'unset') return false;
```

(Leave the catalog location/quantity checks as they are — harmless belt-and-braces.)

- [ ] **Step 4: Rewire the ItemCard prop**

In the `<ItemCard>` call site (line 751): `onPickCategory={(cat) => pickItemCategory(item.id, cat)}` becomes `onPickType={(key) => pickItemType(item.id, key)}`.

In `ItemCard`'s destructuring and prop types (lines 875, 892): rename `onPickCategory` → `onPickType`, type `onPickType: (key: string) => void;`.

- [ ] **Step 5: Replace the two picker screens with five cards**

Delete BOTH JSX blocks: the `item.kind === 'unset'` Catalog/Custom two-button grid (lines 1050–1079 including its comment) and the entire `item.kind === 'catalog-category'` block (lines 1081–1117 including its comment). In their place, one block:

```tsx
      {/* Card picker — first thing a new item shows. One tap picks the
          product type; "Something else" routes to the custom flow. */}
      {item.kind === 'unset' && (
        <div>
          <p className="mb-3 text-sm text-gray-600">What are you quoting?</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { key: 'tshirt',     icon: '👕', label: 'T-shirt',        sub: 'Softstyle, Comfort Colors, Next Level' },
              { key: 'hoodie',     icon: '🧥', label: 'Hoodie',         sub: 'Pullover + zip options' },
              { key: 'sweatshirt', icon: '👚', label: 'Sweatshirt',     sub: 'Crewneck fleece' },
              { key: 'hat',        icon: '🧢', label: 'Hat',            sub: 'Caps, beanies, snapbacks' },
              { key: 'other',      icon: '✨', label: 'Something else', sub: 'Bags, koozies, patches — describe it' },
            ].map((card) => (
              <button
                key={card.key}
                type="button"
                onClick={() => onPickType(card.key)}
                className="group flex flex-col items-start gap-1.5 rounded-2xl border-2 border-gray-200 bg-white p-4 sm:p-5 text-left transition hover:border-orange-500 hover:bg-orange-50/40 active:scale-[0.99]"
              >
                <span className="text-2xl" aria-hidden="true">{card.icon}</span>
                <span className="font-semibold text-gray-900">{card.label}</span>
                <span className="text-[11px] text-gray-500 leading-snug">{card.sub}</span>
              </button>
            ))}
          </div>
        </div>
      )}
```

- [ ] **Step 6: Purge remaining `catalog-category` references**

Three spots (the union change makes tsc find them if missed):
1. Collapsed summary, lines 947–949: delete the `else if (item.kind === 'catalog-category')` branch.
2. Collapsed summary line 944–946: the `unset` branch's `detail` becomes `detail = 'Tap Edit to choose';`.
3. `PriceCard`, lines 2001–2005: delete the `if (it.kind === 'catalog-category')` block.

- [ ] **Step 7: Commit**

```bash
git add client/src/pages/InstantQuotePage.tsx
git commit -m "feat(quote): five-card product picker replaces catalog/custom fork"
```

---

### Task 2: Minimal catalog form — single quantity, Front/Back/Both, defaults for the rest

**Files:**
- Modify: `client/src/pages/InstantQuotePage.tsx:7-21` (imports), `:894-935` (ItemCard locals), `:1203+` (catalog form JSX: garment chips, quality tier, quantity grid, print method, locations, colors-per-location, turnaround sections)

**Interfaces:**
- Consumes: `onPatchInputs(patch: Partial<Inputs>)`, `onSetKind(kind: ItemKind)`, `sizeList: string[]`, `currentTier`, `noun`, existing color/upload/mockup/product-banner JSX (all unchanged).
- Produces: nothing new for later tasks — `Inputs` shape is unchanged, so the calc queries, `itemValidity`, and `SaveQuoteModal` payload keep working as-is. Defaults that now always ship: `qualityTier: 'Standard'` (unless `DEFAULT_INPUTS` overridden), `methodName` from `DEFAULT_INPUTS`/`?service=`, `colorsPerLocation: 1`, `rush: false`, `locations.sleeve: false`.

- [ ] **Step 1: Add the garment header chip with "change"**

Immediately inside the `{item.kind === 'catalog' && (<>` fragment (line 1203), BEFORE the mockup banner:

```tsx
      {/* Garment chip + change — returns to the card picker. State is
          preserved, so tapping a different card keeps qty/color/art. */}
      <div className="mb-4 flex items-center gap-2">
        <span className="inline-flex items-center gap-2 rounded-full bg-orange-100 px-3 py-1.5 text-sm font-semibold text-orange-800">
          <Shirt className="h-4 w-4" /> {item.pickedProduct?.name || inputs.garmentName}
        </span>
        <button
          type="button"
          onClick={() => onSetKind('unset')}
          className="text-xs text-orange-700 hover:text-orange-800 hover:underline"
        >
          change
        </button>
      </div>
```

- [ ] **Step 2: Delete the garment and quality-tier sections**

Delete the `!item.pickedProduct` "What kind of garment?" Section (lines 1260–1273 incl. comment) and the "Quality tier" Section (lines 1275–1307 incl. comment). `qualityTier` stays `'Standard'` from `DEFAULT_INPUTS`.

- [ ] **Step 3: Replace the per-size quantity grid with one input**

Replace the whole quantity `<Section>` (lines 1309–1371 incl. comment) with:

```tsx
        {/* Quantity — one total. Size breakdown is collected after the
            quote is accepted, so the customer isn't blocked on it here. */}
        <Section icon={<span className="text-xl">#</span>} title={`How many ${noun}s?`}>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={liveTotalQty || ''}
            onChange={(e) => {
              const qty = Math.max(0, parseInt(e.target.value) || 0);
              onPatchInputs({ sizes: [{ size: sizeList[0] || 'S', quantity: qty }] });
            }}
            placeholder="e.g. 24"
            className="w-32 text-center rounded-lg border border-gray-300 px-2 py-3 text-base focus:outline-none focus:ring-2 focus:ring-orange-500"
            style={{ fontSize: '16px' }}
          />
          <p className="mt-2 text-xs text-gray-500">
            We'll collect your size breakdown when you approve the quote.
            {currentTier && currentTier.discount_pct > 0 && (
              <span className="ml-2 text-green-700 font-medium">
                {Math.round(currentTier.discount_pct * 100)}% volume discount applied
              </span>
            )}
          </p>
        </Section>
```

- [ ] **Step 4: Replace print locations with Front/Back/Both chips**

Replace the locations `<Section>` (lines 1485–1507, keeping the surrounding `!(item.mockupUrl || item.mockupUrlBack) &&` guard) with:

```tsx
        {/* Print sides — single choice. Sleeve prints and multi-location
            combos are handled by the shop after review. */}
        {!(item.mockupUrl || item.mockupUrlBack) && (
        <Section icon={<Palette className="h-5 w-5" />} title="Print on the…">
          <div className="grid grid-cols-3 gap-2">
            {([
              ['front', 'Front'],
              ['back', 'Back'],
              ['both', 'Front + Back'],
            ] as const).map(([key, label]) => {
              const active = key === 'both'
                ? inputs.locations.front && inputs.locations.back
                : key === 'front'
                  ? inputs.locations.front && !inputs.locations.back
                  : inputs.locations.back && !inputs.locations.front;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => onPatchInputs({
                    locations: { front: key !== 'back', back: key !== 'front', sleeve: false },
                  })}
                  className={`rounded-xl border-2 px-3 py-3 text-sm font-medium transition ${
                    active ? 'border-orange-600 bg-orange-600 text-white shadow-sm' : 'border-gray-300 text-gray-700 hover:border-orange-400 hover:bg-orange-50/40'
                  }`}
                >
                  {active && <Check className="inline h-3.5 w-3.5 mr-1" />}
                  {label}
                </button>
              );
            })}
          </div>
        </Section>
        )}
```

- [ ] **Step 5: Delete the print-method, colors-per-location, and turnaround sections**

Delete the "Print method" Section (lines 1467–1483 incl. comment), the `isScreenPrint` colors-per-location Section (lines 1509–1528 incl. comment), and the "When do you need it?" Section (lines 1530–1556 incl. comment). `methodName` (default `DTF`, or whatever `?service=` preset), `colorsPerLocation: 1`, and `rush: false` continue to ship to `/api/quote/calculate` and `/api/quote/save` from state.

- [ ] **Step 6: Remove now-dead locals and imports**

In `ItemCard`: delete `isScreenPrint` (line 896), `numLocations` (line 898, its only remaining reader was the deleted qty-section warning), `visibleSizeRows` (lines 913–918, replaced by `liveTotalQty`), `isOneSize` (line 908), and `garmentNames` (lines 920–928). Keep `sizeList`, `colorList`, `liveTotalQty`, `currentTier`, `noun`.

In the lucide import (lines 7–21): remove `Layers`, `Printer`, `Zap` (Palette is still used by the print-sides Section; `ChevronDown`, `Check`, `Shirt`, `Upload`, `XIcon`, `Plus`, `Trash2`, `PenSquare`, `Loader2` all remain used).

Also delete the module-level `Chip` component (line 2086) — its only two consumers were the garment chips and print-method chips, both deleted above.

Then grep the file for leftovers: `grep -n "isScreenPrint\|visibleSizeRows\|isOneSize\|garmentNames\|catalog-category\|Chip\b\|Layers\|Printer\|Zap" client/src/pages/InstantQuotePage.tsx` — expect zero hits (a `Zap`/`Printer` hit inside a string or other component means look before deleting).

- [ ] **Step 7: Commit**

```bash
git add client/src/pages/InstantQuotePage.tsx
git commit -m "feat(quote): minimal catalog form — total qty, front/back/both, smart defaults"
```

---

### Task 3: Price card + summaries + copy catch up with the simpler flow

**Files:**
- Modify: `client/src/pages/InstantQuotePage.tsx:715-718` (hero), `:954-962` (collapsed summary), `:1971-1975` (validity chip), `:1979-1984` (multi-item details), `:2006-2008` (PriceCard row labels)

**Interfaces:**
- Consumes: everything already in place; no new names.
- Produces: nothing new.

- [ ] **Step 1: Hero subtitle**

Line 717: `Add multiple products — price updates live.` becomes `Pick a product, tell us how many — your price updates live.`

- [ ] **Step 2: Collapsed item summary drops the jargon**

Lines 955–962 (the final `else` branch): `productLabel` keeps the picked product name but the fallback `` `${inputs.qualityTier} ${inputs.garmentName}` `` becomes just `inputs.garmentName`. The `detail` line drops the method:

```tsx
      productLabel = item.pickedProduct ? item.pickedProduct.name : inputs.garmentName;
      const locs: string[] = [];
      if (inputs.locations.front) locs.push('Front');
      if (inputs.locations.back) locs.push('Back');
      detail = `${liveTotalQty} pcs · ${inputs.color}${locs.length ? ' · ' + locs.join(' + ') : ''}`;
```

- [ ] **Step 3: PriceCard rows match**

Line 2007: `` const label = `${i + 1}. ${it.pickedProduct?.name || `${it.inputs.qualityTier} ${it.inputs.garmentName}`}`; `` becomes `` const label = `${i + 1}. ${it.pickedProduct?.name || it.inputs.garmentName}`; ``
Line 2008: `` const sub = `${qty} pcs · ${it.inputs.color} · ${it.inputs.methodName}`; `` becomes `` const sub = `${qty} pcs · ${it.inputs.color}`; ``

- [ ] **Step 4: Collapse the multi-item breakdown by default**

Line 1980: `<details className="mt-4 group" open>` → `<details className="mt-4 group">` and line 1983's summary text `Items` → `See details`. (`SingleItemBreakdown`'s `<details>` at line 2028 is already collapsed — leave it.)

- [ ] **Step 5: Soften the invalid-items chip**

Lines 1971–1975: `Add qty + location to remaining` becomes `Finish the remaining item${''}s` — locations can no longer be empty, so quantity is the only gap:

```tsx
        {!allValid && (
          <span className="rounded-full bg-amber-50 px-2.5 py-0.5 sm:px-3 sm:py-1 text-amber-800 border border-amber-200">
            Add a quantity to the remaining items
          </span>
        )}
```

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/InstantQuotePage.tsx
git commit -m "feat(quote): price card + summaries match the simplified flow"
```

---

### Task 4: Type-check the branch on the droplet (build gate before merge)

The Mac cannot install client deps; the droplet has a working `node_modules`. Use a git worktree + symlink so the live checkout is never touched.

**Files:** none (verification only)

- [ ] **Step 1: Push the branch**

```bash
git push origin quick-quote-simplify
```

- [ ] **Step 2: Droplet worktree + tsc**

```bash
ssh root@198.211.113.144 '
  cd /var/www/tshirtbrothers &&
  git fetch origin quick-quote-simplify &&
  rm -rf /tmp/qqs && git worktree add /tmp/qqs origin/quick-quote-simplify &&
  ln -s /var/www/tshirtbrothers/client/node_modules /tmp/qqs/client/node_modules &&
  ln -s /var/www/tshirtbrothers/node_modules /tmp/qqs/node_modules 2>/dev/null;
  cd /tmp/qqs/client && npx tsc -b --force; echo "tsc exit: $?"
'
```

Expected: `tsc exit: 0`. On errors: fix locally, commit, push, re-run (the worktree re-add picks up the new commit). Note: if the design-studio workspace package needs its own node_modules symlink, add `ln -s /var/www/tshirtbrothers/packages /tmp/qqs/packages`-style links as the error messages direct — resolve whatever `tsc` reports, don't guess.

- [ ] **Step 3: Clean up the droplet worktree**

```bash
ssh root@198.211.113.144 'cd /var/www/tshirtbrothers && git worktree remove --force /tmp/qqs'
```

---

### Task 5: Merge, deploy, manual QA

- [ ] **Step 1: Merge to main and push**

```bash
git checkout main 2>/dev/null || git switch -c main origin/main
git pull --ff-only origin main
git merge --no-ff quick-quote-simplify -m "feat: simplify Quick Quote — card picker + minimal form

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
git push origin main
```

(If Kevin prefers a PR for review, stop after pushing the branch and open one instead — ask before merging.)

- [ ] **Step 2: Deploy**

```bash
ssh root@198.211.113.144 bash /var/www/tshirtbrothers/quick-deploy.sh
```

Expected: build passes (`tsc -b` gate), pm2 restart OK. On build failure dist is untouched (site keeps old build) — fix and redeploy.

- [ ] **Step 3: Manual QA checklist (phone-width viewport)**

On https://tshirtbrothers.com/quote:
1. Five cards render; tapping **T-shirt** → minimal form: garment chip + change, single qty input, color swatches (Black preselected), Front/Back/Both (Front active), upload box, price card.
2. Enter qty 24 → live price appears; **Both** → price increases (2 locations); breakdown collapsed behind "see details".
3. **change** → back to cards; tap **Hat** → qty preserved, one-size handled, noun says "hats".
4. **Something else** card → custom form (description/qty/upload/notes), submit path shows "Send Quote to Us for Pricing".
5. `?service=embroidery` → skips cards, lands in form; price reflects embroidery (compare against a DTF quote of the same qty).
6. `?product=<a real ss_id from the catalog>` → product banner, product's real colors only.
7. Design Studio → "Get Price" handoff → mockup banner, locations derived, no color/upload sections.
8. **Add another product** → new card-picker item; collapsed summary of item 1 reads `24 pcs · Black · Front`.
9. Submit a real quote (name/email/phone) → success toast; verify it appears in the admin quotes list with correct qty/color/locations.
10. Lock-In button appears for a priced quote (do NOT complete the Stripe deposit).

- [ ] **Step 4: Report results to Kevin** — screenshots of the card picker + minimal form, note anything that felt off, list the QA items verified.
