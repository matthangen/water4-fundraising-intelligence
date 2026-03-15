import { useState, useMemo } from 'react'
import { formatCurrency, formatDate, daysSince } from '../utils/tiers.js'

const SAVE_QUALIFICATION_URL = 'https://us-central1-water4-org.cloudfunctions.net/fis-save-qualification'

const MGO_OFFICERS = [
  { name: 'Matt Woll', sfId: '' },
  { name: 'Chad Missildine', sfId: '' },
  { name: 'Ted Ledbetter', sfId: '' },
  { name: 'Lisa Antonelli', sfId: '' },
]

export default function QualQueue({ donors, qualificationStatus, currentUser, onQualificationUpdate }) {
  const [expandedId, setExpandedId] = useState(null)
  const [showSkipped, setShowSkipped] = useState(false)
  const [toast, setToast] = useState(null)
  const [saving, setSaving] = useState(false)

  // Resolve MGO SF IDs from donor data
  const officers = useMemo(() => {
    return MGO_OFFICERS.map(o => ({
      ...o,
      sfId: donors.find(d => d.gift_officer === o.name)?.gift_officer_id || '',
    }))
  }, [donors])

  // Base filter: Donor Services + F>=4 + total_giving < 5000
  const baseDonors = useMemo(() => {
    return donors.filter(d =>
      d.gift_officer === 'Donor Services' &&
      (d.rfm_frequency || 0) >= 4 &&
      (d.total_giving || 0) < 5000
    )
  }, [donors])

  // Status helper
  function getStatus(sfId) {
    return qualificationStatus?.[sfId]?.status || 'not_screened'
  }

  // Summary counts (from base donors only)
  const summary = useMemo(() => {
    const total = baseDonors.length
    let notScreened = 0, inReview = 0, routed = 0, notQualified = 0
    for (const d of baseDonors) {
      const s = getStatus(d.sf_id)
      if (s === 'not_screened') notScreened++
      else if (s === 'in_review' || s === 'revisit_later') inReview++
      else if (s === 'qualified_routing') routed++
      else if (s === 'not_qualified') notQualified++
    }
    return { total, notScreened, inReview, routed, notQualified }
  }, [baseDonors, qualificationStatus])

  // Count of revisit_later donors
  const revisitCount = useMemo(() => {
    return baseDonors.filter(d => getStatus(d.sf_id) === 'revisit_later').length
  }, [baseDonors, qualificationStatus])

  // Queue filter: exclude not_qualified & qualified_routing; optionally exclude revisit_later
  const queueDonors = useMemo(() => {
    let list = baseDonors.filter(d => {
      const s = getStatus(d.sf_id)
      if (s === 'not_qualified' || s === 'qualified_routing') return false
      if (!showSkipped && s === 'revisit_later') return false
      return true
    })
    // Default sort: upgrade_propensity desc, rfm_frequency desc, gift_count desc
    list.sort((a, b) => {
      const upA = a.upgrade_propensity || 0, upB = b.upgrade_propensity || 0
      if (upB !== upA) return upB - upA
      const fA = a.rfm_frequency || 0, fB = b.rfm_frequency || 0
      if (fB !== fA) return fB - fA
      return (b.gift_count || 0) - (a.gift_count || 0)
    })
    return list
  }, [baseDonors, qualificationStatus, showSkipped])

  function showToast(message, type = 'blue') {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  async function saveQualification(donorSfId, donorAccountId, payload) {
    setSaving(true)
    try {
      const resp = await fetch(SAVE_QUALIFICATION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          donor_sf_id: donorSfId,
          donor_account_id: donorAccountId,
          screened_by: currentUser.email,
          ...payload,
        }),
      })
      if (!resp.ok) throw new Error(`Save failed: ${resp.status}`)
      const result = await resp.json()
      onQualificationUpdate(donorSfId, {
        ...payload,
        screened_by: currentUser.email,
        screened_at: payload.status === 'qualified_routing' || payload.status === 'not_qualified' ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      return result
    } finally {
      setSaving(false)
    }
  }

  async function handleSkip(donor) {
    try {
      const existing = qualificationStatus?.[donor.sf_id]
      await saveQualification(donor.sf_id, donor.account_id, {
        status: 'revisit_later',
        notes: existing?.notes || '',
      })
      showToast(`${donor.full_name} moved to revisit later.`, 'amber')
    } catch (e) {
      showToast(`Failed to skip: ${e.message}`, 'red')
    }
  }

  async function handleReview(donor) {
    setExpandedId(donor.sf_id)
    const s = getStatus(donor.sf_id)
    if (s === 'not_screened') {
      try {
        await saveQualification(donor.sf_id, donor.account_id, {
          status: 'in_review',
          notes: qualificationStatus?.[donor.sf_id]?.notes || '',
        })
      } catch (e) {
        showToast(`Failed to save review status: ${e.message}`, 'red')
      }
    }
  }

  const TOAST_COLORS = {
    green: 'bg-emerald-600 text-white',
    amber: 'bg-amber-500 text-white',
    blue: 'bg-blue-600 text-white',
    gray: 'bg-gray-600 text-white',
    red: 'bg-red-600 text-white',
  }

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${TOAST_COLORS[toast.type] || TOAST_COLORS.blue}`}>
          {toast.message}
        </div>
      )}

      {/* Summary row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <div className="bg-gray-100 rounded-xl p-4">
          <div className="text-2xl font-bold text-gray-800">{summary.total}</div>
          <div className="text-xs text-gray-500">Total</div>
        </div>
        <div className="bg-gray-100 rounded-xl p-4">
          <div className="text-2xl font-bold text-gray-800">{summary.notScreened}</div>
          <div className="text-xs text-gray-500">Not Screened</div>
        </div>
        <div className="bg-blue-100 rounded-xl p-4">
          <div className="text-2xl font-bold text-blue-700">{summary.inReview}</div>
          <div className="text-xs text-blue-600">In Review</div>
        </div>
        <div className="bg-emerald-100 rounded-xl p-4">
          <div className="text-2xl font-bold text-emerald-700">{summary.routed}</div>
          <div className="text-xs text-emerald-600">Routed</div>
        </div>
        <div className="bg-gray-100 rounded-xl p-4">
          <div className="text-2xl font-bold text-gray-800">{summary.notQualified}</div>
          <div className="text-xs text-gray-500">Not Qualified</div>
        </div>
      </div>

      {/* Show Skipped toggle */}
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => setShowSkipped(prev => !prev)}
          className={`text-sm px-3 py-1.5 rounded-lg font-medium transition-colors ${
            showSkipped
              ? 'bg-amber-500 text-white'
              : 'bg-white border border-gray-200 text-gray-600 hover:border-amber-400'
          }`}
        >
          {showSkipped ? 'Hide' : 'Show'} Skipped ({revisitCount})
        </button>
        <span className="text-xs text-gray-400">{queueDonors.length} donors in queue</span>
      </div>

      {/* Donor card list */}
      {queueDonors.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-400 text-sm">No donors in the qualification queue.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {queueDonors.map(donor => {
            const status = getStatus(donor.sf_id)
            const isExpanded = expandedId === donor.sf_id
            return (
              <div key={donor.sf_id}>
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                  <div className="p-4 flex items-start gap-4">
                    {/* Left side */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-gray-800">{donor.full_name}</span>
                        <FBadge frequency={donor.rfm_frequency} />
                        <StatusBadge status={status} />
                      </div>
                      <div className="mt-1 text-xs text-gray-500">
                        {donor.gift_count || 0} gifts &middot; {formatCurrency(donor.total_giving)} lifetime
                      </div>
                      <div className="text-xs text-gray-500">
                        {donor.last_gift_date
                          ? `${daysSince(donor.last_gift_date)}d ago`
                          : 'No gifts'}
                      </div>
                      {donor.ai_narrative && (
                        <p className="text-xs text-gray-400 italic mt-1">
                          {donor.ai_narrative.length > 120
                            ? donor.ai_narrative.slice(0, 120) + '...'
                            : donor.ai_narrative}
                        </p>
                      )}
                    </div>

                    {/* Right side */}
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <div className="flex items-center gap-2">
                        <UpgradeBadge value={donor.upgrade_propensity} />
                        {donor.ai_score != null && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600">
                            {Math.round(donor.ai_score)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleReview(donor)}
                          disabled={saving}
                          className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50"
                        >
                          Review
                        </button>
                        <button
                          onClick={() => handleSkip(donor)}
                          disabled={saving}
                          className="text-xs border border-gray-300 text-gray-600 hover:border-gray-400 px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50"
                        >
                          Skip
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Inline Qualification Panel */}
                {isExpanded && (
                  <QualificationPanel
                    donor={donor}
                    qualRecord={qualificationStatus?.[donor.sf_id]}
                    officers={officers}
                    saving={saving}
                    onSave={saveQualification}
                    onToast={showToast}
                    onClose={() => setExpandedId(null)}
                  />
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function FBadge({ frequency }) {
  if (!frequency) return null
  const f = Number(frequency)
  let color = 'bg-gray-100 text-gray-500'
  if (f >= 5) color = 'bg-teal-100 text-teal-700'
  else if (f >= 4) color = 'bg-blue-100 text-blue-700'
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${color}`}>
      F{f}
    </span>
  )
}

function StatusBadge({ status }) {
  if (status === 'in_review') {
    return <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-700">In Review</span>
  }
  if (status === 'revisit_later') {
    return <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700">Revisit Later</span>
  }
  return <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-500">Unscreened</span>
}

function UpgradeBadge({ value }) {
  if (value == null) return null
  const pct = Math.round(value * 100)
  let color = 'bg-gray-100 text-gray-600'
  if (pct >= 50) color = 'bg-emerald-100 text-emerald-700'
  else if (pct >= 30) color = 'bg-amber-100 text-amber-700'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${color}`}>
      {pct}%
    </span>
  )
}

function QualificationPanel({ donor, qualRecord, officers, saving: parentSaving, onSave, onToast, onClose }) {
  const [notes, setNotes] = useState(qualRecord?.notes || '')
  const [showRouting, setShowRouting] = useState(false)
  const [selectedOfficer, setSelectedOfficer] = useState(null)
  const [banner, setBanner] = useState(null)
  const [validationError, setValidationError] = useState(null)
  const [localSaving, setLocalSaving] = useState(false)

  const isSaving = parentSaving || localSaving

  async function handleQualifiedRoute() {
    setShowRouting(true)
    setValidationError(null)
  }

  async function handleConfirmRouting() {
    if (!selectedOfficer) return
    setLocalSaving(true)
    try {
      await onSave(donor.sf_id, donor.account_id, {
        status: 'qualified_routing',
        notes,
        routed_to: selectedOfficer.name,
        routed_to_sf_id: selectedOfficer.sfId,
      })
      setBanner({ message: `${donor.full_name} routed to ${selectedOfficer.name}. Stage updated to Identification and Qualification in Salesforce.`, type: 'green' })
      setTimeout(() => onClose(), 2000)
    } catch (e) {
      setValidationError(e.message || 'Save failed')
    } finally {
      setLocalSaving(false)
    }
  }

  async function handleNotQualified() {
    setValidationError(null)
    if (notes.length < 10) {
      setValidationError('Please add a brief note before marking as not qualified.')
      return
    }
    setLocalSaving(true)
    try {
      await onSave(donor.sf_id, donor.account_id, {
        status: 'not_qualified',
        notes,
      })
      setBanner({ message: `${donor.full_name} marked not qualified.`, type: 'gray' })
      setTimeout(() => onClose(), 2000)
    } catch (e) {
      setValidationError(e.message || 'Save failed')
    } finally {
      setLocalSaving(false)
    }
  }

  async function handleRevisit() {
    setLocalSaving(true)
    try {
      await onSave(donor.sf_id, donor.account_id, {
        status: 'revisit_later',
        notes,
      })
      onToast(`${donor.full_name} moved to revisit later.`, 'amber')
      onClose()
    } catch (e) {
      setValidationError(e.message || 'Save failed')
    } finally {
      setLocalSaving(false)
    }
  }

  async function handleSaveNotes() {
    setLocalSaving(true)
    try {
      await onSave(donor.sf_id, donor.account_id, {
        status: 'in_review',
        notes,
      })
      onToast('Notes saved.', 'blue')
    } catch (e) {
      setValidationError(e.message || 'Save failed')
    } finally {
      setLocalSaving(false)
    }
  }

  const BANNER_COLORS = {
    green: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    gray: 'bg-gray-50 border-gray-200 text-gray-700',
  }

  return (
    <div className="bg-white rounded-xl border border-blue-200 shadow-sm mt-1 p-4">
      {/* Banner */}
      {banner && (
        <div className={`mb-4 p-3 rounded-lg border text-sm font-medium ${BANNER_COLORS[banner.type] || BANNER_COLORS.gray}`}>
          {banner.message}
        </div>
      )}

      {/* Section A — AI Intelligence */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {/* Left: AI narrative */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">AI Intelligence</p>
          {donor.ai_narrative && (
            <p className="text-sm text-gray-700 leading-relaxed mb-3">{donor.ai_narrative}</p>
          )}
          {donor.ask_amount && (
            <p className="text-sm font-medium text-gray-800">
              Recommended Ask: {formatCurrency(donor.ask_amount)}
            </p>
          )}
          {donor.ask_rationale && (
            <p className="text-xs text-gray-500 italic mt-1">{donor.ask_rationale}</p>
          )}
        </div>

        {/* Right: Giving History */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Giving History</p>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-500">Total Giving</span>
              <span className="font-semibold">{formatCurrency(donor.total_giving)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">This FY</span>
              <span className="font-semibold">{formatCurrency(donor.giving_this_fy)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Last FY</span>
              <span className="font-semibold">{formatCurrency(donor.giving_last_fy)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Last Gift</span>
              <span className="font-semibold">
                {donor.last_gift_date
                  ? `${formatDate(donor.last_gift_date)} (${daysSince(donor.last_gift_date)}d ago)`
                  : '—'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Gift Count</span>
              <span className="font-semibold">{donor.gift_count || 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-500">RFM</span>
              <span className="inline-flex gap-1 font-mono">
                <span className="bg-gray-100 px-1.5 rounded text-gray-600">R{donor.rfm_recency ?? '?'}</span>
                <span className="bg-gray-100 px-1.5 rounded text-gray-600">F{donor.rfm_frequency ?? '?'}</span>
                <span className="bg-gray-100 px-1.5 rounded text-gray-600">M{donor.rfm_monetary ?? '?'}</span>
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Upgrade</span>
              <span className="font-semibold">
                {donor.upgrade_propensity != null ? `${Math.round(donor.upgrade_propensity * 100)}%` : '—'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Lapse Risk</span>
              <span className="font-semibold">
                {donor.lapse_risk != null ? `${Math.round(donor.lapse_risk * 100)}%` : '—'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">AI Score</span>
              <span className="font-semibold">{donor.ai_score != null ? Math.round(donor.ai_score) : '—'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Section B — Qualification Decision */}
      <div className="border-t border-gray-200 pt-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Qualification Decision</p>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          className="w-full border border-gray-300 rounded-lg p-3 text-sm"
          rows={4}
          placeholder="What did you find? Employer, professional title, board memberships, property or business ownership, foundation affiliation, other nonprofits supported..."
          disabled={isSaving}
        />

        {validationError && (
          <p className="text-xs text-red-600 mt-1">{validationError}</p>
        )}

        {/* Decision buttons */}
        {!showRouting && (
          <div className="flex flex-wrap gap-2 mt-3">
            <button
              onClick={handleQualifiedRoute}
              disabled={isSaving}
              className="text-sm bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              Qualified — Route to MGO
            </button>
            <button
              onClick={handleNotQualified}
              disabled={isSaving}
              className="text-sm bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              Not Qualified
            </button>
            <button
              onClick={handleRevisit}
              disabled={isSaving}
              className="text-sm bg-amber-100 hover:bg-amber-200 text-amber-700 px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              Revisit in 6 Months
            </button>
            <button
              onClick={handleSaveNotes}
              disabled={isSaving}
              className="text-sm border border-blue-500 text-blue-600 hover:bg-blue-50 px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              Save Notes
            </button>
          </div>
        )}

        {/* Officer routing selector */}
        {showRouting && (
          <div className="mt-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Select MGO for Routing</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
              {officers.map(o => (
                <div
                  key={o.name}
                  onClick={() => !isSaving && setSelectedOfficer(o)}
                  className={`cursor-pointer rounded-lg border-2 p-3 text-center transition-colors ${
                    selectedOfficer?.name === o.name
                      ? 'border-teal-500 bg-teal-50'
                      : 'border-gray-200 hover:border-gray-300'
                  } ${isSaving ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <div className="flex items-center justify-center gap-2">
                    <div className={`w-3 h-3 rounded-full border-2 ${
                      selectedOfficer?.name === o.name
                        ? 'border-teal-500 bg-teal-500'
                        : 'border-gray-300'
                    }`} />
                    <span className="text-sm font-medium text-gray-700">{o.name}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleConfirmRouting}
                disabled={isSaving || !selectedOfficer}
                className="text-sm bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                {isSaving ? 'Saving...' : 'Confirm Routing'}
              </button>
              <button
                onClick={() => { setShowRouting(false); setSelectedOfficer(null) }}
                disabled={isSaving}
                className="text-sm border border-gray-200 text-gray-600 hover:border-gray-400 px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
