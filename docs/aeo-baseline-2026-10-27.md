# AEO Baseline — 2026-10-27

First recorded baseline for the Day 1–7 checklist in
`ai-search-audit-2026-10.md`. Method: web-retrieval check (what answer
engines actually pull from) for the 8 target questions, plus a direct
Bing Places lookup. This measures the **retrieval layer**, not final
assistant answers — asking ChatGPT/Perplexity/Gemini/Copilot the same
questions by hand is still the direct read and should be logged below
when done.

## The 8 target questions (derived from the 12 verticals + local intent)

| # | Question (as a customer would ask) | TSB in top-10 web retrieval? |
|---|---|---|
| 1 | custom t-shirt printing near Fairburn GA | **YES — #1** (homepage) |
| 2 | rush / same-day custom shirts Atlanta | NO — RushOrderTees, SameDayCustom, Bang-On own it |
| 3 | HBCU homecoming shirts Atlanta | **YES — #1** (`/shirts-for/hbcu-homecoming`) |
| 4 | family reunion t-shirts Atlanta | NO — "Atlanta Family Reunion T-Shirts" (a competitor named for the query) is #1 |
| 5 | embroidered polos for business near Atlanta | NO — Go Print Plus, Big Frog, 92 Threads |
| 6 | small batch / no-minimum custom shirts Atlanta | NO — RushOrderTees, Custom Tees ATL, UberPrints |
| 7 | DTF gang sheet printing Atlanta | NO — Atlanta Vinyl, Fast DTF Atlanta, DTFATL, Dash Print |
| 8 | custom church shirts Atlanta | **YES — #3** (`/shirts-for/churches`) behind Go Print Plus and DTFATL |

**Score: 3 / 8.** Strong where the query includes Fairburn or where the
new vertical pages hit an underserved niche (HBCU homecoming). Absent on
the metro-wide commodity queries (rush, DTF, no-minimum, polos, family
reunion) where national players and Atlanta-proper shops dominate.

## Defects found during the check

1. **Google's cached snippet for `/shirts-for/churches` is STALE** — it
   still reads "Custom t-shirt printing in Tyrone & Fairburn… Same-day
   pickup," i.e. the pre-PR-#52 copy. Google hasn't recrawled since the
   fix. Request reindexing of the 12 vertical pages in GSC, not just the
   4 new ones.
2. **Bing Places listing exists but is wrong/weak** (ypid
   `YN681E3FE1647CBF39`): correct name "TShirt Brothers", correct
   address 6010 Renaissance Pkwy, correct website — but the **old phone
   (470) 622-4845** and **no reviews at all** (Google shows 5.0 × 46).
   Hours show 8 AM–8 PM Mon–Sat; verify. This listing is what
   Copilot — and ChatGPT local lookups via Bing — see. Claim it at
   bingplaces.com (can import from the Google Business Profile once GBP
   access is sorted).
3. The old phone number is now confirmed wrong in BOTH Google Business
   Profile and Bing Places — fixing GBP first, then importing to Bing
   Places, fixes both.

## Still open for the full baseline

- [ ] Ask ChatGPT, Perplexity, Gemini, Copilot the 8 questions verbatim;
      record whether TSB is named (append here with date).
- [ ] Bing Webmaster Tools: verify the site (can import the GSC
      property in one click at bing.com/webmasters — "Import from
      Google Search Console"), submit `https://tshirtbrothers.com/sitemap.xml`.
- [ ] Bing Places: claim `YN681E3FE1647CBF39`, fix phone to
      (470) 622-1392, sync from GBP.
- [ ] First read of `discovery_source` / `quote_attribution` in
      `activity_events` (queries in §6 of the audit).
- [ ] grep nginx logs for `OAI-SearchBot|ChatGPT-User|PerplexityBot`.

## Interpretation

The on-site work is done and already winning the queries it can win
alone. The remaining gap to "referred by ChatGPT" is **off-site**:
Bing Webmaster + Bing Places (ChatGPT/Copilot's index), the GBP phone
fix, and review volume/recency. The metro-wide commodity queries (2, 5,
6, 7) are competitive enough that rankings alone won't carry them —
GBP/Bing local signals and reviews are the realistic lever.
