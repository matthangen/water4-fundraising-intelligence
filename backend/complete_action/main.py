"""
complete_action/main.py — Cloud Function: mark a gift officer action as completed,
and update a donor's pipeline stage in Salesforce.

Trigger: HTTP POST from browser (--allow-unauthenticated)
Entry points: complete_action, update_stage

complete_action: POST { "action_id": "A...", "notes": "..." }
- Updates action status in GCS (actions/latest.json)
- Creates a Salesforce Task against the donor (non-fatal if SF fails)
Returns: { "status": "ok", "action_id": "...", "completed_at": "..." }

update_stage: POST { "account_id": "001...", "stage": "Cultivation", "notes": "..." }
- Updates Account.Stage__c in Salesforce (Organization level)
Returns: { "status": "ok", "account_id": "...", "stage": "..." }
"""

import json
import logging
import functions_framework
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from google.cloud import storage

CT = ZoneInfo("America/Chicago")

from shared.secrets import get_secret
from shared.sf_client import get_sf_client

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "3600",
}


def _resp(body, status=200):
    headers = {**CORS_HEADERS, "Content-Type": "application/json"}
    return json.dumps(body), status, headers


@functions_framework.http
def complete_action(request):
    if request.method == "OPTIONS":
        return "", 204, CORS_HEADERS

    if request.method != "POST":
        return _resp({"status": "error", "message": "POST required"}, 405)

    try:
        payload = request.get_json(silent=True) or {}
    except Exception:
        payload = {}

    action_id = payload.get("action_id", "").strip()
    notes = payload.get("notes", "").strip()

    if not action_id:
        return _resp({"status": "error", "message": "action_id required"}, 400)

    bucket_name = get_secret("GCS_BUCKET")
    gcs = storage.Client()
    bucket = gcs.bucket(bucket_name)
    blob = bucket.blob("actions/latest.json")

    try:
        actions = json.loads(blob.download_as_text())
    except Exception as e:
        logger.error(f"Could not load actions/latest.json: {e}")
        return _resp({"status": "error", "message": "Could not load actions"}, 500)

    action = next((a for a in actions if a.get("action_id") == action_id), None)
    if action is None:
        return _resp({"status": "error", "message": f"Action {action_id} not found"}, 404)

    now = datetime.now(timezone.utc)
    completed_at = now.strftime("%Y-%m-%d %H:%M:%S UTC")
    action["status"] = "completed"
    action["completed_at"] = completed_at
    action["notes"] = notes

    try:
        blob.upload_from_string(
            json.dumps(actions, default=str),
            content_type="application/json",
        )
        logger.info(f"Action {action_id} marked complete in GCS")
    except Exception as e:
        logger.error(f"GCS write failed: {e}")
        return _resp({"status": "error", "message": "Could not save action"}, 500)

    # Create Salesforce Task — non-fatal
    sf_error = None
    try:
        sf = get_sf_client()
        description = action.get("reason", "")
        if notes:
            description += f"\n\nNotes: {notes}"
        task = {
            "WhoId": action.get("donor_sf_id"),
            "Subject": f"[FIS] {action.get('label', action_id)}",
            "Status": "Completed",
            "ActivityDate": datetime.now(CT).strftime("%Y-%m-%d"),
            "Description": description,
        }
        if action.get("gift_officer_sf_id"):
            task["OwnerId"] = action["gift_officer_sf_id"]
        sf.Task.create(task)
        logger.info(f"SF Task created for action {action_id}, donor {action.get('donor_sf_id')}")
    except Exception as e:
        logger.warning(f"SF Task creation failed (non-fatal): {e}")
        sf_error = str(e)

    response = {"status": "ok", "action_id": action_id, "completed_at": completed_at}
    if sf_error:
        response["sf_warning"] = sf_error
    return _resp(response)


@functions_framework.http
def update_stage(request):
    if request.method == "OPTIONS":
        return "", 204, CORS_HEADERS

    if request.method != "POST":
        return _resp({"status": "error", "message": "POST required"}, 405)

    try:
        payload = request.get_json(silent=True) or {}
    except Exception:
        payload = {}

    account_id = payload.get("account_id", "").strip()
    contact_id = payload.get("sf_id", "").strip()  # legacy fallback
    stage = payload.get("stage", "").strip()
    notes = payload.get("notes", "").strip()
    owner_sf_id = payload.get("owner_sf_id", "").strip()

    if not account_id and not contact_id:
        return _resp({"status": "error", "message": "account_id required"}, 400)
    if not stage:
        return _resp({"status": "error", "message": "stage required"}, 400)

    try:
        sf = get_sf_client()
        # Update Stage__c on Account (Organization level)
        if account_id:
            sf.Account.update(account_id, {"Stage__c": stage})
            logger.info(f"Updated Account.Stage__c to '{stage}' for Account {account_id}")
        elif contact_id:
            # Legacy: if only contact_id provided, look up account and update that
            result = sf.query(f"SELECT AccountId FROM Contact WHERE Id = '{contact_id}' LIMIT 1")
            if result["records"]:
                acct_id = result["records"][0]["AccountId"]
                sf.Account.update(acct_id, {"Stage__c": stage})
                account_id = acct_id
                logger.info(f"Updated Account.Stage__c to '{stage}' for Account {acct_id} via Contact {contact_id}")

        if notes:
            now = datetime.now(timezone.utc)
            task = {
                "WhoId": contact_id or None,
                "WhatId": account_id or None,
                "Subject": f"[FIS] Pipeline stage updated: {stage}",
                "Status": "Completed",
                "ActivityDate": datetime.now(CT).strftime("%Y-%m-%d"),
                "Description": notes,
            }
            if owner_sf_id:
                task["OwnerId"] = owner_sf_id
            sf.Task.create(task)
    except Exception as e:
        logger.error(f"SF update_stage failed: {e}")
        return _resp({"status": "error", "message": f"Salesforce update failed: {e}"}, 500)

    return _resp({"status": "ok", "account_id": account_id, "stage": stage})
