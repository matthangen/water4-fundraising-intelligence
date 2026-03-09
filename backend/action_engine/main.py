"""
action_engine/main.py — Cloud Function: generate prioritized gift officer actions.

Trigger: Cloud Scheduler (nightly after claude_analysis), or HTTP for on-demand
Entry point: generate_actions

Reads analyzed donor data from GCS and generates an action queue per gift officer:
  - Lapse-risk outreach (highest priority)
  - Upgrade cultivation asks
  - Recurring donation acknowledgements
  - Major donor stewardship touches
  - Campaign follow-up for non-respondents

Each action written to the FIS Control Sheet "Actions" tab and GCS.
"""

import os
import json
import logging
import time
import uuid
import functions_framework
from datetime import datetime, timezone, timedelta
from google.cloud import storage

from shared.secrets import get_secret
from shared.sheets import FISSheets

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Priority tiers (lower number = higher priority)
PRI_URGENT  = 1   # Lapsing major/leadership donor
PRI_HIGH    = 2   # Upgrade candidate, recent lapse
PRI_MEDIUM  = 3   # Routine cultivation
PRI_LOW     = 4   # Mass stewardship, informational

ACTION_TYPES = {
    "lapse_outreach":      {"label": "Lapse Recovery Call",      "activity": "call"},
    "upgrade_ask":         {"label": "Upgrade Cultivation Ask",   "activity": "meeting"},
    "stewardship_call":    {"label": "Stewardship Check-in",     "activity": "call"},
    "impact_report":       {"label": "Send Impact Report",       "activity": "impact_report"},
    "recurring_ack":       {"label": "Recurring Gift Thank-You", "activity": "handwritten_note"},
    "campaign_followup":   {"label": "Campaign Follow-Up",       "activity": "email"},
    "major_cultivation":   {"label": "Major Donor Cultivation",  "activity": "meeting"},
}

# Tier definitions (annual giving thresholds)
TIER_ORDER = ["transformational", "leadership", "major", "mid_level", "donor", "friend"]
TIER_MIN   = {
    "transformational": 100000,
    "leadership":        25000,
    "major":             10000,
    "mid_level":          5000,
    "donor":              1000,
    "friend":                1,
}


def _classify_tier(amount: float) -> str:
    for tier in TIER_ORDER:
        if amount >= TIER_MIN[tier]:
            return tier
    return "friend"


@functions_framework.http
def generate_actions(request):
    """Generate the action queue for all gift officers."""
    start = time.time()
    stats = {"actions_generated": 0, "errors": 0}

    sheet_id = get_secret("FIS_SHEET_ID")
    bucket_name = get_secret("GCS_BUCKET")
    sheets = FISSheets(spreadsheet_id=sheet_id)
    gcs = storage.Client()
    bucket = gcs.bucket(bucket_name)

    try:
        donors = json.loads(bucket.blob("donors/latest.json").download_as_text())
    except Exception as e:
        return {"status": "error", "message": f"Could not load donors: {e}"}, 500

    actions = []
    now = datetime.now(timezone.utc)

    for d in donors:
        donor_actions = _generate_donor_actions(d, now)
        actions.extend(donor_actions)

    # Sort by priority then by ai_score descending (most engaged high-priority donors first)
    actions.sort(key=lambda a: (a["priority"], -float(a.get("donor_ai_score") or 0)))

    # Write to GCS
    bucket.blob("actions/latest.json").upload_from_string(
        json.dumps(actions, default=str), content_type="application/json"
    )

    # Write to Sheets
    sheets.bulk_upsert_actions(actions)
    stats["actions_generated"] = len(actions)

    stats["elapsed_seconds"] = round(time.time() - start, 1)
    sheets.log_run("action_engine", stats)
    logger.info(f"generate_actions complete: {stats}")
    return {"status": "ok", "stats": stats, "action_count": len(actions)}, 200


def _generate_donor_actions(d: dict, now: datetime) -> list[dict]:
    """Generate all applicable actions for one donor."""
    actions = []

    total = float(d.get("total_giving") or 0)
    this_fy = float(d.get("giving_this_fy") or 0)
    last_fy = float(d.get("giving_last_fy") or 0)
    gift_count = int(d.get("gift_count") or 0)
    lapse_risk = float(d.get("lapse_risk") or 0.5)
    upgrade_prop = float(d.get("upgrade_propensity") or 0.3)
    ai_score = d.get("ai_score")
    is_recurring = bool(d.get("is_recurring"))
    last_gift_date = d.get("last_gift_date", "")
    gift_officer = d.get("gift_officer", "Unassigned")
    name = d.get("full_name", "Unknown")
    sf_id = d.get("sf_id", "")

    current_tier = _classify_tier(max(this_fy, last_fy, total / max(gift_count, 1)))

    # Calculate days since last gift
    days_since_gift = None
    if last_gift_date:
        try:
            lg = datetime.fromisoformat(last_gift_date.replace("Z", "+00:00"))
            if lg.tzinfo is None:
                lg = lg.replace(tzinfo=timezone.utc)
            days_since_gift = (now - lg).days
        except Exception:
            pass

    # ── Action: Lapse Recovery ────────────────────────────────────────────────
    if lapse_risk >= 0.6 and days_since_gift and days_since_gift > 300:
        tier_weight = {"transformational": PRI_URGENT, "leadership": PRI_URGENT,
                       "major": PRI_HIGH, "mid_level": PRI_HIGH}.get(current_tier, PRI_MEDIUM)
        actions.append(_make_action(
            action_type="lapse_outreach",
            donor=d,
            priority=tier_weight,
            reason=f"Lapse risk {lapse_risk:.0%} — {days_since_gift} days since last gift",
            due_days=7,
        ))

    # ── Action: Upgrade Cultivation ───────────────────────────────────────────
    elif upgrade_prop >= 0.6 and current_tier in ("mid_level", "donor", "major", "leadership"):
        ask = int(d.get("ask_amount") or 0)
        next_tier_label = TIER_ORDER[max(0, TIER_ORDER.index(current_tier) - 1)]
        actions.append(_make_action(
            action_type="upgrade_ask",
            donor=d,
            priority=PRI_HIGH,
            reason=f"Upgrade propensity {upgrade_prop:.0%} — suggest ${ask:,} ask for {next_tier_label}",
            due_days=14,
        ))

    # ── Action: Major Donor Cultivation ──────────────────────────────────────
    elif current_tier in ("transformational", "leadership", "major") and lapse_risk < 0.5:
        if not days_since_gift or days_since_gift > 90:
            actions.append(_make_action(
                action_type="major_cultivation",
                donor=d,
                priority=PRI_MEDIUM,
                reason=f"Major donor cultivation — {current_tier} tier, {days_since_gift or 'unknown'} days since contact",
                due_days=30,
            ))

    # ── Action: Recurring Gift Acknowledgement ────────────────────────────────
    if is_recurring:
        rd_next = d.get("rd_next_payment", "")
        if rd_next:
            try:
                next_pay = datetime.fromisoformat(rd_next)
                if next_pay.tzinfo is None:
                    next_pay = next_pay.replace(tzinfo=timezone.utc)
                days_to_payment = (next_pay - now).days
                if 0 <= days_to_payment <= 14:
                    actions.append(_make_action(
                        action_type="recurring_ack",
                        donor=d,
                        priority=PRI_MEDIUM,
                        reason=f"Recurring gift of ${d.get('rd_amount', 0):,.0f} due in {days_to_payment} days",
                        due_days=days_to_payment,
                    ))
            except Exception:
                pass

    return actions


def _make_action(action_type: str, donor: dict, priority: int, reason: str, due_days: int) -> dict:
    """Create a standardized action dict."""
    now = datetime.now(timezone.utc)
    due_date = (now + timedelta(days=due_days)).strftime("%Y-%m-%d")
    meta = ACTION_TYPES.get(action_type, {"label": action_type, "activity": "call"})
    ask = donor.get("ask_amount")

    return {
        "action_id":      f"A{uuid.uuid4().hex[:8].upper()}",
        "created_at":     now.strftime("%Y-%m-%d %H:%M:%S UTC"),
        "due_date":       due_date,
        "priority":       priority,
        "action_type":    action_type,
        "activity":       meta["activity"],
        "label":          meta["label"],
        "gift_officer":   donor.get("gift_officer", "Unassigned"),
        "donor_name":     donor.get("full_name", "Unknown"),
        "donor_sf_id":    donor.get("sf_id", ""),
        "donor_tier":     _classify_tier(max(
            float(donor.get("giving_this_fy") or 0),
            float(donor.get("giving_last_fy") or 0),
        )),
        "donor_ai_score": donor.get("ai_score"),
        "ask_amount":     ask,
        "reason":         reason,
        "ai_narrative":   donor.get("ai_narrative", ""),
        "status":         "pending",
        "completed_at":   "",
        "notes":          "",
    }
