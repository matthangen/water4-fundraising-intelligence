"""
sheets.py — Sheets Bridge helper for the Fundraising Intelligence System.

Wraps all Google Sheets interactions for:
  - Appeal Index (campaign catalog)
  - Donor Cache (donor analysis output)
  - Run Log (sync & analysis runs)
  - Config (key/value settings)
  - Actions (gift officer action queue)
"""

import os
import logging
import requests
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)

BRIDGE_URL = "https://script.google.com/macros/s/AKfycbzZOEjeTj1hkVapQ5dBPq-wUqZHncl0X0Pi9u-zzBG5qPAztcfehXN_W91Ksxw_Am32kg/exec"
BRIDGE_KEY = "e8267d93-9562-4c5e-82d4-457ebf560b48"

# Tab names in the FIS Control Sheet
SHEET_APPEAL_INDEX  = "Appeal Index"
SHEET_DONOR_CACHE   = "Donor Cache"
SHEET_RUN_LOG       = "Run Log"
SHEET_CONFIG        = "Config"
SHEET_ACTIONS       = "Actions"


class FISSheets:
    def __init__(self, spreadsheet_id: str = None):
        self.spreadsheet_id = spreadsheet_id or os.environ.get("FIS_SHEET_ID")
        if not self.spreadsheet_id:
            raise ValueError("FIS_SHEET_ID environment variable is required")

    # ── Core bridge call ─────────────────────────────────────────────────────

    def _bridge(self, operation: str, sheet_name: str,
                data=None, key_column: str = None) -> dict:
        payload = {
            "apiKey": BRIDGE_KEY,
            "operation": operation,
            "spreadsheetId": self.spreadsheet_id,
            "sheetName": sheet_name,
        }
        if data is not None:
            payload["data"] = data if isinstance(data, list) else [data]
        if key_column:
            payload["keyColumn"] = key_column

        try:
            r = requests.post(BRIDGE_URL, json=payload, allow_redirects=False, timeout=30)
            r.raise_for_status()
            location = r.headers.get("Location")
            if not location:
                logger.error(f"No redirect from Sheets Bridge for {sheet_name} {operation}")
                return {"error": "No redirect from bridge"}
            result = requests.get(location, timeout=30)
            return result.json()
        except Exception as e:
            logger.error(f"Sheets Bridge error ({sheet_name}, {operation}): {e}")
            return {"error": str(e)}

    # ── Config ────────────────────────────────────────────────────────────────

    def get_config(self) -> dict:
        result = self._bridge("read", SHEET_CONFIG)
        return {
            str(row.get("key", "")).strip(): str(row.get("value", "")).strip()
            for row in result.get("rows", [])
            if row.get("key")
        }

    # ── Appeal Index ──────────────────────────────────────────────────────────

    def get_appeal_index(self) -> list[dict]:
        """Return all campaigns from the Appeal Index tab."""
        result = self._bridge("read", SHEET_APPEAL_INDEX)
        return result.get("rows", [])

    def upsert_campaign(self, campaign: dict) -> dict:
        """Upsert a campaign row by sf_campaign_id."""
        return self._bridge("upsert", SHEET_APPEAL_INDEX,
                            data=campaign, key_column="sf_campaign_id")

    def bulk_upsert_campaigns(self, campaigns: list[dict]) -> None:
        for c in campaigns:
            self.upsert_campaign(c)
        logger.info(f"Upserted {len(campaigns)} campaigns to Appeal Index")

    # ── Donor Cache ───────────────────────────────────────────────────────────

    def get_donor_cache(self, limit: int = None) -> list[dict]:
        result = self._bridge("read", SHEET_DONOR_CACHE)
        rows = result.get("rows", [])
        return rows[:limit] if limit else rows

    def upsert_donor(self, donor: dict) -> dict:
        """Upsert a donor row by sf_id."""
        # Don't store large nested objects in Sheets
        flat = {k: v for k, v in donor.items()
                if not isinstance(v, (list, dict))}
        return self._bridge("upsert", SHEET_DONOR_CACHE,
                            data=flat, key_column="sf_id")

    def bulk_upsert_donors(self, donors: list[dict], batch_size: int = 50) -> None:
        """Write donors in batches to avoid bridge timeouts."""
        for i in range(0, len(donors), batch_size):
            batch = donors[i:i + batch_size]
            for d in batch:
                self.upsert_donor(d)
        logger.info(f"Upserted {len(donors)} donors to Donor Cache")

    # ── Actions ───────────────────────────────────────────────────────────────

    def get_actions(self, officer: str = None, status: str = None) -> list[dict]:
        """Return actions, optionally filtered by officer or status."""
        result = self._bridge("read", SHEET_ACTIONS)
        rows = result.get("rows", [])
        if officer:
            rows = [r for r in rows if r.get("gift_officer", "").lower() == officer.lower()]
        if status:
            rows = [r for r in rows if r.get("status", "").lower() == status.lower()]
        return rows

    def append_action(self, action: dict) -> dict:
        return self._bridge("append", SHEET_ACTIONS, data=action)

    def upsert_action(self, action: dict) -> dict:
        return self._bridge("upsert", SHEET_ACTIONS,
                            data=action, key_column="action_id")

    def bulk_upsert_actions(self, actions: list[dict]) -> None:
        for a in actions:
            self.upsert_action(a)
        logger.info(f"Upserted {len(actions)} actions")

    # ── Run Log ───────────────────────────────────────────────────────────────

    def log_run(self, run_type: str, stats: dict) -> None:
        self._bridge("append", SHEET_RUN_LOG, data={
            "timestamp": _now(),
            "run_type": run_type,
            "donors_processed": stats.get("donors_processed", 0),
            "campaigns_synced": stats.get("campaigns_synced", 0),
            "actions_generated": stats.get("actions_generated", 0),
            "errors": stats.get("errors", 0),
            "elapsed_seconds": stats.get("elapsed_seconds", 0),
            "notes": stats.get("notes", ""),
        })


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
