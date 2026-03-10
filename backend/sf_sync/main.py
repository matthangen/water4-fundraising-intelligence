"""
sf_sync/main.py — Cloud Function: sync Salesforce data to GCS + Sheets.

Trigger: Cloud Scheduler (nightly at 2am UTC)
Entry point: sync_salesforce

Pulls contacts with giving history + campaigns from Salesforce,
writes full donor JSON blobs to GCS, and writes summary rows to the
FIS Control Sheet Donor Cache + Appeal Index tabs.
"""

import os
import json
import logging
import time
import functions_framework
from datetime import datetime, timezone
from google.cloud import storage

from shared.secrets import get_secret
from shared.sf_client import get_sf_client, fetch_all_donors, fetch_campaigns
from shared.sheets import FISSheets

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@functions_framework.http
def sync_salesforce(request):
    """HTTP Cloud Function entry point (also called by Cloud Scheduler)."""
    start = time.time()
    stats = {"donors_processed": 0, "campaigns_synced": 0, "errors": 0}

    try:
        sheet_id = get_secret("FIS_SHEET_ID")
        bucket_name = get_secret("GCS_BUCKET")

        sf = get_sf_client()
        sheets = FISSheets(spreadsheet_id=sheet_id)
        gcs = storage.Client()
        bucket = gcs.bucket(bucket_name)

        # ── Sync campaigns ────────────────────────────────────────────────────
        logger.info("Syncing campaigns...")
        campaigns = fetch_campaigns(sf, active_only=False)
        stats["campaigns_synced"] = len(campaigns)

        # GCS write is primary — must succeed
        bucket.blob("campaigns/latest.json").upload_from_string(
            json.dumps(campaigns, default=str), content_type="application/json"
        )
        logger.info(f"Wrote {len(campaigns)} campaigns to GCS")

        # Sheets write is best-effort
        try:
            sheets.bulk_upsert_campaigns(campaigns)
        except Exception as e:
            logger.warning(f"Sheets campaigns write skipped: {e}")

        # ── Sync donors ───────────────────────────────────────────────────────
        logger.info("Syncing donors...")
        donors = fetch_all_donors(sf)
        stats["donors_processed"] = len(donors)

        # GCS write is primary — must succeed
        bucket.blob("donors/latest.json").upload_from_string(
            json.dumps(donors, default=str), content_type="application/json"
        )
        logger.info(f"Wrote {len(donors)} donors to GCS")

        # Sheets write is best-effort
        try:
            sheets.bulk_upsert_donors(donors)
        except Exception as e:
            logger.warning(f"Sheets donors write skipped: {e}")

        # ── Finalize ─────────────────────────────────────────────────────────
        stats["elapsed_seconds"] = round(time.time() - start, 1)
        try:
            sheets.log_run("sf_sync", stats)
        except Exception as e:
            logger.warning(f"Sheets run log skipped: {e}")
        logger.info(f"sf_sync complete: {stats}")

        return {"status": "ok", "stats": stats}, 200

    except Exception as e:
        logger.exception(f"sf_sync failed: {e}")
        stats["errors"] += 1
        stats["elapsed_seconds"] = round(time.time() - start, 1)
        try:
            FISSheets().log_run("sf_sync", {**stats, "notes": str(e)})
        except Exception:
            pass
        return {"status": "error", "message": str(e)}, 500
