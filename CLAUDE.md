# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Static website for searching ~13,000 St. Louis area businesses from the St. Louis Public Library reference database. No framework, no build tools, no server — pure HTML/CSS/JS served as static files.

Data source: `Ref-Directory.csv` (NAICS-coded business records). A Python pipeline cleans the CSV and enriches records with human-friendly categories, tags, and descriptions via LLM API, outputting `businesses.json` consumed by the frontend.

## Architecture

### Data Pipeline (Python scripts, run manually)

1. **`scripts/prepare_data.py`** — Reads `Ref-Directory.csv`, cleans data (strips empty rows, deduplicates, normalizes phone/website, suppresses home business addresses), assigns categories via NAICS prefix mapping from `scripts/categories.json`, generates basic tags, outputs `businesses.json`.

2. **`scripts/enrich.py`** — Takes the `businesses.json` from step 1 and enriches each record with LLM-generated tags and a plain-English description using the OpenAI API (`gpt-4.1-mini`). Deliberately does **not** touch `category` — that stays authoritative from step 1's NAICS-code mapping, since a model guess shouldn't override an official classification. Resumable via `.enrich_checkpoint.json`. Writes enriched data back to `businesses.json`.

### Frontend (no build step)

- **`index.html`** — Single page with search bar, category/neighborhood filters, results grid, detail modal (`<dialog>`), pagination
- **`app.js`** — IIFE containing all logic: fetches `businesses.json`, builds Fuse.js index, handles search/filter/pagination/modal. URL state via query params (`?q=`, `?cat=`, `?hood=`)
- **`styles.css`** — Mobile-first responsive design using CSS custom properties and Grid
- **Fuse.js** loaded via CDN (`https://cdn.jsdelivr.net/npm/fuse.js@7.0.0`) for fuzzy search

### Key Data Flow

`Ref-Directory.csv` → `prepare_data.py` → `businesses.json` → `enrich.py` → `businesses.json` (enriched) → loaded by `app.js` via `fetch()`

## Commands

### Data Pipeline

```bash
# Step 1: Clean CSV and generate initial businesses.json
python scripts/prepare_data.py

# Step 2: Enrich with LLM (requires OPENAI_API_KEY env var)
export OPENAI_API_KEY="your-key"
python scripts/enrich.py

# Dry run (first 10 records only)
python scripts/enrich.py --dry-run

# Custom checkpoint interval
python scripts/enrich.py --batch-size 20
```

Python dependencies: `openai` (`pip install openai`)

### Local Development

No build step. Open `index.html` directly in a browser or use any static file server:

```bash
python -m http.server 8000
# Then open http://localhost:8000
```

## Key Design Decisions

- **Category taxonomy**: 26 categories (including `Other`) defined in `scripts/categories.json`. The `naics_prefix_mapping` is keyed primarily at the **4-digit NAICS Industry Group level** (sector/subsector/industry-group), not the more specific 5-/6-digit codes RefSolutions reports — this is deliberately coarser so the mapping keeps working as NAICS codes get renumbered between export vintages (e.g. the NAICS 2022 revision renumbered most of the Retail Trade subsector). A few broad, internally-homogeneous **2-digit sector fallbacks** are included too (`31`/`32`/`33` → Manufacturing, `42` → Wholesale Trade, `44`/`45` → Retail & Shopping, `48`/`49` → Transportation & Logistics, `11`/`21`/`22` → Agriculture, Mining & Utilities, `61` → Education, `92` → Government) so that codes not seen in any prior export still land somewhere sensible instead of "Other". A small number of specific 5-digit **overrides** sit above the 4-digit level where finer-grained detail earns its own category despite sharing a 4-digit parent (e.g. `54194` Veterinary Services → Pets & Veterinary, even though its parent `5419` defaults to Professional Services) — `naics_to_category()`'s longest-prefix-match naturally prefers these. Any new categories must be added to both the `categories` array and `naics_prefix_mapping`.
- **Category assignment fallback**: `assign_category()` tries `Primary NAICS` first; if that code isn't in the mapping, it tries the business's secondary `NAICS 2`, `NAICS 3`, then `NAICS 4` codes (also reported by Reference Solutions per business) before giving up and assigning `Other`. This means `Other` should now mostly represent RefSolutions' own `9999`/`99999` "Unclassified Establishments" code, not a genuine gap in the mapping — if `Other` balloons after a refresh, check for new 4-digit codes the mapping doesn't cover yet (`scripts/prepare_data.py`'s stats output shows the category distribution; cross-reference unmapped codes against the CSV's `Primary NAICS Description`/`NAICS 2 Description`/etc. columns).
- **Fuse.js search weights**: `name` (2.0) > `tags` (1.5) > `description` and `category` (1.0) > NAICS/SIC descriptions (0.5). Threshold 0.4, debounce 300ms.
- **Pagination**: 20 results per page.
- **Filter logic**: AND — all active filters must match.
- **Home business privacy**: Street addresses suppressed for records where `home_business: true` (city/ZIP only). Depends on a `Home Business` column in the source CSV — recent Reference Solutions exports don't include it, so suppression silently doesn't trigger on those. Confirm the column is present after each biannual refresh if this still matters.
- **Neighborhood filter**: Reference Solutions exports have dropped the `Neighborhood` column. `prepare_data.py` falls back to `ZIP Code` when `Neighborhood` is absent, and the UI is labeled "ZIP code" accordingly — 22 distinct ZIP values in this data vs. only 9 City values (95% of which share one City), so ZIP gives meaningfully finer-grained filtering than City did.
- **State**: Also dropped from recent exports; `prepare_data.py` hardcodes `"MO"` since this directory is St. Louis-area only.
- **Social links**: `facebook` and `linkedin` are read from the CSV's `Facebook`/`Linked-In` columns (present in the current export; ~36%/8% fill rate) and rendered as icon links on cards and in the modal via `socialLinksHtml()` in `app.js`. `instagram` is also read (from a column named exactly `Instagram`) even though Reference Solutions doesn't currently provide one — if a future export adds it, or if one is merged in locally, it starts showing up with no code changes needed. Note: since `Ref-Directory.csv` is replaced wholesale on each biannual refresh, any Instagram data added by directly editing that file will be wiped out at the next refresh — if this needs to persist, keep it in a separate small CSV (keyed by business name/address) and merge it into the row before `assign_category`/output in `prepare_data.py`, rather than editing the vendor file directly.
- **Enrichment checkpoint**: `scripts/.enrich_checkpoint.json` tracks completed record IDs so the enrichment script can resume after crashes. Delete this file to re-enrich from scratch.
- **URL state**: Search/filter state stored in query params (`q`, `cat`, `hood`) for bookmarking/sharing.

## Important File Paths

- `businesses.json` — Generated data file (~6.5 MB), consumed by frontend. Do not edit manually.
- `Ref-Directory.csv` — Original source data (root level, duplicate in `data/`). Do not modify.
- `scripts/categories.json` — Category taxonomy and NAICS mapping. Edit this to change category assignments.
- `scripts/.enrich_checkpoint.json` — Enrichment progress tracker. Safe to delete to restart enrichment.

## Security Note

The `.claude/settings.local.json` file contains a hardcoded API key in permission rules. API keys should be set via environment variables only, never committed to files.
