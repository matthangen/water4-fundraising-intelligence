"""
setup_gcs.py — Create the GCS bucket for FIS data staging.
Run locally: python setup/setup_gcs.py

Creates bucket: water4-fis-data
Structure:
  donors/latest.json         — full donor list with analysis
  campaigns/latest.json      — full campaign list with analysis
  actions/latest.json        — current action queue

Stores bucket name in Secret Manager as GCS_BUCKET.
"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from google.cloud import storage
from backend.shared.secrets import create_or_update_secret

PROJECT_ID  = "water4-org"
BUCKET_NAME = "water4-fis-data"
REGION      = "us-central1"


def main():
    print("=== Water4 FIS — GCS Setup ===\n")

    gcs = storage.Client(project=PROJECT_ID)

    # Create bucket if not exists
    try:
        bucket = gcs.create_bucket(BUCKET_NAME, location=REGION)
        print(f"✅ Created bucket: gs://{BUCKET_NAME} in {REGION}")
    except Exception as e:
        if "already exists" in str(e).lower() or "409" in str(e):
            bucket = gcs.bucket(BUCKET_NAME)
            print(f"Bucket gs://{BUCKET_NAME} already exists — using existing.")
        else:
            print(f"❌ Failed to create bucket: {e}")
            sys.exit(1)

    # Set uniform bucket-level access
    bucket.iam_configuration.uniform_bucket_level_access_enabled = True
    bucket.patch()
    print("  Enabled uniform bucket-level access")

    # Seed placeholder files
    for path, content in [
        ("donors/latest.json",   "[]"),
        ("campaigns/latest.json", "[]"),
        ("actions/latest.json",   "[]"),
    ]:
        blob = bucket.blob(path)
        if not blob.exists():
            blob.upload_from_string(content, content_type="application/json")
            print(f"  Created: gs://{BUCKET_NAME}/{path}")

    # Store in Secret Manager
    try:
        create_or_update_secret("GCS_BUCKET", BUCKET_NAME)
        print(f"\n✅ GCS_BUCKET stored in Secret Manager as '{BUCKET_NAME}'")
    except Exception as e:
        print(f"WARNING: Could not store in Secret Manager: {e}")
        print(f"Set env var manually: export GCS_BUCKET={BUCKET_NAME}")

    print(f"\nBucket ready: gs://{BUCKET_NAME}")
    print("\nNext steps:")
    print("  1. Deploy Cloud Functions: ./deploy.sh")
    print("  2. Trigger sf_sync: gcloud functions call sf_sync --region=us-central1")


if __name__ == "__main__":
    main()
