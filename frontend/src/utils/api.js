/**
 * api.js — FIS data loading utilities.
 *
 * In production, data is served from GCS public URLs or a Cloud Function proxy.
 * In development, falls back to sample JSON files in public/.
 *
 * Data sources (set in .env.local or environment):
 *   VITE_GCS_BASE_URL  — GCS base URL (e.g. https://storage.googleapis.com/water4-fis-data)
 *   VITE_API_BASE_URL  — Cloud Function base URL for on-demand refresh endpoints
 */

const GCS_BASE  = import.meta.env.VITE_GCS_BASE_URL
  || 'https://storage.googleapis.com/water4-fis-data'
const API_BASE  = import.meta.env.VITE_API_BASE_URL   || null
const COMPLETE_ACTION_URL = import.meta.env.VITE_COMPLETE_ACTION_URL
  || 'https://us-central1-water4-org.cloudfunctions.net/fis-complete-action'
const UPDATE_STAGE_URL = import.meta.env.VITE_UPDATE_STAGE_URL
  || 'https://us-central1-water4-org.cloudfunctions.net/fis-update-stage'
const UPDATE_PIPELINE_INFO_URL = import.meta.env.VITE_UPDATE_PIPELINE_INFO_URL
  || 'https://us-central1-water4-org.cloudfunctions.net/fis-update-pipeline-info'
const LOG_MEANINGFUL_CONVERSATION_URL = import.meta.env.VITE_LOG_MEANINGFUL_CONVERSATION_URL
  || 'https://us-central1-water4-org.cloudfunctions.net/fis-log-meaningful-conversation'
const LOG_ASK_URL = import.meta.env.VITE_LOG_ASK_URL
  || 'https://us-central1-water4-org.cloudfunctions.net/fis-log-ask'

export const STAGES = [
  'Blocked',
  'Identification and Qualification',
  'Cultivation',
  'Discovery',
  'Co-Design',
  'Proposal',
  'Decision Making',
  'Closing and Onboarding',
  'Stewardship and Retention',
  'Referrals & Network Expansion',
]

export async function fetchDonors() {
  const r = await fetch(`${GCS_BASE}/donors/latest.json`)
  if (!r.ok) throw new Error(`Failed to load donors: ${r.status}`)
  return r.json()
}

export async function fetchCampaigns() {
  const r = await fetch(`${GCS_BASE}/campaigns/latest.json`)
  if (!r.ok) throw new Error(`Failed to load campaigns: ${r.status}`)
  return r.json()
}

export async function fetchActions() {
  const r = await fetch(`${GCS_BASE}/actions/latest.json`)
  if (!r.ok) throw new Error(`Failed to load actions: ${r.status}`)
  return r.json()
}

/**
 * Mark a gift officer action as completed.
 * Posts to fis-complete-action, updates GCS and creates a Salesforce Task.
 */
export async function completeAction(actionId, notes = '', heldMeaningfulConversation = '', ownerSfId = '') {
  const payload = { action_id: actionId, notes }
  if (heldMeaningfulConversation) {
    payload.held_meaningful_conversation = heldMeaningfulConversation
  }
  if (ownerSfId) {
    payload.owner_sf_id = ownerSfId
  }
  const r = await fetch(COMPLETE_ACTION_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!r.ok) {
    let msg = `Complete failed: ${r.status}`
    try { const e = await r.json(); msg = e.message || msg } catch {}
    throw new Error(msg)
  }
  return r.json()
}

/**
 * Update a donor's pipeline stage in Salesforce.
 */
export async function updateStage(accountId, stage, notes = '', ownerSfId = '', contactSfId = '') {
  const payload = { account_id: accountId, stage, notes, owner_sf_id: ownerSfId }
  if (contactSfId) payload.contact_sf_id = contactSfId
  const r = await fetch(UPDATE_STAGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!r.ok) {
    let msg = `Stage update failed: ${r.status}`
    try { const e = await r.json(); msg = e.message || msg } catch {}
    throw new Error(msg)
  }
  return r.json()
}

/**
 * Log a "Held Meaningful Conversation" task in Salesforce.
 */
export async function logMeaningfulConversation(data) {
  const r = await fetch(LOG_MEANINGFUL_CONVERSATION_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!r.ok) {
    let msg = `Log conversation failed: ${r.status}`
    try { const e = await r.json(); msg = e.message || msg } catch {}
    throw new Error(msg)
  }
  return r.json()
}

/**
 * Update pipeline information fields on a donor's Account in Salesforce.
 * Fields: Stage_Entry_Date__c, Current_Action_Plan_Date__c, Current_Action_Plan__c, Previous_Action_Plan__c
 */
export async function updatePipelineInfo(accountId, fields, ownerSfId = '') {
  const r = await fetch(UPDATE_PIPELINE_INFO_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account_id: accountId, ...fields, owner_sf_id: ownerSfId }),
  })
  if (!r.ok) {
    let msg = `Pipeline info update failed: ${r.status}`
    try { const e = await r.json(); msg = e.message || msg } catch {}
    throw new Error(msg)
  }
  return r.json()
}

/**
 * Log an Ask in Salesforce (creates an Opportunity).
 */
export async function logAsk(data) {
  const r = await fetch(LOG_ASK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!r.ok) {
    let msg = `Log ask failed: ${r.status}`
    try { const e = await r.json(); msg = e.message || msg } catch {}
    throw new Error(msg)
  }
  return r.json()
}

/**
 * Trigger on-demand re-analysis of a single donor.
 * Requires VITE_API_BASE_URL to be set.
 */
export async function refreshDonor(sfId) {
  if (!API_BASE) throw new Error('VITE_API_BASE_URL not configured')
  const r = await fetch(`${API_BASE}/analyze_donor?sf_id=${encodeURIComponent(sfId)}`, {
    method: 'POST',
  })
  if (!r.ok) throw new Error(`Refresh failed: ${r.status}`)
  return r.json()
}

/**
 * Trigger on-demand re-analysis of a single campaign.
 */
export async function refreshCampaign(sfId) {
  if (!API_BASE) throw new Error('VITE_API_BASE_URL not configured')
  const r = await fetch(`${API_BASE}/analyze_campaign?sf_id=${encodeURIComponent(sfId)}`, {
    method: 'POST',
  })
  if (!r.ok) throw new Error(`Refresh failed: ${r.status}`)
  return r.json()
}
