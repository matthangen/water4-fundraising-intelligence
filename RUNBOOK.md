# Fundraising Intelligence System (FIS) — Operations Runbook

## Quick Reference

| Item | Value |
|------|-------|
| **Live URL** | https://fis-dashboard-858529887340.us-central1.run.app |
| **GCP Project** | water4-org |
| **Cloud Run Service** | fis-dashboard (us-central1) |
| **GitHub Repo** | https://github.com/water4-org/water4-fundraising-intelligence |
| **Auth** | Google OAuth (@water4.org only) |
| **Data Bucket** | gs://water4-fis-data |

---

## System Overview

FIS is a 5-layer pipeline that runs nightly:

```
1. fis-sf-sync       (2am CT)  → Pulls donors, campaigns, activities from Salesforce → GCS
2. fis-claude-analysis (3am CT) → Claude Haiku scores 800 donors per run (RFM, propensity, risk)
3. fis-action-engine  (4am CT)  → Generates prioritized actions for gift officers → GCS
4. fis-dashboard      (always)  → React frontend on Cloud Run, reads from GCS
5. fis-complete-action (on demand) → Writes back to Salesforce when officers complete actions
```

Additional on-demand Cloud Functions:
- `fis-update-pipeline-info` — Updates Account fields in Salesforce
- `fis-log-ask` — Creates Opportunity + Task in Salesforce
- `fis-log-meaningful-conversation` — Creates Task with picklist values in Salesforce

---

## Deploying

### Deploy frontend (React dashboard)
```bash
cd ~/claude-work/water4-fundraising-intelligence
bash scripts/deploy-cloud-run.sh
```

### Deploy all Cloud Functions
```bash
bash deploy.sh
```

### Deploy a single Cloud Function
```bash
bash deploy.sh sf_sync          # or claude_analysis, action_engine, complete_action
```

### Deploy new on-demand functions
The `deploy.sh` script includes sections for all 6 functions. Each deploys as gen2, python313, us-central1, 256MB (except sf_sync at 1GB and claude_analysis at 1GB/3600s timeout).

---

## Monitoring

### Check nightly sync ran
```bash
# Check sf_sync logs
gcloud functions logs read fis-sf-sync --project=water4-org --limit=20 --gen2

# Check claude_analysis logs
gcloud functions logs read fis-claude-analysis --project=water4-org --limit=20 --gen2

# Check action_engine logs
gcloud functions logs read fis-action-engine --project=water4-org --limit=20 --gen2
```

### Check data freshness in GCS
```bash
gsutil ls -l gs://water4-fis-data/donors.json
gsutil ls -l gs://water4-fis-data/actions.json
gsutil ls -l gs://water4-fis-data/campaigns.json
```
The dates should be today (updated at 2am CT by sf_sync, 4am CT by action_engine).

### Check Cloud Run logs
```bash
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="fis-dashboard" AND severity>=ERROR' --project=water4-org --limit=20 --freshness=1h
```

---

## Troubleshooting

### Nightly sync didn't run
**Symptom:** Data in GCS is stale (not updated today).
**Cause:** Cloud Scheduler job failed or function errored.
**Fix:**
1. Check scheduler: `gcloud scheduler jobs list --project=water4-org --location=us-central1`
2. Manually trigger: `gcloud functions call fis-sf-sync --project=water4-org --gen2 --region=us-central1`
3. Note: The gcloud CLI may timeout after 5 minutes — the function itself has a 1-hour timeout and will continue running.

### Claude analysis running slowly
**Symptom:** Not all donors analyzed after several nights.
**Cause:** 800 donors per run × ~50 min. 5,000 donors takes ~7 nights to fully analyze.
**This is normal.** Analysis runs nightly and processes the next batch. Once fully analyzed, subsequent runs only re-analyze donors with new activity.

### Salesforce write-back fails
**Symptom:** Actions completed in FIS but Tasks don't appear in Salesforce.
**Cause:** Salesforce API credentials expired or field permissions changed.
**Fix:**
1. Check the function logs: `gcloud functions logs read fis-complete-action --project=water4-org --limit=20 --gen2`
2. Verify SF credentials in Secret Manager: `gcloud secrets list --project=water4-org --filter="name:salesforce"`
3. Common issue: Salesforce session expired. The Connected App should auto-refresh, but if not, update the refresh token.

### Login issues
Same as Pipeline tool — see Pipeline RUNBOOK. Both share the same `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

Required OAuth redirect URI: `https://fis-dashboard-858529887340.us-central1.run.app/api/auth/callback`

---

## Secrets

| Secret Name | What It Does |
|-------------|-------------|
| `GOOGLE_CLIENT_ID` | OAuth client ID (shared with Pipeline) |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret (shared with Pipeline) |
| `salesforce-client-id` | Salesforce Connected App client ID |
| `salesforce-client-secret` | Salesforce Connected App client secret |
| `salesforce-refresh-token` | Salesforce OAuth refresh token |
| `anthropic-api-key` | Claude API key for donor analysis |
| `fis-nextauth-secret` | JWT signing key for FIS frontend |

### Rotate Salesforce credentials
1. Generate new credentials in Salesforce Setup → App Manager → Connected App
2. Update in Secret Manager:
   ```bash
   echo -n 'new-value' | gcloud secrets versions add salesforce-client-secret --data-file=- --project=water4-org
   ```
3. Redeploy affected functions: `bash deploy.sh`

### Rotate Anthropic API key
1. Generate new key at https://console.anthropic.com/
2. Update: `echo -n 'new-key' | gcloud secrets versions add anthropic-api-key --data-file=- --project=water4-org`
3. Redeploy: `bash deploy.sh claude_analysis`

---

## Data Model

### GCS Bucket: water4-fis-data
| File | Updated By | Schedule | Contents |
|------|-----------|----------|----------|
| `donors.json` | fis-sf-sync | 2am CT | ~5,000 donor records with giving history, activities |
| `campaigns.json` | fis-sf-sync | 2am CT | Campaign data from Salesforce |
| `analyzed_donors.json` | fis-claude-analysis | 3am CT | Donors with AI scores and narratives |
| `actions.json` | fis-action-engine | 4am CT | 4,500+ prioritized actions for gift officers |

### Key Salesforce fields
- Donor stage: `Account.Stage__c` (mapped to `d.stage`)
- Stage entry date: `Account.Stage_Entry_Date__c`
- Action plan date: `Account.Current_Action_Plan_Date__c`
- Meaningful conversation: `Task.Held_Meaningful_Conversation__c` (multi-select picklist, semicolon-separated)

---

## Key Files

### Backend (Cloud Functions)
- `backend/shared/sf_client.py` — Salesforce API client, donor/activity fetching
- `backend/sf_sync/main.py` — Nightly Salesforce → GCS sync
- `backend/claude_analysis/main.py` — Claude Haiku batch analysis
- `backend/action_engine/main.py` — Action generation logic
- `backend/complete_action/main.py` — All write-back functions (complete, pipeline info, log ask, meaningful conversation)

### Frontend (React + Vite)
- `frontend/src/utils/api.js` — All API endpoints and fetch functions
- `frontend/src/components/DonorIntel.jsx` — Donor detail view, pipeline info, log ask, meaningful conversation
- `frontend/src/components/ActionsPanel.jsx` — Action queue with completion workflow
- `frontend/src/components/PortfolioView.jsx` — Officer portfolio view (200 donor caseload target)

### Deployment
- `deploy.sh` — Deploy all or individual Cloud Functions
- `scripts/deploy-cloud-run.sh` — Deploy frontend to Cloud Run

---

## Active Staff (Salesforce Owners)
- Matt Woll
- Matt Hangen
- Chad Misseldine
- Ted Ledbetter
- Lisa Antonelli

Capacity target: 200 donors per officer (RECOMMENDED_CASELOAD in PortfolioView.jsx).
