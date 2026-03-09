"""
setup_salesforce.py — One-time Salesforce credential setup for the FIS.
Run locally: python setup/setup_salesforce.py

Prompts for Salesforce Connected App credentials and stores them in
GCP Secret Manager as SF_CREDENTIALS (JSON).

Prerequisites:
  1. Create a Connected App in Salesforce Setup:
       Setup → Apps → App Manager → New Connected App
       - Enable OAuth Settings
       - Callback URL: https://login.salesforce.com/services/oauth2/success
       - Selected OAuth Scopes: api, refresh_token
       - Enable Client Credentials Flow: checked
  2. Note your Consumer Key (client_id) and Consumer Secret (client_secret)
  3. Get your Salesforce Security Token:
       My Settings → Personal → Reset My Security Token
"""

import json
import getpass
import sys
import os

# Add parent to path for shared imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.shared.secrets import create_or_update_secret

PROJECT_ID  = "water4-org"
SECRET_NAME = "SF_CREDENTIALS"


def main():
    print("=== Water4 FIS — Salesforce Credential Setup ===\n")
    print("This stores your Salesforce credentials securely in GCP Secret Manager.")
    print("They will never be written to disk or committed to git.\n")

    print("Salesforce login domain:")
    print("  'login'  — production org (default)")
    print("  'test'   — sandbox org")
    domain = input("Domain [login]: ").strip() or "login"

    username = input("Salesforce username (e.g. matt@water4.org): ").strip()
    if not username:
        print("ERROR: Username is required.")
        sys.exit(1)

    password = getpass.getpass("Salesforce password: ")
    security_token = getpass.getpass("Security token (from My Settings → Reset Security Token): ")

    creds = {
        "username":       username,
        "password":       password,
        "security_token": security_token,
        "domain":         domain,
    }

    print(f"\nStoring credentials for {username} in Secret Manager as '{SECRET_NAME}'...")
    try:
        create_or_update_secret(SECRET_NAME, json.dumps(creds))
        print(f"\n✅ SF_CREDENTIALS stored in Secret Manager (project: {PROJECT_ID})")
        print("\nNext steps:")
        print("  1. Run setup/setup_sheets.py to create the FIS Control Sheet")
        print("  2. Run setup/setup_gcs.py to create the GCS bucket")
        print("  3. Deploy Cloud Functions: ./deploy.sh")
        print("  4. Run sf_sync manually to populate initial data")
    except Exception as e:
        print(f"\n❌ Failed to store credentials: {e}")
        print("Make sure you're authenticated: gcloud auth application-default login")
        sys.exit(1)


if __name__ == "__main__":
    main()
