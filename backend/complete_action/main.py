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
    held_meaningful_conversation = payload.get("held_meaningful_conversation", "").strip()
    owner_sf_id = payload.get("owner_sf_id", "").strip()

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
        if held_meaningful_conversation:
            task["Held_Meaningful_Conversation__c"] = held_meaningful_conversation
        if owner_sf_id:
            task["OwnerId"] = owner_sf_id
        elif action.get("gift_officer_sf_id"):
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


@functions_framework.http
def update_pipeline_info(request):
    """Update pipeline information fields on a Salesforce Account.

    POST { "account_id": "001...", "stage_entry_date": "2026-01-15",
           "current_action_plan_date": "2026-03-01",
           "current_action_plan": "...", "previous_action_plan": "..." }
    """
    if request.method == "OPTIONS":
        return "", 204, CORS_HEADERS

    if request.method != "POST":
        return _resp({"status": "error", "message": "POST required"}, 405)

    try:
        payload = request.get_json(silent=True) or {}
    except Exception:
        payload = {}

    account_id = payload.get("account_id", "").strip()
    if not account_id:
        return _resp({"status": "error", "message": "account_id required"}, 400)

    # Build update dict — only include fields that are provided
    update_fields = {}
    if "stage_entry_date" in payload and payload["stage_entry_date"]:
        update_fields["Stage_Entry_Date__c"] = payload["stage_entry_date"]
    if "current_action_plan_date" in payload and payload["current_action_plan_date"]:
        update_fields["Current_Action_Plan_Date__c"] = payload["current_action_plan_date"]
    if "current_action_plan" in payload:
        update_fields["Current_Action_Plan__c"] = payload["current_action_plan"]
    if "previous_action_plan" in payload:
        update_fields["Previous_Action_Plan__c"] = payload["previous_action_plan"]

    if not update_fields:
        return _resp({"status": "error", "message": "No fields to update"}, 400)

    try:
        sf = get_sf_client()
        sf.Account.update(account_id, update_fields)
        logger.info(f"Updated pipeline info for Account {account_id}: {list(update_fields.keys())}")
    except Exception as e:
        logger.error(f"SF update_pipeline_info failed: {e}")
        return _resp({"status": "error", "message": f"Salesforce update failed: {e}"}, 500)

    return _resp({"status": "ok", "account_id": account_id, "fields_updated": list(update_fields.keys())})


@functions_framework.http
def log_ask(request):
    """Log an Ask as a Salesforce Opportunity.

    POST { "account_id": "001...", "donor_sf_id": "003...",
           "amount_requested": 5000, "due_date": "2026-06-01",
           "ask_type": "Major Gift", "contact_name": "...",
           "confidence_level": "High", "organization_name": "...",
           "donor_type": "Individual", "style_of_ask": "In Person",
           "comments": "...", "owner_sf_id": "005..." }
    """
    if request.method == "OPTIONS":
        return "", 204, CORS_HEADERS

    if request.method != "POST":
        return _resp({"status": "error", "message": "POST required"}, 405)

    try:
        payload = request.get_json(silent=True) or {}
    except Exception:
        payload = {}

    account_id = payload.get("account_id", "").strip()
    amount = payload.get("amount_requested", 0)
    if not account_id:
        return _resp({"status": "error", "message": "account_id required"}, 400)
    if not amount:
        return _resp({"status": "error", "message": "amount_requested required"}, 400)

    due_date = payload.get("due_date", "").strip()
    if not due_date:
        due_date = datetime.now(CT).strftime("%Y-%m-%d")

    ask_type = payload.get("ask_type", "").strip() or "Donation"
    contact_name = payload.get("contact_name", "").strip()
    confidence = payload.get("confidence_level", "").strip()
    org_name = payload.get("organization_name", "").strip()
    donor_type = payload.get("donor_type", "").strip()
    style = payload.get("style_of_ask", "").strip()
    comments = payload.get("comments", "").strip()
    owner_sf_id = payload.get("owner_sf_id", "").strip()

    # Build description from all fields
    desc_parts = []
    if contact_name:
        desc_parts.append(f"Contact: {contact_name}")
    if confidence:
        desc_parts.append(f"Confidence: {confidence}")
    if org_name:
        desc_parts.append(f"Organization: {org_name}")
    if donor_type:
        desc_parts.append(f"Donor Type: {donor_type}")
    if style:
        desc_parts.append(f"Style of Ask: {style}")
    if comments:
        desc_parts.append(f"\nComments: {comments}")
    description = "\n".join(desc_parts)

    try:
        sf = get_sf_client()

        # Create Opportunity
        opp = {
            "AccountId": account_id,
            "Name": f"[FIS Ask] {contact_name or 'Ask'} - {ask_type}",
            "Amount": float(amount),
            "CloseDate": due_date,
            "StageName": "Prospecting",
            "Type": ask_type,
            "Description": description,
        }
        if owner_sf_id:
            opp["OwnerId"] = owner_sf_id

        result = sf.Opportunity.create(opp)
        opp_id = result.get("id", "")
        logger.info(f"Created Opportunity {opp_id} for Account {account_id}")

        # Also log as a completed Task for activity tracking
        task = {
            "WhatId": account_id,
            "Subject": f"[FIS] Ask logged: ${amount:,.2f} ({ask_type})",
            "Status": "Completed",
            "ActivityDate": datetime.now(CT).strftime("%Y-%m-%d"),
            "Description": description,
        }
        if owner_sf_id:
            task["OwnerId"] = owner_sf_id
        sf.Task.create(task)

    except Exception as e:
        logger.error(f"SF log_ask failed: {e}")
        return _resp({"status": "error", "message": f"Salesforce create failed: {e}"}, 500)

    return _resp({"status": "ok", "account_id": account_id, "opportunity_id": opp_id, "amount": float(amount)})


@functions_framework.http
def log_meaningful_conversation(request):
    """Log a 'Held Meaningful Conversation' Task in Salesforce.

    POST { "account_id": "001...", "donor_sf_id": "003...",
           "held_meaningful_conversation": "Yes - In Person",
           "notes": "...", "owner_sf_id": "005..." }
    """
    if request.method == "OPTIONS":
        return "", 204, CORS_HEADERS

    if request.method != "POST":
        return _resp({"status": "error", "message": "POST required"}, 405)

    try:
        payload = request.get_json(silent=True) or {}
    except Exception:
        payload = {}

    account_id = payload.get("account_id", "").strip()
    donor_sf_id = payload.get("donor_sf_id", "").strip()
    conversation_value = payload.get("held_meaningful_conversation", "").strip()
    notes = payload.get("notes", "").strip()
    owner_sf_id = payload.get("owner_sf_id", "").strip()

    if not conversation_value:
        return _resp({"status": "error", "message": "held_meaningful_conversation required"}, 400)

    try:
        sf = get_sf_client()
        task = {
            "WhoId": donor_sf_id or None,
            "WhatId": account_id or None,
            "Subject": f"[FIS] Meaningful Conversation: {conversation_value}",
            "Status": "Completed",
            "ActivityDate": datetime.now(CT).strftime("%Y-%m-%d"),
            "Held_Meaningful_Conversation__c": conversation_value,
        }
        if notes:
            task["Description"] = notes
        if owner_sf_id:
            task["OwnerId"] = owner_sf_id
        result = sf.Task.create(task)
        task_id = result.get("id", "")
        logger.info(f"Created meaningful conversation Task {task_id} for {donor_sf_id or account_id}")
    except Exception as e:
        logger.error(f"SF log_meaningful_conversation failed: {e}")
        return _resp({"status": "error", "message": f"Salesforce create failed: {e}"}, 500)

    return _resp({"status": "ok", "task_id": task_id, "held_meaningful_conversation": conversation_value})
