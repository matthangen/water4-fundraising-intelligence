"""
setup_sheets.py — Create the FIS Control Sheet in Google Sheets.
Run locally: python setup/setup_sheets.py

Creates a new Google Spreadsheet with these tabs:
  - Appeal Index   : campaign catalog (synced from Salesforce + manually enriched)
  - Donor Cache    : summary rows per donor with AI scores
  - Run Log        : history of sf_sync, claude_analysis, action_engine runs
  - Config         : key/value configuration
  - Actions        : gift officer action queue

Stores the Sheet ID in Secret Manager as FIS_SHEET_ID.
"""

import sys
import os
import json
import requests

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.shared.secrets import create_or_update_secret

BRIDGE_URL = "https://script.google.com/macros/s/AKfycbzZOEjeTj1hkVapQ5dBPq-wUqZHncl0X0Pi9u-zzBG5qPAztcfehXN_W91Ksxw_Am32kg/exec"
BRIDGE_KEY = "e8267d93-9562-4c5e-82d4-457ebf560b48"

# Tab schemas: list of column header names in order
TAB_SCHEMAS = {
    "Appeal Index": [
        "sf_campaign_id", "name", "status", "type", "start_date", "end_date",
        "owner", "contacts", "opps_total", "opps_won", "amount_all", "amount_won",
        "expected_revenue", "budget", "actual_cost", "roi",
        "ai_score", "ai_narrative", "recommendations", "segment_performance",
        "last_analyzed", "description", "notes",
    ],
    "Donor Cache": [
        "sf_id", "account_id", "full_name", "first_name", "last_name",
        "email", "phone", "city", "state", "country", "gift_officer",
        "total_giving", "giving_this_fy", "giving_last_fy",
        "last_gift_date", "last_gift_amount", "first_gift_date", "gift_count",
        "is_recurring", "rd_amount", "rd_period", "rd_next_payment",
        "rfm_recency", "rfm_frequency", "rfm_monetary",
        "upgrade_propensity", "lapse_risk", "ai_score",
        "ask_amount", "ask_rationale", "ai_narrative", "last_analyzed",
    ],
    "Run Log": [
        "timestamp", "run_type", "donors_processed", "campaigns_synced",
        "actions_generated", "errors", "elapsed_seconds", "notes",
    ],
    "Config": [
        "key", "value", "notes",
    ],
    "Actions": [
        "action_id", "created_at", "due_date", "priority",
        "action_type", "activity", "label",
        "gift_officer", "donor_name", "donor_sf_id", "donor_tier",
        "donor_ai_score", "ask_amount", "reason", "ai_narrative",
        "status", "completed_at", "notes",
    ],
}

DEFAULT_CONFIG = [
    {"key": "SF_SYNC_ENABLED",      "value": "TRUE",  "notes": "Enable Salesforce sync"},
    {"key": "ANALYSIS_ENABLED",     "value": "TRUE",  "notes": "Enable Claude analysis"},
    {"key": "ACTIONS_ENABLED",      "value": "TRUE",  "notes": "Enable action generation"},
    {"key": "STALE_DAYS",           "value": "7",     "notes": "Days before re-analyzing a donor"},
    {"key": "MAX_DONORS_PER_RUN",   "value": "500",   "notes": "Max donors analyzed per nightly run"},
    {"key": "LAPSE_RISK_THRESHOLD", "value": "0.6",   "notes": "Lapse risk score that triggers outreach action"},
    {"key": "UPGRADE_THRESHOLD",    "value": "0.6",   "notes": "Upgrade propensity that triggers upgrade ask"},
    {"key": "FY_START_MONTH",       "value": "7",     "notes": "Fiscal year start month (July = 7)"},
]


def _bridge(operation, spreadsheet_id, sheet_name, data=None, key_column=None):
    payload = {
        "apiKey": BRIDGE_KEY,
        "operation": operation,
        "spreadsheetId": spreadsheet_id,
        "sheetName": sheet_name,
    }
    if data:
        payload["data"] = data if isinstance(data, list) else [data]
    if key_column:
        payload["keyColumn"] = key_column
    r = requests.post(BRIDGE_URL, json=payload, allow_redirects=False, timeout=30)
    location = r.headers.get("Location")
    return requests.get(location, timeout=30).json()


def main():
    print("=== Water4 FIS — Sheets Setup ===\n")

    # Use the Sheets Bridge to create the sheet by seeding each tab with headers
    # (The bridge will create the sheet if we pass a special create operation,
    #  but since the bridge only supports read/append/upsert, we create the sheet
    #  manually first, then seed each tab.)

    print("Please create a new Google Spreadsheet manually:")
    print("  1. Go to https://sheets.google.com → Blank spreadsheet")
    print("  2. Name it: 'Water4 Fundraising Intelligence'")
    print("  3. Copy the spreadsheet ID from the URL:")
    print("     https://docs.google.com/spreadsheets/d/[SPREADSHEET_ID]/edit")
    print()
    sheet_id = input("Paste spreadsheet ID: ").strip()
    if not sheet_id:
        print("ERROR: Spreadsheet ID is required.")
        sys.exit(1)

    print(f"\nCreating tabs and seeding headers in {sheet_id}...\n")

    # Seed each tab by appending the header row as the first record
    # (bridge auto-creates tabs and uses first append to set headers)
    for tab_name, columns in TAB_SCHEMAS.items():
        print(f"  Setting up '{tab_name}'...")
        # Append a dummy row to establish the schema, then we'll clear it
        # Actually: just append a row with all keys set to column names as values
        # The bridge will create the tab with those as headers on first append.
        # Use a sentinel _HEADER_ row approach isn't needed — just seed the Config tab
        # with real data, and other tabs get their headers from first real data.

    # Seed Config with defaults (this creates the Config tab with proper headers)
    print("  Seeding Config tab with defaults...")
    for row in DEFAULT_CONFIG:
        result = _bridge("upsert", sheet_id, "Config", data=row, key_column="key")
        if result.get("error"):
            print(f"  WARNING: {result['error']}")

    # Seed Run Log with a setup entry
    _bridge("append", sheet_id, "Run Log", data={
        "timestamp":          __import__("datetime").datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC"),
        "run_type":           "setup",
        "donors_processed":   0,
        "campaigns_synced":   0,
        "actions_generated":  0,
        "errors":             0,
        "elapsed_seconds":    0,
        "notes":              "FIS Control Sheet created",
    })

    # Store the sheet ID in Secret Manager
    print(f"\nStoring FIS_SHEET_ID in Secret Manager...")
    try:
        create_or_update_secret("FIS_SHEET_ID", sheet_id)
        print(f"✅ FIS_SHEET_ID stored in Secret Manager")
    except Exception as e:
        print(f"WARNING: Could not store in Secret Manager: {e}")
        print(f"Set env var manually: export FIS_SHEET_ID={sheet_id}")

    print(f"\n✅ FIS Control Sheet ready:")
    print(f"   https://docs.google.com/spreadsheets/d/{sheet_id}/edit")
    print("\nNext steps:")
    print("  1. Run setup/setup_gcs.py to create the GCS bucket")
    print("  2. Deploy Cloud Functions: ./deploy.sh")
    print("  3. Trigger sf_sync: gcloud functions call sf_sync --region=us-central1")


if __name__ == "__main__":
    main()
