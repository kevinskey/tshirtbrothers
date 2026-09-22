# CGC Holiday Gifts — launch worksheet

Campaign: **“Give Something Only You Could Give.”**
Collection lives at `/holiday` (customgiftclub.com and tshirtbrothers.com/gift-club/holiday).
Launch config: `server/lib/cgcHoliday.js` — flip a product's `published: true`
only when every column in its row below is filled and the sample is approved.

Account costs and listed retails below were read from `jds_products` on
**2026-09-22** (cost_cents = JDS one-piece cost at publish time). Listed
retail is the 3× bulk-publish price already on the site — treat it as a
**working target, not a verified margin**, until engraving time and
packaging cost are measured. The $10.00 engraving fee
(`CGC_PERSONALIZATION_FEE_CENTS`) is added on top of retail at checkout.

## 1. Personalized Tumbler — Polar Camel 20 oz. Ringneck, Standard Lid

| Variant | JDS SKU | Account cost | Listed retail |
|---|---|---|---|
| Black | LTM7216 | $6.65 | $19.99 |
| Stainless | LTM7201 | $6.15 | $18.99 |
| Navy Blue | LTM7211 | $6.65 | $19.99 |
| White | LTM7214 | $6.65 | $19.99 |
| Red | LTM7203 | $6.65 | $19.99 |

- Designs: Name in Script · Classic Monogram · Name + Est. Year
- Engraving time per piece: **TBD — measure on sample**
- Packaging cost: **TBD**
- Finished selling price: **TBD** (target: listed retail + $10 engraving)
- Sample approved: ☐ · Fulfillment steps written: ☐

## 2. Family Cutting Board — 13 1/2" x 7" Acacia Paddle

| Variant | JDS SKU | Account cost | Listed retail |
|---|---|---|---|
| Acacia | GFT2323 | $5.20 | $15.99 |

- Designs: Family Name & Est. · Kitchen Of · Monogram Wreath
- **Handwritten recipe engraving intentionally held** until the artwork
  process is tested (Doc, 2026-09-22) — do not offer it on the PDP.
- Engraving time per piece: **TBD** · Packaging cost: **TBD**
- Finished selling price: **TBD**
- Sample approved: ☐ · Fulfillment steps written: ☐

## 3. Christmas Ornament — Laserable Leatherette Tree

| Variant | JDS SKU | Account cost | Listed retail |
|---|---|---|---|
| Rustic/Gold | GFT1113 | $0.91 | $9.99 |
| Black/Gold | GFT1108 | $0.91 | $9.99 |
| Black/Silver | GFT1112 | $0.91 | $9.99 |
| Light Brown | GFT1106 | $0.91 | $9.99 |

- Designs: Family · First Home · Pet
- Engraving time per piece: **TBD** · Packaging cost: **TBD**
- Finished selling price: **TBD**
- Sample approved: ☐ · Fulfillment steps written: ☐

## 4. Personalized Journal — 9 1/2" x 12" Laserable Leatherette Portfolio w/ Notepad

| Variant | JDS SKU | Account cost | Listed retail |
|---|---|---|---|
| Black/Gold | GFT246A | $14.35 | $43.99 |
| Black/Silver | GFT612 | $14.35 | $43.99 |
| Dark Brown | GFT186 | $14.35 | $43.99 |
| Gray | GFT346 | $14.35 | $43.99 |

- Designs: Name, Lower Corner · Initials, Centered · Name + Title Line
- **Open decision:** the published catalog has no small journal. The only
  true journal is the 5 1/4" x 8 1/4" Cork Journal **GFT785** ($7.15 /
  $21.99) — one color, no selection. If a smaller multi-color journal is
  preferred, publish the JDS SKUs through the admin first, then swap the
  variants in `cgcHoliday.js`.
- Engraving time per piece: **TBD** · Packaging cost: **TBD**
- Finished selling price: **TBD**
- Sample approved: ☐ · Fulfillment steps written: ☐

## Launch checklist (per product, before `published: true`)

1. Supplier mapping confirmed — SKUs above verified orderable on
   jdsindustries.com at the listed account cost.
2. Engraving time measured on a real blank; packaging cost priced.
3. Finished selling price set from real numbers (not the 3× default).
4. Engraved sample approved by Doc.
5. Fulfillment process written (order → JDS purchase → engrave → pack →
   ship); `production_note` in `cgcHoliday.js` set to the honest,
   measured turnaround.

No inventory counts, reviews, discounts, or delivery guarantees are shown
anywhere in the collection — do not add them without real data.
