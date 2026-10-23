# AI Search (AEO/GEO) + Local SEO — Audit & Implementation Record

**Date:** 2026-10-23 · **Scope:** tshirtbrothers.com · **PR:** [#52](https://github.com/kevinskey/tshirtbrothers/pull/52)

Audit of how discoverable and recommendable T-Shirt Brothers is to AI
answer engines (ChatGPT, Google AI Overviews, Gemini, Perplexity,
Copilot) and to local search, plus the changes made.

---

## 1. Initial audit — AI search readiness

**Headline: the site was in far better shape than a typical small-business
site, and three site-wide defects were undermining all of it.**

### What already existed and works well

Credit where due — this was not a greenfield situation:

| Area | State |
|---|---|
| Server-side rendering | **Strong.** A Puppeteer prerenderer bakes real HTML for every public URL at build time. Verified: GPTBot fetching `/shirts-for/churches` gets HTTP 200 with full content and the correct title. |
| Per-page metadata | **Strong.** Every one of the ~28 public page components renders `<Seo>`; 67 unique titles and descriptions. |
| Dynamic sitemap | **Strong.** DB-backed at `/sitemap.xml`, 68 URLs with real `lastmod`, hreflang for en/es. Replaced a hand-maintained file that had drifted. |
| Structured data | **Partial.** LocalBusiness with full `areaServed`, hours, geo; FAQPage on `/faq`; Product/ItemList on `/shop`; real `AggregateRating` from the live Google Places API. |
| Local landing pages | **Strong.** 8 city pages with genuine drive times and local landmarks — not spun filler. |
| Vertical landing pages | **Good.** 8 use-case pages targeting how customers actually search. |
| Analytics | **Strong.** GA4 + Microsoft Clarity + self-hosted Umami + a first-party `activity_events` table. |
| Reviews | **Honest.** Pulled live from Google Places. Nothing fabricated. |
| Mobile | **Good.** Mobile-first throughout; the quote wizard is purpose-built for it. |

### Critical defects found

**1. Duplicate head tags on all 67 pages.** `index.html` hard-coded a
canonical, meta description and the OG/Twitter blocks. Every page *also*
renders `<Seo>`, and Helmet cannot remove static tags it finds in the
shell. Confirmed against production:

```
$ curl -s https://tshirtbrothers.com/services | grep canonical
<link rel="canonical" href="https://tshirtbrothers.com">          ← wrong
<link rel="canonical" href="https://tshirtbrothers.com/services">  ← right
```

Two canonicals, two descriptions, and two of every OG tag per page. The
first canonical pointed at the homepage on *every* page. Conflicting
canonicals are worse than none: Google may discard both signals, and an
answer engine gets an ambiguous page identity — exactly the condition
that makes a model unsure what a page is about.

**2. Two `<h1>`s on all 67 pages.** The noscript SEO fallback is inlined
into every prerendered page, so its heading competed with each page's
real one — and described the whole business rather than the page. The
church-shirts page led with "TShirt Brothers - Custom T-Shirt Printing in
Tyrone & Fairburn, GA" before "Custom Church Shirts".

**3. Contradictory business facts.** Detailed in §2.

### Lesser findings

- No `Service`, `BreadcrumbList`, `Organization` or `WebSite` schema; no
  per-page schema on the 16 landing pages.
- Two `LocalBusiness` nodes on the homepage with no shared `@id`, so the
  live Google rating was describing a *different* entity than the one
  with the address and hours.
- `robots.txt` had no AI-crawler policy — everything inherited one `*`
  rule, so training crawlers and retrieval crawlers were treated alike
  and cart/payment/account pages were crawlable.
- `5.0 on Google` hard-coded on ~30 pages (true when checked — genuinely
  5.0 across 46 reviews — but a claim that silently becomes false).
- Prerenderer could not prerender a page on the deploy that introduced
  it (§3).
- No way to attribute AI referrals.

### Google Search Console / Bing Webmaster

**Not verifiable from the codebase.** No GSC or Bing verification meta
tag or DNS token is present, and neither tool is referenced anywhere. GA4
(`G-CSV96GDJW3`), Clarity (`wwufy30yoe`) and Umami are all confirmed
live. **Needs Doc:** whether GSC/Bing accounts exist. Without GSC there
is no impressions/clicks/position baseline, which is the single most
useful dataset for this project — see §7 day 1–7.

---

## 2. Business information requiring your verification

### Resolved in this pass (confirmed by Doc 2026-10-23)

| Item | Was | Now |
|---|---|---|
| DTF gang sheet | "from **$9**/ft" on homepage + `/quote/classic` | **$11.99/ft** — matches the live pricing API |
| Builder fallback rates | $6 / $8 / $12 (KolorMatrix **vendor cost**) | $11.99 / $12.99 / $17.00 |
| Tyrone | "same-day pickup in Tyrone", "free local delivery in Tyrone" | Fairburn — the only location. Tyrone stays a served city |
| Business name | mixed | **TShirt Brothers** (no hyphen), matching the Google Business Profile |

The `$6/ft` fallback was a live customer-facing risk, not just untidy: if
the pricing-config fetch failed, the builder showed **$6/ft and a
"same day to next day" promise** while checkout charged **$11.99/ft on a
2-business-day standard**.

### Verified consistent — no action needed

Checked across the whole codebase and found **no** contradictions in:

- **Minimum order** — "no minimums" in 20+ places, consistent everywhere.
- **Hours** — Mon–Sat 8 AM–8 PM, closed Sundays. Identical in `/about`,
  `/faq`, `PaymentPage` and the JSON-LD.
- **Address** — 6010 Renaissance Pkwy consistently; matches the live
  Google Business Profile exactly.
- **Free shipping** — over $150 everywhere.
- **Turnaround** — 2–7 business days standard, rush under 48h adds
  20–30%. Consistent; product-specific figures (DTF 2 days, drinkware
  5–7) are genuinely different product lines, not conflicts.

### Still needs your decision

| # | Item | Why it needs you |
|---|---|---|
| 1 | **GSC / Bing Webmaster accounts** | Can't be determined from code. Blocks the measurement baseline. |
| 2 | **Schema email** — `info@` vs `kevin@` | Schema said `kevin@`, footer says `kevin@`, business records say `info@`. I set schema to `info@`. Tell me if `kevin@` is preferred and I'll align everything. |
| 3 | **`TestimonialsSection` hard-coded "5.0 on Google"** | On the homepage beside five decorative star SVGs. True today. Left alone to avoid touching homepage design — swapping it needs a small visual decision. |
| 4 | **`HomePageEs`: "más de 40 reseñas"** | Accurate now (46) but will drift. Same fix available. |
| 5 | **Apparel rush turnaround** | `/api/quotes/settings` needs auth, so I could not verify the real configured values. New rush-page copy uses only the published `/faq` figures and otherwise says "tell us your deadline". If the configured numbers differ, the FAQ may be stale too. |
| 6 | **`priceRange: "$"`** in schema | Single `$` suggests budget. `$$` may represent you better. Your call. |
| 7 | **HBCU trademark posture** | The new page says licensed university/organization marks need customer-supplied approved artwork. Confirm that matches how you actually handle it. |

---

## 3. Record of changes

27 files, +1,905 / −133. Five commits on `feat/aeo-geo`.

### Technical (Phase 3)

| File | Change |
|---|---|
| `client/index.html` | Removed duplicate canonical/description/OG/Twitter. Demoted noscript `h1`. Structured data → `@graph` of Organization + WebSite + LocalBusiness with stable `@id`s, `SearchAction`, `contactPoint`. |
| `client/public/robots.txt` | Explicit per-crawler-class policy; blocked transactional paths; fixed directive ordering. |
| `components/home/GoogleReviews.tsx` | Shared `@id` so the live rating attaches to the business entity. |
| `scripts/make-{cgc,apc,lht}-shell.mjs` | Inject brand SEO tags instead of swapping TSB's; updated markers. |

**A trap worth recording:** the three sister-brand shells rewrite the
built `index.html` by regex and `exit(1)` on a missing marker. My first
edit put the literal text `<title>` inside an HTML *comment* — the
title-swap regex matched it, ate the comment and the real title tag, and
produced malformed HTML for all three brands. `index.html` now carries a
warning never to write literal tag syntax in its comments.

### Corrections (Phase 3)

`businessFacts.ts` (new) is the single source of truth. `DtfPromo` and
`InstantQuotePage` read from it instead of hard-coding. `ValueProps`,
`HowItWorks`, `AnnouncementBar` corrected to Fairburn.

### Content (Phase 4)

Four new pages built by **extending** the existing vertical system with
five *optional* fields — the eight original verticals render
byte-identically:

| URL | Covers |
|---|---|
| `/shirts-for/rush-orders` | Real DTF tiers and cutoffs; honest about what's possible |
| `/shirts-for/hbcu-homecoming` | AUC-adjacent; trademark posture stated plainly |
| `/shirts-for/embroidered-polos` | Stitch-count pricing, $25 digitizing, points at `/embroidery` |
| `/shirts-for/small-orders` | Explains *why* small orders cost more per shirt |

Plus `Service` + `BreadcrumbList` on all 12 verticals, `FAQPage` on the
four new ones (22 Q&A), `GoogleRatingChip` for live ratings, and footer
links (en + es).

**Every figure traces to an already-published source** — `/faq` price
bands and turnaround, the live DTF config, the embroidery page's $25 fee.
Nothing invented. Where the business hedges, the copy hedges: same-day is
"call ahead so we can confirm", not a promise.

### Measurement (Phase 5)

`lib/referral.ts` + the quote-wizard field. See §6.

### Infrastructure

Two prerenderer fixes, both of which were silently costing SEO:

1. **New routes could never be prerendered by the deploy that added
   them.** `deploy.sh` runs pull → build → restart, so prerender fetched
   the *old* server's sitemap (1-hour cache on top). A new URL wasn't in
   that response, got skipped, and shipped client-render-only until
   someone happened to deploy again. Now unions in routes declared by the
   current checkout.
2. **Guaranteed self-referencing canonical.** Audit of all 67 output
   files found `/design` had none — its `Seo` unmounts on a render branch
   headless Chrome takes. This was previously *masked badly*: the static
   canonical meant the page shipped claiming to **be the homepage**,
   which asks Google to de-index it.

---

## 4. Structured-data validation report

`npm run validate:schema` — automated, and **negative-tested** to confirm
it fails on a real defect.

```
churches           Service + BreadcrumbList
family-reunions    Service + BreadcrumbList
teams              Service + BreadcrumbList
schools            Service + BreadcrumbList
businesses         Service + BreadcrumbList
greek-life         Service + BreadcrumbList
fundraisers        Service + BreadcrumbList
birthdays          Service + BreadcrumbList
rush-orders        Service + BreadcrumbList + FAQPage (5 Q)
hbcu-homecoming    Service + BreadcrumbList + FAQPage (5 Q)
embroidered-polos  Service + BreadcrumbList + FAQPage (6 Q)
small-orders       Service + BreadcrumbList + FAQPage (6 Q)

12 verticals, 22 FAQ entries, sitemap list 12 slugs
All structured data valid: serializes, required fields present,
no fabricated ratings, sitemap in sync.
```

Across all 67 built pages:

| Check | Result |
|---|---|
| Pages | 67 |
| Unique `<title>` | **67 / 67** |
| Unique self-referencing canonicals | **67 / 67** (0 reused) |
| Exactly one title/canonical/description/h1 | 66 / 67 (`/design`: no h1 or description) |
| JSON-LD parses | **all** |
| Fabricated ratings in static markup | **none** |

**Entity graph.** `#organization`, `#website`, `#business` are linked;
the live-rating node shares `#business`; each vertical's `Service` points
at `#business` via `provider` rather than re-describing the business.

**Deliberately not implemented:** no `aggregateRating` in static markup
(only live Google data); no second `LocalBusiness` for any city we don't
occupy; no `Offer` with invented prices; no speculative schema types
merely to influence AI systems. Structured data improves machine
readability — it does not buy recommendations.

**Recommended next step:** run the 4 new URLs through Google's Rich
Results Test and URL Inspection once deployed. My validator checks
syntax, required fields and policy compliance; only Google confirms
*eligibility*.

---

## 5. Prioritized problems & opportunities

### Done in this pass

| P | Item | Impact |
|---|---|---|
| P0 | Duplicate canonicals, 67 pages | Ambiguous page identity for every crawler |
| P0 | $9 vs $11.99 DTF | Wrong price publicly advertised |
| P0 | Duplicate `h1`, 67 pages | No clear page topic |
| P0 | Tyrone storefront claim | Unverifiable location claim |
| P1 | No AI-crawler policy | No stance on retrieval vs training |
| P1 | Unlinked structured data | Ratings orphaned from the business |
| P1 | $6/ft vendor-cost fallback | Could under-quote a live customer |
| P1 | 4 missing specialty pages | No page answered those questions |
| P1 | No AI referral attribution | Couldn't measure the core objective |
| P2 | No Service/Breadcrumb/FAQPage | Weaker machine readability |
| P2 | Hard-coded ratings | Future false claim |
| P2 | Prerender gaps | New pages invisible to crawlers |

### Open, prioritized

| P | Item | Effort | Why |
|---|---|---|---|
| **P1** | Confirm/create GSC + Bing Webmaster | Low | No baseline without it |
| **P1** | Submit the 4 new URLs for indexing | Low | Hours vs weeks to discovery |
| **P1** | Google Business Profile audit | Low | **Biggest local-AI lever.** Assistants lean heavily on GBP for "near me" |
| P2 | Items 2–7 in §2 | Low | Accuracy |
| P2 | `/design` h1 + description | Medium | Needs care inside the Design Studio |
| P2 | Review-response discipline | Low | 46 reviews at 5.0 is a real asset |
| P3 | `/compare` + `/brands` depth | Medium | Answers comparison questions |
| P3 | Project-photo gallery per vertical | Medium | Authentic proof; strong for GBP too |
| P3 | Blog cost-guide refresh | Medium | Pricing questions are high-intent |
| P3 | Spanish parity for new pages | Medium | `/es` exists but verticals are en-only |

---

## 6. AI referral tracking plan

### What's implemented

`lib/referral.ts` classifies each visit into `chatgpt`, `perplexity`,
`gemini`, `copilot`, `claude`, `other_ai`, `organic_search`, `social`,
`referral` or `direct`, from the referrer host *and* `utm_source`. It
stores **first-touch** attribution (a visitor from Perplexity who browses
three pages and then quotes is still credited to Perplexity) and logs one
`discovery_source` event per session to `activity_events`, mirrored to
GA4 and Umami.

On quote submission a `quote_attribution` event records `quote_id`,
`self_reported`, `detected_channel` and `self_reported_ai` — so channels
join to quotes, and quotes join to revenue.

### The honest limitation

**These numbers are a floor on AI-driven discovery, never a total.**

- Google AI Overviews and Gemini grounding send a plain `google.com`
  referrer, indistinguishable from an organic click.
- ChatGPT and Copilot answers frequently produce a **direct** visit —
  people read the recommendation, then type the domain.
- Some assistants strip the referrer entirely.

This is why the **"How did you hear about us?"** field matters: it is the
only instrument that catches those. It's optional, never gates
submission, sits on the wizard's existing final step (a new step would
cost real quotes), is pre-selected from the detected channel when
inferable, and lists assistants **individually** — "which assistant
recommends us" is the actual question.

### How to read the data

```sql
-- Discovery channels, last 30 days
SELECT data->>'channel' AS channel,
       COUNT(*) AS sessions,
       COUNT(*) FILTER (WHERE data->>'is_ai' = 'true') AS ai
  FROM activity_events
 WHERE event = 'discovery_source'
   AND created_at > now() - interval '30 days'
 GROUP BY 1 ORDER BY sessions DESC;

-- Self-reported vs detected on quotes (the interesting disagreement:
-- self_reported = chatgpt while detected_channel = direct is exactly
-- the invisible AI referral)
SELECT data->>'self_reported'    AS said,
       data->>'detected_channel' AS detected,
       COUNT(*)
  FROM activity_events
 WHERE event = 'quote_attribution'
 GROUP BY 1,2 ORDER BY 3 DESC;

-- Quotes attributed to AI, with value
SELECT e.data->>'self_reported' AS source, COUNT(*) AS quotes,
       SUM(q.estimated_price) AS pipeline
  FROM activity_events e
  JOIN quotes q ON q.id = (e.data->>'quote_id')::int
 WHERE e.event = 'quote_attribution'
   AND e.data->>'self_reported_ai' = 'true'
 GROUP BY 1 ORDER BY quotes DESC;
```

> `quotes.estimated_price` is **tax-inclusive**, and Stripe is the
> ground truth for collected cash. Treat these as pipeline, not revenue.

**Also worth doing:** a GA4 exploration segmented on the
`discovery_source` event, and periodically asking the assistants
themselves ("custom shirts near Fairburn GA") to see whether you're
named — that is the only direct read on AI visibility, and it's worth a
monthly note.

---

## 7. 30 / 60 / 90-day roadmap

Success is **qualified traffic, quote requests, orders and revenue** —
not pages shipped.

### Day 1–7 — baseline (do this first)

- [ ] **Confirm or create GSC + Bing Webmaster**, submit the sitemap.
      Everything else is measured against this.
- [ ] Record today's numbers: GA4 sessions by channel, quote count/month,
      46 Google reviews at 5.0, 67 indexed URLs.
- [ ] Submit the 4 new URLs via URL Inspection.
- [ ] Rich Results Test on the 4 new URLs.
- [ ] Ask ChatGPT / Perplexity / Gemini / Copilot the 8 target questions
      and write down verbatim whether TSB is named. **This is the real
      AEO baseline.**

### Days 1–30 — foundation

- [ ] **Google Business Profile audit** — the highest-leverage item
      outside the site. Exact name/address/hours/phone match, all
      services listed, categories right, photos current, 46 reviews
      responded to. Local assistants lean on GBP more than on the site.
- [ ] Resolve §2 items 2–7.
- [ ] Bing Places (feeds Copilot).
- [ ] Watch for crawler hits from `OAI-SearchBot`, `PerplexityBot`,
      `ChatGPT-User` in nginx logs — confirms the robots policy works.
- [ ] First read of `discovery_source` and "How did you hear about us?".

**30-day success:** baseline exists, 4 new URLs indexed, GBP verified
consistent, AI referral data flowing.

### Days 31–60 — depth

- [ ] Review which new pages get impressions and for which queries; add
      depth where there's traction rather than adding more pages.
- [ ] Project photos per vertical — authentic proof, reusable on GBP.
- [ ] Review-response pass; ask recent happy customers for reviews
      mentioning *what* they ordered (churches, reunions, rush).
- [ ] Spanish versions of the two best-performing new pages.
- [ ] Re-run the assistant questions and compare to baseline.
- [ ] Consider the two P3 content items if the first review shows demand.

**60-day success:** measurable impression growth on the new URLs, some
AI-attributed quotes, assistant answers starting to shift.

### Days 61–90 — compounding

- [ ] Full quarter review: which channels produced **revenue**, not
      traffic. Kill or deepen based on that.
- [ ] Double down on whichever vertical converted best.
- [ ] Local link/citation building (chambers, school/church directories)
      — real citations only, no paid directory spam.
- [ ] Set `check-business-facts.mjs` on a schedule so pricing drift is
      caught in days, not months.
- [ ] Decide the training-crawler posture with a quarter of data in hand.

**90-day success:** a defensible answer to "is AI search sending us
paying customers, and which assistants", plus a maintenance routine that
keeps facts from drifting.

### What I'd deliberately *not* do

- Don't mass-produce location pages. Eight real city pages beat forty
  thin ones, and thin local pages are exactly what both Google's
  helpful-content systems and AI answer engines discount.
- Don't add schema types to game AI systems. Structured data earns
  clarity, not recommendations.
- Don't chase AI-referral volume as the headline metric — it undercounts
  by design (§6). Watch quotes and revenue.

---

## 8. Verification performed

| Check | Result |
|---|---|
| `npm run build` (tsc + vite + 3 shells + prerender) | **passes**, 67/67 prerendered |
| `tsc -b` | clean |
| `npm run test:referral` | **29/29** |
| `npm run validate:schema` | passes, negative-tested |
| `check-business-facts.mjs` | **6/6** vs production |
| All 67 prerendered pages | 67 unique titles, 67 unique canonicals |
| Critical workflows | homepage, **Design Studio**, quote wizard, DTF, **shop (S&S)**, services, FAQ, embroidery — all render clean |
| Sister-brand shells | CGC/APC/LHT: 1 canonical + 1 description each, correct brand schema, TSB analytics stripped |
| `robots.txt` | 22/22 allow-deny cases via Python `robotparser` |

Tested on a clean worktree branched from `origin/main` with its own
`npm install`, because the shared working tree had another session's
in-flight changes.

**Two bugs the new tests caught before shipping:**

1. `google.co.uk` (and every other Google country domain) classified as a
   generic *referral* rather than organic search — a suffix rule can't
   express it. Would have understated organic search for every non-US
   searcher.
2. `new URL('javascript:alert(1)')` parses happily with an **empty**
   hostname, matched no rule, and fell through to `referral` — inventing
   a referral channel out of a junk string.

### Constraints respected

Homepage not redesigned · branding and colours untouched · Design Studio
not modified (and smoke-tested) · S&S API untouched (`/shop` smoke-tested)
· **no pricing calculation changed** — only advertised copy, after
approval · checkout/accounts/ordering untouched · no content removed
except provably valueless duplicate tags (and `meta keywords`, ignored by
every engine since ~2009) · no duplicate pages · no unverified claims
published · mobile-first preserved.

---

## 9. Maintenance

```bash
cd client
npm run validate:schema          # structured data + sitemap sync
npm run test:referral            # referral classifier
node scripts/check-business-facts.mjs   # advertised facts vs production
```

`check-business-facts.mjs` is deliberately **not** in `npm run build` — a
deploy shouldn't fail because a rate changed in admin seconds earlier,
and the build must stay runnable offline. Run it on a schedule instead.

**When changing a price in admin**, update
`client/src/data/businessFacts.ts` to match, or the drift check will flag
it. That file is the single source of truth for advertised figures; the
server remains the pricing authority for anything a customer is charged.
