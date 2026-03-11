import { useState, useMemo } from 'react'
import { formatCurrency, formatDate, classifyTier, daysSince } from '../utils/tiers.js'
import { STAGES, updateStage } from '../utils/api.js'
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'

const SORT_OPTIONS = [
  { id: 'ai_score',         label: 'AI Score'         },
  { id: 'lapse_risk',       label: 'Lapse Risk'       },
  { id: 'upgrade_prop',     label: 'Upgrade Propensity'},
  { id: 'total_giving',     label: 'Total Giving'     },
  { id: 'giving_this_fy',   label: 'This FY'          },
  { id: 'last_gift_date',   label: 'Last Gift'        },
]

function ScorePill({ value, invert = false, size = 'sm' }) {
  if (value === null || value === undefined) return <span className="text-gray-300 text-xs">—</span>
  const n = Number(value)
  const pct = invert ? (1 - n) * 100 : n > 1 ? n : n * 100
  const color = pct >= 70 ? (invert ? 'bg-red-500' : 'bg-emerald-500')
              : pct >= 40 ? 'bg-amber-500'
              : (invert ? 'bg-emerald-500' : 'bg-red-400')
  const label = n > 1 ? `${Math.round(n)}` : `${Math.round(n * 100)}%`
  return (
    <span className={`inline-flex items-center gap-1 text-white text-xs font-semibold px-2 py-0.5 rounded-full ${color}`}>
      {label}
    </span>
  )
}

function RFMBadge({ r, f, m }) {
  if (!r && !f && !m) return null
  return (
    <span className="inline-flex gap-1 text-xs font-mono text-gray-500">
      <span title="Recency"   className="bg-gray-100 px-1.5 rounded">R{r ?? '?'}</span>
      <span title="Frequency" className="bg-gray-100 px-1.5 rounded">F{f ?? '?'}</span>
      <span title="Monetary"  className="bg-gray-100 px-1.5 rounded">M{m ?? '?'}</span>
    </span>
  )
}

export default function DonorIntel({ donors, currentUser }) {
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('ai_score')
  const [tierFilter, setTierFilter] = useState('all')
  const [page, setPage] = useState(0)
  const [expanded, setExpanded] = useState(null)
  const PAGE_SIZE = 25

  const filtered = useMemo(() => {
    let list = donors
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(d =>
        d.full_name?.toLowerCase().includes(q) ||
        d.email?.toLowerCase().includes(q) ||
        d.city?.toLowerCase().includes(q)
      )
    }
    if (tierFilter !== 'all') {
      list = list.filter(d => {
        const tier = classifyTier(Math.max(d.giving_this_fy || 0, d.giving_last_fy || 0))
        return tier.id === tierFilter
      })
    }
    return [...list].sort((a, b) => {
      switch (sortBy) {
        case 'ai_score':       return (b.ai_score || 0) - (a.ai_score || 0)
        case 'lapse_risk':     return (b.lapse_risk || 0) - (a.lapse_risk || 0)
        case 'upgrade_prop':   return (b.upgrade_propensity || 0) - (a.upgrade_propensity || 0)
        case 'total_giving':   return (b.total_giving || 0) - (a.total_giving || 0)
        case 'giving_this_fy': return (b.giving_this_fy || 0) - (a.giving_this_fy || 0)
        case 'last_gift_date': return (b.last_gift_date || '').localeCompare(a.last_gift_date || '')
        default: return 0
      }
    })
  }, [donors, search, sortBy, tierFilter])

  const pages = Math.ceil(filtered.length / PAGE_SIZE)
  const shown = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  return (
    <div>
      {/* Controls */}
      <div className="flex flex-wrap gap-3 mb-5">
        <input
          type="search"
          placeholder="Search donors..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(0) }}
          className="flex-1 min-w-48 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal"
        />
        <select
          value={tierFilter}
          onChange={e => { setTierFilter(e.target.value); setPage(0) }}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white focus:outline-none focus:border-teal"
        >
          <option value="all">All Tiers</option>
          {['transformational','leadership','major','mid_level','donor','friend'].map(t => (
            <option key={t} value={t}>{t.replace('_', '-')}</option>
          ))}
        </select>
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white focus:outline-none focus:border-teal"
        >
          {SORT_OPTIONS.map(o => (
            <option key={o.id} value={o.id}>Sort: {o.label}</option>
          ))}
        </select>
      </div>

      <p className="text-xs text-gray-400 mb-3">
        {filtered.length} donors {search || tierFilter !== 'all' ? '(filtered)' : ''}
      </p>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Donor</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Tier</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">This FY</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Last Gift</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">AI Score</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Lapse Risk</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Upgrade</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">RFM</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Ask</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {shown.map(donor => {
                const tier = classifyTier(Math.max(donor.giving_this_fy || 0, donor.giving_last_fy || 0))
                const isExpanded = expanded === donor.sf_id
                return [
                  <tr
                    key={donor.sf_id}
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => setExpanded(isExpanded ? null : donor.sf_id)}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-800">{donor.full_name}</div>
                      {donor.gift_officer && (
                        <div className="text-xs text-gray-400">{donor.gift_officer}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border ${tier.bg} ${tier.text} ${tier.border}`}>
                        {tier.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-gray-800">
                      {formatCurrency(donor.giving_this_fy, true)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500 text-xs">
                      {donor.last_gift_date ? `${daysSince(donor.last_gift_date)}d ago` : '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <ScorePill value={donor.ai_score} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <ScorePill value={donor.lapse_risk} invert />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <ScorePill value={donor.upgrade_propensity} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <RFMBadge r={donor.rfm_recency} f={donor.rfm_frequency} m={donor.rfm_monetary} />
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-teal text-xs">
                      {donor.ask_amount ? formatCurrency(donor.ask_amount, true) : '—'}
                    </td>
                  </tr>,
                  isExpanded && (
                    <tr key={`${donor.sf_id}-exp`} className="bg-teal/5">
                      <td colSpan={9} className="px-4 py-4">
                        <DonorDetail donor={donor} currentUser={currentUser} />
                      </td>
                    </tr>
                  )
                ]
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:border-teal transition-colors"
          >
            ←
          </button>
          <span className="text-sm text-gray-500">Page {page + 1} of {pages}</span>
          <button
            onClick={() => setPage(p => Math.min(pages - 1, p + 1))}
            disabled={page === pages - 1}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:border-teal transition-colors"
          >
            →
          </button>
        </div>
      )}
    </div>
  )
}

function DonorDetail({ donor, currentUser }) {
  const [stage, setStage] = useState(donor.stage || '')
  const [pendingStage, setPendingStage] = useState(stage)
  const [stageNotes, setStageNotes] = useState('')
  const [stageSaving, setStageSaving] = useState(false)
  const [stageError, setStageError] = useState(null)
  const [stageSaved, setStageSaved] = useState(false)

  const stageChanged = pendingStage !== stage

  async function handleSaveStage() {
    if (!stageChanged) return
    setStageSaving(true)
    setStageError(null)
    setStageSaved(false)
    try {
      await updateStage(donor.account_id, pendingStage, stageNotes, currentUser?.sf_user_id)
      setStage(pendingStage)
      setStageNotes('')
      setStageSaved(true)
      setTimeout(() => setStageSaved(false), 3000)
    } catch (e) {
      setStageError(e.message || 'Save failed')
    } finally {
      setStageSaving(false)
    }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {donor.ai_narrative && (
        <div className="md:col-span-2 bg-white rounded-lg p-3 border border-teal/20">
          <p className="text-xs font-semibold text-teal/70 uppercase tracking-wider mb-1">AI Donor Portrait</p>
          <p className="text-sm text-gray-700 leading-relaxed">{donor.ai_narrative}</p>
        </div>
      )}

      {/* Donor Profile Radar + Engagement + Giving Comparison */}
      <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Radar chart */}
        <div className="bg-white rounded-lg p-3 border border-gray-200">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Donor Profile</p>
          <ResponsiveContainer width="100%" height={200}>
            <RadarChart data={[
              { metric: 'AI Score',  value: Math.min((donor.ai_score || 0), 100), fullMark: 100 },
              { metric: 'Retention', value: Math.round((1 - (donor.lapse_risk || 0)) * 100), fullMark: 100 },
              { metric: 'Upgrade',   value: Math.round((donor.upgrade_propensity || 0) * 100), fullMark: 100 },
              { metric: 'Recency',   value: (donor.rfm_recency || 0) * 20, fullMark: 100 },
              { metric: 'Frequency', value: (donor.rfm_frequency || 0) * 20, fullMark: 100 },
              { metric: 'Monetary',  value: (donor.rfm_monetary || 0) * 20, fullMark: 100 },
            ]}>
              <PolarGrid stroke="#e5e7eb" />
              <PolarAngleAxis dataKey="metric" tick={{ fontSize: 10, fill: '#6b7280' }} />
              <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
              <Radar dataKey="value" stroke="#1B4D5C" fill="#1B4D5C" fillOpacity={0.25} strokeWidth={2} />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* Engagement Score */}
        <div className="bg-white rounded-lg p-3 border border-gray-200">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Engagement Score</p>
          {(() => {
            const score = donor.ai_score || 0
            const lapse = donor.lapse_risk || 0
            const upgrade = donor.upgrade_propensity || 0
            // Composite engagement: weighted blend
            const engagement = Math.round(score * 0.4 + (1 - lapse) * 100 * 0.3 + upgrade * 100 * 0.3)
            const color = engagement >= 70 ? '#059669' : engagement >= 40 ? '#D97706' : '#EF4444'
            const ringPct = Math.min(engagement, 100)
            return (
              <div className="flex flex-col items-center">
                <div className="relative w-28 h-28">
                  <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                    <circle cx="50" cy="50" r="42" fill="none" stroke="#f3f4f6" strokeWidth="8" />
                    <circle cx="50" cy="50" r="42" fill="none" stroke={color} strokeWidth="8"
                      strokeDasharray={`${ringPct * 2.64} 264`} strokeLinecap="round" />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-2xl font-bold" style={{ color }}>{engagement}</span>
                  </div>
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  {engagement >= 70 ? 'Highly Engaged' : engagement >= 40 ? 'Moderately Engaged' : 'Low Engagement'}
                </p>
                <div className="mt-3 w-full space-y-1 text-xs">
                  <div className="flex justify-between"><span className="text-gray-500">AI Score</span><span className="font-semibold">{score}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Lapse Risk</span><span className="font-semibold">{(lapse * 100).toFixed(0)}%</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Upgrade</span><span className="font-semibold">{(upgrade * 100).toFixed(0)}%</span></div>
                  {donor.days_since_last_gift != null && (
                    <div className="flex justify-between"><span className="text-gray-500">Days Since Gift</span><span className="font-semibold">{donor.days_since_last_gift ?? daysSince(donor.last_gift_date) ?? '—'}</span></div>
                  )}
                </div>
              </div>
            )
          })()}
        </div>

        {/* Giving Comparison + Next Ask */}
        <div className="bg-white rounded-lg p-3 border border-gray-200 flex flex-col">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Giving Comparison</p>
          <ResponsiveContainer width="100%" height={120}>
            <BarChart data={[
              { name: 'Last FY', value: donor.giving_last_fy || 0 },
              { name: 'This FY', value: donor.giving_this_fy || 0 },
              ...(donor.ask_amount ? [{ name: 'Next Ask', value: donor.ask_amount }] : []),
            ]}>
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={v => formatCurrency(v, true)} width={50} />
              <Tooltip formatter={v => formatCurrency(v)} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                <Cell fill="#94A3B8" />
                <Cell fill="#1B4D5C" />
                {donor.ask_amount && <Cell fill="#C4963E" />}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          {donor.ask_amount && (
            <div className="mt-auto pt-3 border-t border-gray-100">
              <div className="bg-gold/10 rounded-lg p-2.5 border border-gold/20">
                <p className="text-xs font-semibold text-gold uppercase tracking-wider mb-0.5">Recommended Ask</p>
                <p className="text-lg font-bold text-gray-800">{formatCurrency(donor.ask_amount)}</p>
                {donor.ask_rationale && (
                  <p className="text-xs text-gray-500 mt-1">{donor.ask_rationale}</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Ask Rationale */}
      {(donor.ask_rationale || donor.ask_amount) && (
        <div className="md:col-span-2 bg-white rounded-lg p-3 border border-teal/20">
          <p className="text-xs font-semibold text-teal/70 uppercase tracking-wider mb-1">AI Recommendation</p>
          {donor.ask_amount && (
            <p className="text-sm font-bold text-teal mb-1">
              Recommended ask: {formatCurrency(donor.ask_amount)}
            </p>
          )}
          {donor.ask_rationale && (
            <p className="text-sm text-gray-700">{donor.ask_rationale}</p>
          )}
        </div>
      )}

      {/* Pipeline Stage */}
      <div className="md:col-span-2 bg-white rounded-lg p-3 border border-gray-200">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Pipeline Stage</p>
        <div className="flex flex-wrap items-start gap-2">
          <select
            value={pendingStage}
            onChange={e => { setPendingStage(e.target.value); setStageSaved(false) }}
            disabled={stageSaving}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 bg-white focus:outline-none focus:border-teal disabled:opacity-50"
          >
            <option value="">— No stage set —</option>
            {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          {stageChanged && (
            <>
              <input
                type="text"
                placeholder="Notes (optional)"
                value={stageNotes}
                onChange={e => setStageNotes(e.target.value)}
                disabled={stageSaving}
                className="flex-1 min-w-32 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-teal disabled:opacity-50"
              />
              <button
                onClick={handleSaveStage}
                disabled={stageSaving}
                className="text-sm bg-teal text-white px-3 py-1.5 rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {stageSaving ? 'Saving...' : 'Save to Salesforce'}
              </button>
            </>
          )}
          {stageSaved && !stageChanged && (
            <span className="text-xs text-emerald-600 font-medium self-center">Saved</span>
          )}
        </div>
        {stageError && <p className="text-xs text-red-600 mt-1">{stageError}</p>}
      </div>

      {/* Action Plans */}
      {(donor.current_action_plan || donor.previous_action_plan) && (
        <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-3">
          {donor.current_action_plan && (
            <div className="bg-white rounded-lg p-3 border border-blue-100">
              <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-1">Current Action Plan</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{donor.current_action_plan}</p>
            </div>
          )}
          {donor.previous_action_plan && (
            <div className="bg-white rounded-lg p-3 border border-gray-200">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Previous Action Plan</p>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{donor.previous_action_plan}</p>
            </div>
          )}
        </div>
      )}

      <div className="bg-white rounded-lg p-3 border border-gray-200">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Giving Summary</p>
        <div className="space-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-gray-500">Total lifetime</span>
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
            <span className="text-gray-500">Gift count</span>
            <span className="font-semibold">{donor.gift_count}</span>
          </div>
          {donor.is_recurring && (
            <div className="flex justify-between text-emerald-600">
              <span>Recurring ({donor.rd_period})</span>
              <span className="font-semibold">{formatCurrency(donor.rd_amount)}</span>
            </div>
          )}
        </div>
      </div>
      <div className="bg-white rounded-lg p-3 border border-gray-200">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Contact</p>
        <div className="space-y-1 text-xs text-gray-600">
          {donor.email && <p>{donor.email}</p>}
          {donor.phone && <p>{donor.phone}</p>}
          {(donor.city || donor.state) && (
            <p>{[donor.city, donor.state, donor.country].filter(Boolean).join(', ')}</p>
          )}
          <p className="text-gray-400">SF ID: {donor.sf_id}</p>
          {donor.last_analyzed && (
            <p className="text-gray-400">Analyzed: {formatDate(donor.last_analyzed)}</p>
          )}
        </div>
      </div>
    </div>
  )
}
