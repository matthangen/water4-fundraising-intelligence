# Water4 Fundraising Intelligence System (FIS)

A fully automated donor intelligence pipeline for Water4.org. Pulls live data from Salesforce, scores every donor with Claude AI, generates a prioritized action queue for gift officers, and serves everything through a React dashboard. Built entirely with Claude Code in a single session.

**Live dashboard:** https://matthangen.github.io/water4-fundraising-intelligence/

---

## What It Does

Every night the system runs three jobs in sequence:

1. **Salesforce Sync (2am)** — Pulls 5,000 donors and 500 campaigns from Salesforce NPSP into Google Cloud Storage.
2. **AI Analysis (3am)** — Sends each donor to Claude Haiku for RFM scoring, lapse risk prediction, upgrade propensity scoring, and a personalized narrative for the gift officer.
3. **Action Engine (4am)** — Reads the scored donors and generates a prioritized action queue per gift officer based on a stewardship calendar (thank-you calls, cultivation meetings, lapse recovery, upgrade asks, etc.).

Gift officers open the dashboard, see their action queue sorted by due date, complete activities with optional notes, and those completions are written back to Salesforce as Task records — automatically.

---

## Architecture

```
Salesforce NPSP
      │
      ▼
fis-sf-sync (Cloud Function)
  • Pulls contacts, opportunities, recurring donations
  • Normalizes into flat donor dicts
  • Writes donors/latest.json + campaigns/latest.json → GCS
      │
      ▼
fis-claude-analysis (Cloud Function)
  • Loads donors from GCS
  • Batches 10 donors per Claude Haiku API call
  • Outputs: RFM scores, upgrade_propensity, lapse_risk,
    ai_score (0-100), ask_amount, ask_rationale, ai_narrative
  • Merges results back into donors/latest.json → GCS
      │
      ▼
fis-action-engine (Cloud Function)
  • Loads scored donors from GCS
  • Applies stewardship calendar per donor tier
  • Generates actions: thank-yous, cultivation, lapse recovery,
    upgrade asks, recurring gift acknowledgements
  • Writes actions/latest.json → GCS
      │
      ▼
React Dashboard (GitHub Pages)
  • Reads GCS JSON directly in the browser
  • Action queue grouped by gift officer, sorted by due date
  • "Mark done" → fis-complete-action → GCS + Salesforce Task
```

**GCS (`water4-fis-data`) is the source of truth.** Google Sheets writes are best-effort only — the Apps Script bridge cannot accept connections from GCP Cloud Run due to SSL restrictions.

---

## Donor Scoring (Claude AI)

Each donor receives:

| Field | Type | Description |
|---|---|---|
| `rfm_recency` | 1–5 | Days since last gift (5 = gave last 90 days) |
| `rfm_frequency` | 1–5 | Lifetime gift count (5 = 10+ gifts) |
| `rfm_monetary` | 1–5 | Total giving tier (5 = Transformational $100K+) |
| `upgrade_propensity` | 0–1 | Likelihood to move up a tier this FY |
| `lapse_risk` | 0–1 | Likelihood to not give this FY |
| `ai_score` | 0–100 | Composite engagement score |
| `ask_amount` | $ | Recommended next ask |
| `ask_rationale` | text | 1–2 sentence rationale |
| `ai_narrative` | text | 3–5 sentence donor portrait for the gift officer |

Donors are re-scored every 7 days. The nightly batch processes 60 donors per run (6 batches of 10, 20s sleep between batches to respect Anthropic's 10K output token/min rate limit — ~120s total per run).

---

## Stewardship Calendar

The action engine applies a tier-based stewardship calendar. Each donor gets one calendar step per run based on days since their last gift:

| Tier | Annual Giving | Actions Generated |
|---|---|---|
| Transformational | $100K+ | Handwritten note → Impact call → Quarterly meeting → Field visit → Annual ask → Lapse recovery |
| Leadership | $25K–$99K | Handwritten note → 60-day call → Stewardship call → Annual ask → Lapse recovery |
| Major | $10K–$24K | Handwritten note → 90-day call → Impact report → Annual ask → Lapse recovery |
| Mid-Level | $5K–$9K | Thank-you call → Impact report → Annual ask → Lapse recovery |
| Donor | $1K–$4K | Thank-you email → Annual ask → Lapse recovery |
| Friend | $1–$999 | Annual appeal email |

Two additional rules run across all tiers:
- **Upgrade Ask** — donor at 70–99% of next tier threshold → cultivation meeting suggested
- **Recurring Ack** — recurring donor with payment due in 14 days → handwritten thank-you

On first run the system generated **4,505 actions** across all gift officers.

---

## Completing Actions

When a gift officer marks an action done in the dashboard:

1. An inline confirm panel appears with an optional notes field
2. On confirm, `fis-complete-action` (Cloud Function) is called
3. `actions/latest.json` in GCS is updated: `status: "completed"`, `completed_at`, `notes`
4. A Salesforce Task is created on the donor's Contact record: activity label, reason, and notes
5. The action moves to the Completed tab — state is persisted across page refreshes

Salesforce Task creation is non-fatal: if it fails the GCS state still saves.

---

## Stack

| Layer | Technology |
|---|---|
| Data source | Salesforce NPSP (simple-salesforce) |
| Compute | GCP Cloud Functions Gen2 (Python 3.13) |
| Storage | Google Cloud Storage (JSON blobs) |
| AI | Anthropic Claude Haiku (`claude-haiku-4-5-20251001`) |
| Secrets | GCP Secret Manager |
| Scheduling | Cloud Scheduler (cron) |
| Dashboard | React + Vite + Tailwind CSS |
| Hosting | GitHub Pages |
| Sheets bridge | Google Apps Script web app |

---

## Repository Structure

```
water4-fundraising-intelligence/
├── backend/
│   ├── shared/               # Shared module (copied into each function at deploy time)
│   │   ├── secrets.py        # GCP Secret Manager helpers
│   │   ├── sf_client.py      # Salesforce client + data normalization
│   │   └── sheets.py         # Google Sheets bridge (best-effort)
│   ├── sf_sync/              # Cloud Function: Salesforce → GCS
│   ├── claude_analysis/      # Cloud Function: Claude AI scoring
│   ├── action_engine/        # Cloud Function: stewardship action generator
│   └── complete_action/      # Cloud Function: mark action done → GCS + SF Task
├── frontend/
│   └── src/
│       ├── components/
│       │   ├── ActionsPanel.jsx    # Gift officer action queue
│       │   ├── DonorIntel.jsx      # Donor search + AI scores
│       │   ├── CampaignIndex.jsx   # Campaign analytics
│       │   └── PortfolioView.jsx   # Portfolio health overview
│       └── utils/
│           ├── api.js              # GCS + Cloud Function fetch helpers
│           └── tiers.js            # Tier classification + formatting
├── scripts/
│   └── deploy-frontend.sh    # Build + push to gh-pages branch
└── deploy.sh                 # Deploy all Cloud Functions to GCP
```

---

## GCP Resources

| Resource | Name |
|---|---|
| Project | `water4-org` |
| GCS Bucket | `water4-fis-data` |
| Cloud Functions | `fis-sf-sync`, `fis-claude-analysis`, `fis-action-engine`, `fis-complete-action` |
| Cloud Scheduler | Nightly at 2am, 3am, 4am UTC |
| Service Account | `fis-cloud-functions@water4-org.iam.gserviceaccount.com` |
| Secrets | `SF_CREDENTIALS`, `ANTHROPIC_API_KEY`, `GCS_BUCKET`, `FIS_SHEET_ID` |

---

## Setup (for a new environment)

### 1. GCP

```bash
# Create GCS bucket
gsutil mb -p water4-org gs://water4-fis-data

# Create service account
gcloud iam service-accounts create fis-cloud-functions \
  --project=water4-org --display-name="FIS Cloud Functions"

# Grant roles
gcloud projects add-iam-policy-binding water4-org \
  --member="serviceAccount:fis-cloud-functions@water4-org.iam.gserviceaccount.com" \
  --role="roles/storage.objectAdmin"
gcloud projects add-iam-policy-binding water4-org \
  --member="serviceAccount:fis-cloud-functions@water4-org.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

### 2. Secrets

```bash
# Salesforce credentials (JSON)
echo '{"username":"...","password":"...","security_token":"...","domain":"login"}' | \
  gcloud secrets create SF_CREDENTIALS --data-file=- --project=water4-org

# Anthropic API key
echo -n "sk-ant-..." | gcloud secrets create ANTHROPIC_API_KEY --data-file=- --project=water4-org

# GCS bucket name
echo -n "water4-fis-data" | gcloud secrets create GCS_BUCKET --data-file=- --project=water4-org

# FIS Control Sheet ID (optional — Sheets writes are disabled by default)
echo -n "your-sheet-id" | gcloud secrets create FIS_SHEET_ID --data-file=- --project=water4-org
```

### 3. Deploy

```bash
# Deploy all Cloud Functions
bash deploy.sh

# Fix Cloud Scheduler deadline for claude_analysis (takes ~4 min)
gcloud scheduler jobs update http fis-fis-claude-analysis \
  --attempt-deadline=300s --location=us-central1 --project=water4-org

# Run the pipeline manually (first time)
gcloud functions call fis-sf-sync --region=us-central1 --data='{}' --project=water4-org
gcloud functions call fis-claude-analysis --region=us-central1 --data='{}' --project=water4-org
gcloud functions call fis-action-engine --region=us-central1 --data='{}' --project=water4-org
```

### 4. Deploy dashboard

```bash
cd frontend && npm install
bash scripts/deploy-frontend.sh
# Enable GitHub Pages → gh-pages branch in repo settings
```

---

## Key Technical Decisions

**GCS as source of truth, not Sheets.** Google Apps Script web apps refuse SSL connections from GCP Cloud Run. Attempting to write to Sheets from Cloud Functions causes `SSLError: UNEXPECTED_EOF_WHILE_READING`. All Cloud Functions use `SHEETS_DISABLED=1` to skip Sheets Bridge calls. Sheets writes happen only from local scripts.

**Rate limit management.** Anthropic's org-level limit is 10,000 output tokens/minute. Each batch of 10 donors produces ~1,500 output tokens. Running 6 batches with 20s sleep between them totals ~120s and stays well under the limit. `MAX_DONORS_PER_RUN=60` fits within Cloud Scheduler's 300s attempt deadline.

**Action engine is stateless.** Every run regenerates all actions from scratch. This means if a donor's situation changes overnight (they made a gift, their score improved) the action queue reflects reality the next morning. Completed actions are preserved because `complete_action` writes `status: "completed"` back to the same JSON file.

**`complete_action` is the only public function.** The three batch functions use `--no-allow-unauthenticated` and are called via Cloud Scheduler with OIDC auth. `fis-complete-action` uses `--allow-unauthenticated` so the browser dashboard can call it directly without a GCP identity.

---

## Cost Estimate (monthly)

| Service | Usage | Est. Cost |
|---|---|---|
| Cloud Functions | 4 functions × ~30 runs/month | ~$0 (free tier) |
| Cloud Storage | ~10MB JSON, read/write daily | ~$0.01 |
| Claude Haiku | ~1,800 donors/month × ~2K tokens | ~$1–2 |
| Cloud Scheduler | 3 jobs | ~$0 (free tier) |
| GitHub Pages | Static hosting | Free |
| **Total** | | **~$2–3/month** |

---

## Built With

This system was designed and built entirely using [Claude Code](https://claude.ai/claude-code) (Anthropic's CLI coding assistant) in a single working session. The full pipeline — Salesforce integration, AI scoring, action engine, React dashboard, write-back to Salesforce, and deployment infrastructure — was produced through an iterative conversation, debugging live deployment errors in real time.
