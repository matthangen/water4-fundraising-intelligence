import { useMemo } from 'react'
import { formatCurrency, classifyTier } from '../utils/tiers.js'

function TierBar({ tier, donors }) {
  const maxCount = Math.max(...donors.map(g => g.count), 1)
  return (
    <div className="flex items-center gap-3">
      <span className={`text-xs font-semibold w-28 shrink-0 ${tier.text}`}>{tier.label}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${(donors.count / maxCount) * 100}%`, backgroundColor: tier.color }}
        />
      </div>
      <span className="text-xs font-mono text-gray-600 w-8 text-right">{donors.count}</span>
      <span className="text-xs text-gray-400 w-20 text-right">{formatCurrency(donors.amount, true)}</span>
    </div>
  )
}

function RiskMatrix({ donors }) {
  // Quadrants: low lapse + high upgrade, high lapse + high upgrade, low lapse + low upgrade, high lapse + low upgrade
  const quadrants = [
    { id: 'cultivate',  label: 'Cultivate',    desc: 'Low lapse risk, high upgrade potential', color: 'bg-emerald-50 border-emerald-200', labelColor: 'text-emerald-700',
      filter: d => (d.lapse_risk || 0) < 0.5 && (d.upgrade_propensity || 0) >= 0.5 },
    { id: 'priority',   label: 'Priority',     desc: 'High lapse risk, high upgrade potential', color: 'bg-amber-50 border-amber-200',   labelColor: 'text-amber-700',
      filter: d => (d.lapse_risk || 0) >= 0.5 && (d.upgrade_propensity || 0) >= 0.5 },
    { id: 'steward',    label: 'Steward',      desc: 'Low lapse risk, low upgrade potential',   color: 'bg-blue-50 border-blue-200',     labelColor: 'text-blue-700',
      filter: d => (d.lapse_risk || 0) < 0.5 && (d.upgrade_propensity || 0) < 0.5 },
    { id: 'recover',    label: 'Recover',      desc: 'High lapse risk, low upgrade potential',  color: 'bg-red-50 border-red-200',       labelColor: 'text-red-700',
      filter: d => (d.lapse_risk || 0) >= 0.5 && (d.upgrade_propensity || 0) < 0.5 },
  ]

  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Donor Risk / Opportunity Matrix</h3>
      <div className="grid grid-cols-2 gap-3">
        {quadrants.map(q => {
          const group = donors.filter(q.filter)
          const totalGiving = group.reduce((s, d) => s + (d.giving_this_fy || d.giving_last_fy || 0), 0)
          return (
            <div key={q.id} className={`rounded-xl border p-4 ${q.color}`}>
              <p className={`text-sm font-bold mb-0.5 ${q.labelColor}`}>{q.label}</p>
              <p className="text-xs text-gray-500 mb-3">{q.desc}</p>
              <p className="text-2xl font-bold text-gray-800">{group.length}</p>
              <p className="text-xs text-gray-500">donors · {formatCurrency(totalGiving, true)}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function OfficerSummary({ donors, actions }) {
  const officers = useMemo(() => {
    const map = {}
    for (const d of donors) {
      const o = d.gift_officer || 'Unassigned'
      if (!map[o]) map[o] = { name: o, donors: 0, totalGiving: 0, avgScore: 0, scores: [], pendingActions: 0 }
      map[o].donors++
      map[o].totalGiving += d.giving_this_fy || 0
      if (d.ai_score !== null && d.ai_score !== undefined) map[o].scores.push(d.ai_score)
    }
    for (const a of actions) {
      if (a.status === 'pending') {
        const o = a.gift_officer || 'Unassigned'
        if (map[o]) map[o].pendingActions++
      }
    }
    return Object.values(map).map(o => ({
      ...o,
      avgScore: o.scores.length > 0 ? Math.round(o.scores.reduce((s, x) => s + x, 0) / o.scores.length) : null,
    })).sort((a, b) => b.totalGiving - a.totalGiving)
  }, [donors, actions])

  if (officers.length === 0) return null

  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">By Gift Officer</h3>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Officer</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Donors</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">This FY</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Avg Score</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Pending Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {officers.map(o => (
              <tr key={o.name} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-800">{o.name}</td>
                <td className="px-4 py-3 text-right text-gray-600">{o.donors}</td>
                <td className="px-4 py-3 text-right font-mono text-gray-800">{formatCurrency(o.totalGiving, true)}</td>
                <td className="px-4 py-3 text-center">
                  {o.avgScore !== null ? (
                    <span className={`text-xs font-bold ${o.avgScore >= 70 ? 'text-emerald-600' : o.avgScore >= 50 ? 'text-amber-600' : 'text-red-500'}`}>
                      {o.avgScore}
                    </span>
                  ) : '—'}
                </td>
                <td className="px-4 py-3 text-right">
                  {o.pendingActions > 0 ? (
                    <span className="bg-amber-100 text-amber-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                      {o.pendingActions}
                    </span>
                  ) : (
                    <span className="text-gray-300 text-xs">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function PortfolioView({ donors, campaigns, actions }) {
  const tierGroups = useMemo(() => {
    const map = {}
    for (const d of donors) {
      const tier = classifyTier(Math.max(d.giving_this_fy || 0, d.giving_last_fy || 0))
      if (!map[tier.id]) map[tier.id] = { ...tier, count: 0, amount: 0 }
      map[tier.id].count++
      map[tier.id].amount += d.giving_this_fy || 0
    }
    return ['transformational','leadership','major','mid_level','donor','friend']
      .map(id => map[id])
      .filter(Boolean)
  }, [donors])

  const totalThisFY  = donors.reduce((s, d) => s + (d.giving_this_fy || 0), 0)
  const totalLastFY  = donors.reduce((s, d) => s + (d.giving_last_fy || 0), 0)
  const analyzedCount = donors.filter(d => d.ai_score !== null && d.ai_score !== undefined).length
  const highRisk     = donors.filter(d => (d.lapse_risk || 0) >= 0.6).length
  const upgradeReady = donors.filter(d => (d.upgrade_propensity || 0) >= 0.6).length

  const yoyChange = totalLastFY > 0 ? ((totalThisFY - totalLastFY) / totalLastFY) * 100 : null

  return (
    <div className="space-y-6">
      {/* Top stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">This FY</p>
          <p className="text-2xl font-bold text-gray-800">{formatCurrency(totalThisFY, true)}</p>
          {yoyChange !== null && (
            <p className={`text-xs mt-0.5 font-medium ${yoyChange >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
              {yoyChange >= 0 ? '▲' : '▼'} {Math.abs(yoyChange).toFixed(1)}% vs last FY
            </p>
          )}
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">AI Analyzed</p>
          <p className="text-2xl font-bold text-gray-800">{analyzedCount}</p>
          <p className="text-xs text-gray-400">{donors.length - analyzedCount} pending analysis</p>
        </div>
        <div className="bg-white rounded-xl border border-red-100 p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Lapse Risk</p>
          <p className="text-2xl font-bold text-red-500">{highRisk}</p>
          <p className="text-xs text-gray-400">donors at ≥60% lapse risk</p>
        </div>
        <div className="bg-white rounded-xl border border-emerald-100 p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Upgrade Ready</p>
          <p className="text-2xl font-bold text-emerald-600">{upgradeReady}</p>
          <p className="text-xs text-gray-400">donors at ≥60% upgrade propensity</p>
        </div>
      </div>

      {/* Tier distribution */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Tier Distribution</h3>
        <div className="space-y-3">
          {tierGroups.map(g => (
            <div key={g.id} className="flex items-center gap-3">
              <span className={`text-xs font-semibold w-28 shrink-0 ${g.text}`}>{g.label}</span>
              <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${(g.count / Math.max(...tierGroups.map(t => t.count), 1)) * 100}%`,
                    backgroundColor: g.color,
                  }}
                />
              </div>
              <span className="text-xs font-mono text-gray-600 w-8 text-right">{g.count}</span>
              <span className="text-xs text-gray-400 w-20 text-right">{formatCurrency(g.amount, true)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <RiskMatrix donors={donors} />
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <OfficerSummary donors={donors} actions={actions} />
        </div>
      </div>
    </div>
  )
}
