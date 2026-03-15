import json
import logging
import functions_framework
from datetime import datetime, timezone
from google.cloud import storage
import requests

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

BUCKET_NAME = "water4-fis-data"
STATUS_BLOB = "qualification/status.json"
UPDATE_STAGE_URL = "https://us-central1-water4-org.cloudfunctions.net/fis-update-stage"

def _cors_headers():
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    }

@functions_framework.http
def save_qualification(request):
    # CORS preflight
    if request.method == "OPTIONS":
        return ("", 204, _cors_headers())

    if request.method != "POST":
        return (json.dumps({"error": "POST only"}), 405, _cors_headers())

    try:
        body = request.get_json(force=True)
    except Exception:
        return (json.dumps({"error": "Invalid JSON"}), 400, _cors_headers())

    donor_sf_id = body.get("donor_sf_id")
    if not donor_sf_id:
        return (json.dumps({"error": "donor_sf_id required"}), 400, _cors_headers())

    status = body.get("status", "in_review")
    notes = body.get("notes", "")
    routed_to = body.get("routed_to")
    routed_to_sf_id = body.get("routed_to_sf_id")
    screened_by = body.get("screened_by")
    donor_account_id = body.get("donor_account_id")

    gcs = storage.Client()
    bucket = gcs.bucket(BUCKET_NAME)
    blob = bucket.blob(STATUS_BLOB)

    # Read existing status file (or create empty)
    try:
        data = json.loads(blob.download_as_text())
    except Exception:
        data = {}

    now = datetime.now(timezone.utc).isoformat()

    # Upsert record
    existing = data.get(donor_sf_id, {})
    record = {
        "status": status,
        "notes": notes if notes else existing.get("notes", ""),
        "routed_to": routed_to,
        "routed_to_sf_id": routed_to_sf_id,
        "screened_by": screened_by or existing.get("screened_by"),
        "screened_at": now if status in ("qualified_routing", "not_qualified") else existing.get("screened_at"),
        "updated_at": now,
    }
    data[donor_sf_id] = record

    # Write back
    try:
        blob.upload_from_string(
            json.dumps(data, default=str),
            content_type="application/json"
        )
    except Exception as e:
        logger.error(f"GCS write failed for {donor_sf_id}: {e}")
        return (json.dumps({"error": f"Failed to save: {e}"}), 500, _cors_headers())

    logger.info(f"Qualification saved: {donor_sf_id} → {status}")

    # If qualified_routing, update stage in Salesforce
    if status == "qualified_routing" and donor_account_id:
        try:
            resp = requests.post(UPDATE_STAGE_URL, json={
                "account_id": donor_account_id,
                "stage": "Identification and Qualification",
                "notes": f"Qualified by Donor Services. Routed to {routed_to or 'MGO'}.",
            }, timeout=30)
            if not resp.ok:
                logger.warning(f"Stage update failed for {donor_account_id}: {resp.status_code}")
        except Exception as e:
            logger.warning(f"Stage update error for {donor_account_id}: {e}")

    return (json.dumps({"success": True, "donor_sf_id": donor_sf_id}), 200, _cors_headers())
