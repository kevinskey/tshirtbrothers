# Quick Quote Simplification — Design

**Date:** 2026-08-15
**Scope:** Client-side reshaping of `client/src/pages/InstantQuotePage.tsx` only. No server, DB, or admin changes.

## Problem

The `/quote` page asks a customer roughly 9–10 questions before they see a price:
Catalog-vs-Custom fork, six-category picker, garment type, quality tier
(Standard/Premium/Ultra), per-size quantity grid (8 sizes), color, graphic
upload, print method (Screen Print/DTF/DTG/Embroidery), print locations,
colors per location, and rush turnaround. Several of these (quality tier,
print method, colors per location) are printer decisions most customers
cannot answer. Customers report the flow is too complicated.

## Goal

A customer taps one card, answers three things (how many, color, print
where), optionally uploads art, sees a live price, and submits. Under a
minute on a phone.

## Design

### Step 1 — Card picker

Landing on `/quote` with no URL hints shows five large tap-friendly cards:

- **T-shirt**
- **Hoodie**
- **Sweatshirt**
- **Hat**
- **Other**

This replaces both the current "Catalog or Custom?" fork (`kind: 'unset'`)
and the six-category list (`kind: 'catalog-category'`). Card styling matches
the clean white-card mobile look used on the account page (rounded cards,
large touch targets, icon + label).

- T-shirt / Hoodie / Sweatshirt / Hat set `kind: 'catalog'` with the
  matching `garmentName` (Hat uses the existing one-size handling).
- **Other** sets `kind: 'custom'` — the existing free-form path
  (description, quantity, optional reference photo, notes) unchanged.
- Bags/accessories customers use **Other**.

### Step 2 — Minimal catalog form

One compact screen, replacing the current multi-section form:

1. Header chip: garment icon + name + a **change** control that returns to
   the card picker (resets that item's kind to the picker state, preserving
   entered values where they still apply).
2. **How many?** — a single total-quantity number input. The per-size grid
   is removed from the customer flow; sizes are collected after the quote is
   accepted (admin follow-up — quotes are admin-reviewed already, and the
   admin quote editor is untouched).
3. **Color** — one row of color swatches, Black preselected. Uses the
   existing `COLOR_OPTIONS` palette (or the picked product's real colors
   when a product is attached via URL/Design Studio).
4. **Print where?** — three chips: **Front / Back / Both** (mapping to the
   existing `locations` object; sleeve option removed from customer flow).
5. **Upload your art (optional)** — the existing uploader, unchanged.

Removed from the customer flow entirely (calculator gets defaults):

| Removed question | Default sent to `/api/quote/calculate` |
|---|---|
| Quality tier | `Standard` |
| Print method | `DTF` (unless `?service=` preselects another) |
| Colors per location | `1` |
| Rush / turnaround | standard (`rush: false`) |
| Per-size grid | total quantity mapped onto the first size row |

### Price card

The live price card stays, showing **per-item price and total** (plus
turnaround days). The itemized breakdown (garment/print/setup/discount/
markup rows) collapses behind a small "see details" toggle, collapsed by
default.

### Submit

The existing `SaveQuoteModal` (name / email / phone / notes) is unchanged.
**Add another item** remains as a small link below the form; it appends a
new item starting at the card picker, and the existing one-expanded-at-a-
time card behavior stays.

### Entry points that keep working unchanged

- `?service=dtf|embroidery|screen-print|dtg` — preselects print method and
  skips the card picker for item 1 (as today).
- `?product=<ss_id>` — attaches the catalog product, restricts colors/sizes
  to the product's real options, skips the card picker (as today; the size
  restriction now only affects which single quantity/color options exist,
  since the grid is gone).
- Design Studio handoff (`fromDesignStudio` navigation state) — mockup
  banner, attached designs, derived front/back locations, product color:
  all unchanged, lands directly in the minimal form.

## Error handling

Unchanged from today: calculate errors surface in the price card; upload
errors toast; the save modal validates name/email/phone. Quantity input
guards against 0/empty exactly as `itemValidity` does now.

## Testing

- Droplet `tsc -b` gates the build (client `npm ci` fails locally — build
  validation happens on the droplet via `quick-deploy.sh`).
- Manual QA before deploy: card flow for each of the five cards, live price
  updates, each entry-point URL (`?service=`, `?product=`), Design Studio
  handoff, multi-item add/remove, save modal submit, admin side shows the
  submitted quote correctly.

## Out of scope

- Server pricing logic, quotes schema, emails, admin editors.
- Collecting per-size breakdowns at acceptance time (existing admin
  follow-up covers it).
- Any change to `/design`, catalog pages, or their CTAs.
