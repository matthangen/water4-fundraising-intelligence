import { useState } from 'react'
import { formatCurrency, formatDate } from '../utils/tiers.js'

function ScoreGauge({ score }) {
  if (score === null || score === undefined) {
    return <span className="text-gray-300 text-xs">Not scored</span>
  }
  const s = Number(score)
  const color = s >= 75 ? 'text-emerald-600' : s >= 50 ? 'text-amber-600' : 'text-red-500'
  const ring  = s >= 75 ? '#059669'           : s >= 50 ? '#D97706'         : '#EF4444'
  const r = 18
  const circ = 2 * Math.PI * r
  return (
    <div className="flex items-center gap-2">
      <svg className="w-12 h-12 -rotate-90" viewBox="0 0 44 44">
        <circle cx="22" cy="22" r={r} fill="none" stroke="#E5E7EB" strokeWidth="4" />
        <circle
          cx="22" cy="22" r={r}
          fill="none" stroke={ring} strokeWidth="4" strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - s / 100)}
        />
      </svg>
      <span className={`text-xl font-bold ${color}`}>{Math.round(s)}</span>
    </div>
  )
}

export default function CampaignIndex({ campaigns, donors }) {
  const [expanded, setExpanded] = useState(null)
  const [sort, setSort] = useState('amount_won')
  const [statusFilter, setStatusFilter] = useState('all')

  const filtered = campaigns
    .filter(c => statusFilter === 'all' || c.status === statusFilter)
    .sort((a, b) => {
      switch (sort) {
        case 'amount_won':   return (b.amount_won || 0) - (a.amount_won || 0)
        case 'roi':          return (b.roi ?? -999) - (a.roi ?? -999)
        case 'ai_score':     return (b.ai_score || 0) - (a.ai_score || 0)
        case 'opps_won':     return (b.opps_won || 0) - (a.opps_won || 0)
        case 'start_date':   return (b.start_date || '').localeCompare(a.start_date || '')
        default: return 0
      }
    })

  const statuses = [...new Set(campaigns.map(c => c.status).filter(Boolean))].sort()

  const totalWon = campaigns.reduce((s, c) => s + (c.amount_won || 0), 0)
  const avgScore = campaigns.filter(c => c.ai_score).reduce((s, c, _, a) => s + c.ai_score / a.length, 0)

  return (
    <div>
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Campaigns" value={campaigns.length} />
        <StatCard label="Total Won" value={formatCurrency(totalWon, true)} />
        <StatCard label="Avg AI Score" value={avgScore ? `${Math.round(avgScore)}/100` : '—'} />
        <StatCard label="Active" value={campaigns.filter(c => c.status === 'Active').length} />
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-3 mb-4">
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white focus:outline-none focus:border-teal"
        >
          <option value="all">All Statuses</option>
          {statuses.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select
          value={sort}
          onChange={e => setSort(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white focus:outline-none focus:border-teal"
        >
          <option value="amount_won">Sort: Amount Won</option>
          <option value="roi">Sort: ROI</option>
          <option value="ai_score">Sort: AI Score</option>
          <option value="opps_won">Sort: Gifts Won</option>
          <option value="start_date">Sort: Start Date</option>
        </select>
      </div>

      {/* Campaign cards */}
      <div className="space-y-3">
        {filtered.map(c => (
          <div key={c.sf_campaign_id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div
              className="p-4 flex items-start gap-4 cursor-pointer hover:bg-gray-50 transition-colors"
              onClick={() => setExpanded(prev => prev === c.sf_campaign_id ? null : c.sf_campaign_id)}
            >
              <ScoreGauge score={c.ai_score} />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-gray-800">{c.name}</span>
                  {c.status && (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium border
                      ${c.status === 'Active' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
                        c.status === 'Planned' ? 'bg-blue-100 text-blue-700 border-blue-200' :
                        'bg-gray-100 text-gray-600 border-gray-200'}`}>
                      {c.status}
                    </span>
                  )}
                  {c.type && (
                    <span className="text-xs text-gray-400">{c.type}</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-x-6 gap-y-1 mt-1 text-xs text-gray-500">
                  <span>{c.opps_won} gifts won</span>
                  <span>{formatCurrency(c.amount_won, true)} raised</span>
                  {c.roi !== null && c.roi !== undefined && (
                    <span className={c.roi >= 0 ? 'text-emerald-600' : 'text-red-500'}>
                      {c.roi >= 0 ? '+' : ''}{(c.roi * 100).toFixed(0)}% ROI
                    </span>
                  )}
                  {c.start_date && <span>{formatDate(c.start_date)} – {c.end_date ? formatDate(c.end_date) : 'ongoing'}</span>}
                  {c.owner && <span>Owner: {c.owner}</span>}
                </div>
              </div>

              <div className="text-gray-300 text-lg shrink-0">
                {expanded === c.sf_campaign_id ? '▲' : '▼'}
              </div>
            </div>

            {expanded === c.sf_campaign_id && (
              <div className="px-4 pb-4 border-t border-gray-100">
                <CampaignDetail campaign={c} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function CampaignDetail({ campaign: c }) {
  return (
    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
      {c.ai_narrative && (
        <div className="md:col-span-2 bg-teal/5 rounded-lg p-3 border border-teal/20">
          <p className="text-xs font-semibold text-teal/70 uppercase tracking-wider mb-1">AI Campaign Analysis</p>
          <p className="text-sm text-gray-700 leading-relaxed">{c.ai_narrative}</p>
        </div>
      )}

      {c.recommendations?.length > 0 && (
        <div className="bg-amber-50 rounded-lg p-3 border border-amber-200">
          <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-2">Recommendations</p>
          <ul className="space-y-1">
            {(Array.isArray(c.recommendations) ? c.recommendations : [c.recommendations]).map((r, i) => (
              <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
                <span className="text-amber-500 mt-0.5">→</span>
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="bg-white rounded-lg p-3 border border-gray-200">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Financial Summary</p>
        <div className="space-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-gray-500">Amount won</span>
            <span className="font-semibold">{formatCurrency(c.amount_won)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Expected revenue</span>
            <span className="font-semibold">{formatCurrency(c.expected_revenue)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Budget</span>
            <span className="font-semibold">{formatCurrency(c.budget)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Actual cost</span>
            <span className="font-semibold">{formatCurrency(c.actual_cost)}</span>
          </div>
          {c.roi !== null && c.roi !== undefined && (
            <div className={`flex justify-between font-bold ${c.roi >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
              <span>ROI</span>
              <span>{c.roi >= 0 ? '+' : ''}{(c.roi * 100).toFixed(1)}%</span>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg p-3 border border-gray-200">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Engagement</p>
        <div className="space-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-gray-500">Contacts reached</span>
            <span className="font-semibold">{c.contacts?.toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Total opportunities</span>
            <span className="font-semibold">{c.opps_total}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Gifts won</span>
            <span className="font-semibold text-emerald-600">{c.opps_won}</span>
          </div>
          {c.contacts > 0 && c.opps_won > 0 && (
            <div className="flex justify-between text-teal">
              <span>Conversion rate</span>
              <span className="font-semibold">{((c.opps_won / c.contacts) * 100).toFixed(1)}%</span>
            </div>
          )}
        </div>
      </div>

      {c.description && (
        <div className="md:col-span-2 bg-gray-50 rounded-lg p-3 border border-gray-200">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Description</p>
          <p className="text-sm text-gray-600">{c.description}</p>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-800">{value}</p>
    </div>
  )
}
