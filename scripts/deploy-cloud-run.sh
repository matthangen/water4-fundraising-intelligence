#!/bin/bash
# deploy-cloud-run.sh — Build and deploy FIS dashboard to Cloud Run with Google OAuth
set -e

PROJECT="water4-org"
REGION="us-central1"
SERVICE="fis-dashboard"
IMAGE="gcr.io/$PROJECT/$SERVICE"

echo "=== Water4 FIS — Deploy to Cloud Run ==="

# Step 1: Build React frontend
echo "Building React frontend (base: /)..."
cd "$(dirname "$0")/../frontend"
VITE_BASE_PATH=/ npm run build
cd ..

# Step 2: Copy build into auth server static dir
echo "Copying build to auth server..."
rm -rf backend/auth_server/static
cp -r frontend/dist backend/auth_server/static

# Step 3: Build & push image via Cloud Build (no local Docker needed)
echo "Building and pushing Docker image via Cloud Build..."
gcloud builds submit backend/auth_server/ \
  --tag="$IMAGE" \
  --project="$PROJECT"

# Step 4: Deploy to Cloud Run
echo "Deploying to Cloud Run..."
gcloud run deploy "$SERVICE" \
  --image="$IMAGE" \
  --platform=managed \
  --region="$REGION" \
  --project="$PROJECT" \
  --allow-unauthenticated \
  --set-secrets="GOOGLE_CLIENT_ID=GOOGLE_CLIENT_ID:latest,GOOGLE_CLIENT_SECRET=GOOGLE_CLIENT_SECRET:latest,FIS_SESSION_SECRET=FIS_SESSION_SECRET:latest" \
  --set-env-vars="GCP_PROJECT=$PROJECT,SHEETS_DISABLED=1" \
  --service-account="fis-cloud-functions@${PROJECT}.iam.gserviceaccount.com" \
  --memory=512Mi \
  --timeout=60s \
  --min-instances=0 \
  --max-instances=3

URL=$(gcloud run services describe "$SERVICE" \
  --region="$REGION" --project="$PROJECT" \
  --format="value(status.url)")

echo ""
echo "✅ Deployed: $URL"
echo ""
echo "⚠️  Add this redirect URI to your Google OAuth app:"
echo "   $URL/auth/callback"
echo ""
echo "   Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client IDs"
echo "   → your client → Authorized redirect URIs → Add URI"
