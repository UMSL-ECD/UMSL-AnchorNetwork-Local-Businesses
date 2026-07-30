#!/usr/bin/env python3
"""
Prepare business data from the St. Louis Public Library CSV.

Reads Ref-Directory.csv, cleans the data, assigns categories using
a NAICS-to-category mapping, and outputs businesses.json for the website.

Usage:
    python scripts/prepare_data.py
"""

import csv
import json
import re
import os
import hashlib
from collections import defaultdict

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)

CSV_PATH = os.path.join(PROJECT_DIR, "Ref-Directory.csv")
CATEGORIES_PATH = os.path.join(SCRIPT_DIR, "categories.json")
OUTPUT_PATH = os.path.join(PROJECT_DIR, "businesses.json")


def load_categories():
    with open(CATEGORIES_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data["categories"], data["naics_prefix_mapping"]


def naics_to_category(naics_code, prefix_mapping):
    """Match a single NAICS code to a category using longest-prefix matching."""
    if not naics_code:
        return None
    # Try progressively shorter prefixes (longest match wins)
    for length in range(len(naics_code), 0, -1):
        prefix = naics_code[:length]
        if prefix in prefix_mapping:
            return prefix_mapping[prefix]
    return None


def assign_category(row, prefix_mapping):
    """Assign a category from the Primary NAICS code, falling back to the
    secondary NAICS 2/3/4 codes (also reported by Reference Solutions for
    each business) when the primary code isn't in the mapping."""
    for field in ("Primary NAICS", "NAICS 2", "NAICS 3", "NAICS 4"):
        code = clean_text(row.get(field, ""))
        category = naics_to_category(code, prefix_mapping)
        if category is not None:
            return category
    return "Other"


def normalize_phone(phone):
    """Normalize phone: strip 'Not Available', clean up formatting."""
    if not phone or phone.strip().lower() in ("not available", ""):
        return ""
    return phone.strip()


def normalize_website(website):
    """Ensure website has https:// prefix."""
    if not website or not website.strip():
        return ""
    url = website.strip()
    if not url.lower().startswith(("http://", "https://")):
        url = "https://" + url
    return url.lower()


def make_id(name, address, city):
    """Create a stable, unique ID from business name + address."""
    raw = f"{name}|{address}|{city}".lower().strip()
    return hashlib.md5(raw.encode("utf-8")).hexdigest()[:12]


def clean_text(text):
    """Clean up text: trim, normalize whitespace, title-case fix."""
    if not text:
        return ""
    text = text.strip()
    # Collapse multiple spaces
    text = re.sub(r"\s+", " ", text)
    return text


def is_empty_row(row):
    """Check if a row is essentially empty (no company name)."""
    name = row.get("Company Name", "").strip()
    return not name


def process_csv():
    categories, prefix_mapping = load_categories()

    businesses = []
    seen = set()  # For deduplication (name + address)
    skipped_empty = 0
    skipped_dupe = 0

    with open(CSV_PATH, "r", encoding="utf-8-sig", errors="replace") as f:
        reader = csv.DictReader(f)
        for row in reader:
            # Skip empty rows
            if is_empty_row(row):
                skipped_empty += 1
                continue

            name = clean_text(row.get("Company Name", ""))
            address = clean_text(row.get("Address", ""))
            city = clean_text(row.get("City", ""))
            # "State" isn't in the current export; directory is St. Louis-area only.
            state = clean_text(row.get("State", "")) or "MO"
            zipcode = clean_text(row.get("ZIP Code", ""))
            # "Neighborhood" isn't in the current export. Fall back to ZIP code
            # (22 distinct values in this data vs. 9 for City, dominated 95% by
            # "Saint Louis") so the area filter is actually useful for narrowing
            # results.
            neighborhood = clean_text(row.get("Neighborhood", "")) or zipcode
            phone = normalize_phone(row.get("Phone Number Combined", ""))
            website = normalize_website(row.get("Website", ""))
            description = clean_text(row.get("Company Description", ""))
            naics_code = clean_text(row.get("Primary NAICS", ""))
            naics_desc = clean_text(row.get("Primary NAICS Description", ""))
            sic_desc = clean_text(row.get("Primary SIC Description", ""))
            employee_size = clean_text(row.get("Location Employee Size Range", ""))
            year_established = clean_text(row.get("Year Established", ""))
            home_business = row.get("Home Business", "").strip().lower() == "yes"
            facebook = normalize_website(row.get("Facebook", ""))
            linkedin = normalize_website(row.get("Linked-In", ""))
            # "Instagram" isn't in the Reference Solutions export today. Reads as ""
            # via .get()'s default until/unless a column with this exact name is
            # added to Ref-Directory.csv -- no other code changes needed if it is.
            instagram = normalize_website(row.get("Instagram", ""))

            # Deduplicate by name + address (keep first occurrence)
            dedup_key = f"{name.lower()}|{address.lower()}"
            if dedup_key in seen:
                skipped_dupe += 1
                continue
            seen.add(dedup_key)

            # Assign category from NAICS code, falling back to secondary
            # NAICS 2/3/4 codes when the primary code isn't mapped
            category = assign_category(row, prefix_mapping)

            # Suppress street address for home businesses
            display_address = ""
            if home_business:
                display_address = ""  # Only show city/zip
            else:
                display_address = address

            # Build the business record
            business = {
                "id": make_id(name, address, city),
                "name": name,
                "address": display_address,
                "city": city,
                "state": state,
                "zip": zipcode,
                "neighborhood": neighborhood,
                "phone": phone,
                "website": website,
                "facebook": facebook,
                "linkedin": linkedin,
                "instagram": instagram,
                "category": category,
                "naics_description": naics_desc,
                "sic_description": sic_desc,
                "description": description,
                "tags": generate_basic_tags(name, naics_desc, sic_desc, category),
                "employee_size": employee_size,
                "year_established": year_established,
                "home_business": home_business,
            }

            businesses.append(business)

    # Sort by name for consistent output
    businesses.sort(key=lambda b: b["name"].lower())

    # Write output
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(businesses, f, ensure_ascii=False, separators=(",", ":"))

    # Print stats
    print(f"Processed: {len(businesses)} businesses")
    print(f"Skipped empty rows: {skipped_empty}")
    print(f"Skipped duplicates: {skipped_dupe}")
    print(f"Output: {OUTPUT_PATH}")
    print(f"File size: {os.path.getsize(OUTPUT_PATH) / 1024 / 1024:.1f} MB")

    # Category distribution
    cat_counts = defaultdict(int)
    for b in businesses:
        cat_counts[b["category"]] += 1
    print("\nCategory distribution:")
    for cat, count in sorted(cat_counts.items(), key=lambda x: -x[1]):
        print(f"  {count:5d}  {cat}")


def generate_basic_tags(name, naics_desc, sic_desc, category):
    """Generate basic search tags from available fields.

    These are placeholder tags based on NAICS/SIC descriptions.
    The LLM enrichment script (enrich.py) will replace these with
    better, human-friendly tags.
    """
    tags = set()

    # Add SIC description words as tags (often more specific than NAICS)
    if sic_desc and sic_desc.lower() not in ("nonclassified establishments",):
        # Clean up SIC desc into usable tags
        tag = sic_desc.lower().strip()
        # Remove common suffixes
        for suffix in ("-mfrs", " (mfrs)", "-whol", "-retail", " nec"):
            tag = tag.replace(suffix, "")
        tags.add(tag.strip())

    # Add NAICS description as a tag (cleaned up)
    if naics_desc and naics_desc.lower() not in (
        "unclassified establishments",
        "nonclassified establishments",
    ):
        tag = naics_desc.lower().strip()
        # Remove overly generic prefixes
        for prefix in ("all other ", "other ", "offices of "):
            if tag.startswith(prefix):
                tag = tag[len(prefix) :]
        # Truncate very long descriptions
        if len(tag) > 60:
            tag = tag[:60].rsplit(" ", 1)[0]
        tags.add(tag.strip())

    # Add category as a tag
    if category and category != "Other":
        tags.add(category.lower())

    # Sorted for deterministic output -- Python randomizes set iteration
    # order per-process, so an unsorted list() here would reorder tags on
    # every run even when nothing actually changed, producing spurious
    # diffs/commits in the auto-refresh workflow.
    return sorted(tags)


if __name__ == "__main__":
    process_csv()
