"""
secrets.py — GCP Secret Manager helper for the Fundraising Intelligence System.

Secrets stored (all in project water4-org):
  SF_CREDENTIALS      — JSON: {username, password, security_token, domain}
  FIS_SHEET_ID        — Google Sheets ID for the FIS Control Sheet
  GCS_BUCKET          — GCS bucket name for donor/campaign data staging
"""

import json
import logging
from functools import lru_cache
from google.cloud import secretmanager

logger = logging.getLogger(__name__)
PROJECT_ID = "water4-org"


@lru_cache(maxsize=32)
def get_secret(secret_name: str) -> str:
    """Retrieve the latest version of a Secret Manager secret (cached per process)."""
    client = secretmanager.SecretManagerServiceClient()
    name = f"projects/{PROJECT_ID}/secrets/{secret_name}/versions/latest"
    response = client.access_secret_version(request={"name": name})
    return response.payload.data.decode("utf-8")


def get_secret_json(secret_name: str) -> dict:
    """Retrieve and parse a JSON secret."""
    return json.loads(get_secret(secret_name))


def create_or_update_secret(secret_name: str, value: str) -> None:
    """Create or update a secret in Secret Manager."""
    client = secretmanager.SecretManagerServiceClient()
    parent = f"projects/{PROJECT_ID}"

    try:
        client.create_secret(request={
            "parent": parent,
            "secret_id": secret_name,
            "secret": {"replication": {"automatic": {}}},
        })
        logger.info(f"Created secret: {secret_name}")
    except Exception:
        logger.info(f"Secret {secret_name} already exists, adding new version.")

    client.add_secret_version(request={
        "parent": f"{parent}/secrets/{secret_name}",
        "payload": {"data": value.encode("utf-8")},
    })
    logger.info(f"Updated secret: {secret_name}")
