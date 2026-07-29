#!/usr/bin/env python3
"""
LLM Enrichment Script for STL Business Directory.

Takes the businesses.json produced by prepare_data.py and enriches each record
with AI-generated tags and a plain-English description using the OpenAI API.
Category is left untouched -- it's set by prepare_data.py's NAICS-code mapping,
which is grounded in official codes and shouldn't be overridden by a model guess.

Features:
- Resume capability: tracks progress in a checkpoint file
- Batch processing with configurable batch size
- Rate limiting with exponential backoff
- Output validation

Prerequisites:
    pip install openai

Usage:
    # Set your API key
    export OPENAI_API_KEY="your-key-here"

    # Run enrichment (will resume from where it left off)
    python scripts/enrich.py

    # Run with custom batch size
    python scripts/enrich.py --batch-size 20

    # Dry run (process first 10 records only)
    python scripts/enrich.py --dry-run
"""

import argparse
import json
import os
import sys
import time

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)

INPUT_PATH = os.path.join(PROJECT_DIR, "businesses.json")
OUTPUT_PATH = os.path.join(PROJECT_DIR, "businesses.json")
CHECKPOINT_PATH = os.path.join(SCRIPT_DIR, ".enrich_checkpoint.json")

MODEL = "gpt-4.1-mini"


def load_checkpoint():
    if os.path.exists(CHECKPOINT_PATH):
        with open(CHECKPOINT_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"completed_ids": [], "enriched": {}}


def save_checkpoint(checkpoint):
    with open(CHECKPOINT_PATH, "w", encoding="utf-8") as f:
        json.dump(checkpoint, f, ensure_ascii=False, indent=2)


def build_prompt(business):
    """Build the enrichment prompt for a single business."""
    parts = [f"Name: {business['name']}"]
    if business.get("naics_description"):
        parts.append(f"NAICS: {business['naics_description']}")
    if business.get("sic_description"):
        parts.append(f"SIC: {business['sic_description']}")
    if business.get("description"):
        parts.append(f"About: {business['description'][:200]}")

    business_info = ". ".join(parts)

    return f"""St. Louis business. {business_info}

The NAICS/SIC codes above are the official industry classification and may be a wholesale/technical designation that undersells what the business actually offers a local customer (e.g. a "Lock & Key" business coded as a wholesale safes distributor is still, in practice, a locksmith). Generate search-friendly tags and a plain-English description reflecting what someone would actually search for to find this business.

Return JSON: {{"tags":["5-10 lowercase search phrases"],"description":"one sentence"}}

Only use facts implied by the inputs. Do not invent services, hours, or claims."""


def call_openai(prompt, api_key, max_retries=3):
    """Call the OpenAI API with retry logic."""
    try:
        import openai
    except ImportError:
        print("Error: 'openai' package not installed.")
        print("Run: pip install openai")
        sys.exit(1)

    client = openai.OpenAI(api_key=api_key)

    for attempt in range(max_retries):
        try:
            response = client.chat.completions.create(
                model=MODEL,
                max_tokens=300,
                temperature=0.2,
                messages=[
                    {"role": "system", "content": "You write concise, search-friendly tags and descriptions for local business directory listings. Always respond with valid JSON only, no markdown."},
                    {"role": "user", "content": prompt},
                ],
            )
            return response.choices[0].message.content
        except openai.RateLimitError:
            wait = 2 ** (attempt + 1)
            print(f"  Rate limited, waiting {wait}s...")
            time.sleep(wait)
        except openai.APIError as e:
            wait = 2 ** (attempt + 1)
            print(f"  API error: {e}, retrying in {wait}s...")
            time.sleep(wait)

    return None


def parse_response(response_text):
    """Parse and validate the LLM response."""
    if not response_text:
        return None

    # Try to extract JSON from the response
    text = response_text.strip()
    # Remove markdown code fences if present
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else text[3:]
    if text.endswith("```"):
        text = text[:-3]
    text = text.strip()

    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return None

    # Validate required fields
    if not isinstance(data.get("tags"), list):
        return None
    if not isinstance(data.get("description"), str):
        return None

    # Ensure tags are strings
    data["tags"] = [str(t).lower().strip() for t in data["tags"] if t]

    return data


def enrich_businesses(args):
    """Main enrichment loop."""
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        print("Error: OPENAI_API_KEY environment variable not set.")
        print("Export your API key: export OPENAI_API_KEY='your-key-here'")
        sys.exit(1)

    # Load data
    with open(INPUT_PATH, "r", encoding="utf-8") as f:
        businesses = json.load(f)

    checkpoint = load_checkpoint()
    completed_ids = set(checkpoint["completed_ids"])
    enriched = checkpoint["enriched"]

    # Filter to un-enriched businesses
    to_process = [b for b in businesses if b["id"] not in completed_ids]

    if args.dry_run:
        to_process = to_process[:10]
        print(f"DRY RUN: Processing first 10 of {len(to_process)} remaining records")
    else:
        print(f"Processing {len(to_process)} remaining records ({len(completed_ids)} already done)")

    print(f"Using model: {MODEL}")

    processed = 0
    errors = 0

    for i, business in enumerate(to_process):
        bid = business["id"]
        print(f"[{i+1}/{len(to_process)}] {business['name'][:50]}...", end=" ")

        prompt = build_prompt(business)
        response = call_openai(prompt, api_key)
        result = parse_response(response)

        if result:
            enriched[bid] = result
            completed_ids.add(bid)
            print(f"-> {result['description'][:60]}")
            processed += 1
        else:
            print("-> FAILED (will retry next run)")
            errors += 1

        # Save checkpoint every batch_size records
        if (i + 1) % args.batch_size == 0:
            checkpoint["completed_ids"] = list(completed_ids)
            checkpoint["enriched"] = enriched
            save_checkpoint(checkpoint)
            print(f"  Checkpoint saved ({len(completed_ids)} total)")

        # Small delay to avoid rate limits
        time.sleep(0.1)

    # Final checkpoint save
    checkpoint["completed_ids"] = list(completed_ids)
    checkpoint["enriched"] = enriched
    save_checkpoint(checkpoint)

    # Apply enrichment to businesses
    print(f"\nApplying enrichment to {len(enriched)} records...")
    for business in businesses:
        bid = business["id"]
        if bid in enriched:
            data = enriched[bid]
            business["tags"] = data["tags"]
            business["description"] = data["description"]

    # Write enriched output
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(businesses, f, ensure_ascii=False, separators=(",", ":"))

    print(f"\nDone! Processed: {processed}, Errors: {errors}")
    print(f"Output: {OUTPUT_PATH}")
    print(f"Checkpoint: {CHECKPOINT_PATH}")
    if errors > 0:
        print(f"\nRe-run the script to retry {errors} failed records.")


def main():
    parser = argparse.ArgumentParser(description="Enrich business data with LLM")
    parser.add_argument("--batch-size", type=int, default=50,
                        help="Save checkpoint every N records (default: 50)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Process only first 10 records")
    args = parser.parse_args()

    enrich_businesses(args)


if __name__ == "__main__":
    main()
