import { useMemo } from 'react'
import { formatCurrency } from '../utils/tiers.js'
import { STAGES } from '../utils/api.js'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, Cell,
} from 'recharts'

/* ── Colors ── */
const TEAL = '#1B4D5C'
const GOLD = '#C4963E'
const STAGE_COLORS = [
  '#EF4444', '#F97316', '#F59E0B', '#EAB308',
  '#84CC16', '#22C55E', '#14B8A6', '#0EA5E9',
  '#6366F1', '#8B5CF6',
]

/* ── Tooltip ── */
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-gray-700 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color || p.fill }}>
          {p.name}: {typeof p.value === 'number' && p.value > 100
            ? formatCurrency(p.value, true)
            : p.value}
        </p>
      ))}
    </div>
  )
}

/* ── Funnel step ── */
function FunnelStep({ stage, count, value, maxCount, maxValue, color, index, total }) {
  const countPct = maxCount > 0 ? (count / maxCount) * 100 : 0
  const valuePct = maxValue > 0 ? (value / maxValue) * 100 : 0
  return (
    <div className="flex items-center gap-3 group">
      <span className="text-xs text-gray-400 w-5 text-right shrink-0">{index + 1}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-medium text-gray-800 truncate">{stage}</span>
          <span className="text-xs text-gray-500 shrink-0 ml-2">
            {count} donors · {formatCurrency(value, true)}
          </span>
        </div>
        <div className="flex gap-1">
          <div className="flex-1 bg-gray-100 rounded-full h-2.5 overflow-hidden" title="Donor count">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${countPct}%`, backgroundColor: color }}
            />
          </div>
          <div className="flex-1 bg-gray-100 rounded-full h-2.5 overflow-hidden" title="Dollar value">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${valuePct}%`, backgroundColor: GOLD }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Main ── */
export default function PipelineDashboard({ donors, campaigns, actions }) {
  const data = useMemo(() => {
    // Stage breakdown
    const stageData = STAGES.map((stage, i) => {
      const group = donors.filter(d => d.stage === stage)
      return {
        name: stage,
        shortName: stage
          .replace('Identification and Qualification', 'ID & Qual')
          .replace(' and ', ' & '),
        count: group.length,
        value: group.reduce((s, d) => s + (d.ask_amount || d.giving_this_fy || d.giving_last_fy || 0), 0),
        color: STAGE_COLORS[i],
        donors: group,
      }
    })

    const activeStages = stageData.filter(s => s.count > 0)
    const maxCount = Math.max(...activeStages.map(s => s.count), 1)
    const maxValue = Math.max(...activeStages.map(s => s.value), 1)

    // Pipeline health indicators
    const inPipeline = donors.filter(d => d.stage && d.stage !== 'Blocked')
    const totalPipelineValue = inPipeline.reduce((s, d) =>
      s + (d.ask_amount || d.giving_this_fy || d.giving_last_fy || 0), 0)
    const avgScore = inPipeline.length > 0
      ? inPipeline.reduce((s, d) => s + (d.ai_score || 0), 0) / inPipeline.length
      : 0

    // Solicitation metrics
    const proposalStages = ['Proposal', 'Decision Making', 'Closing and Onboarding']
    const proposals = donors.filter(d => proposalStages.includes(d.stage)).length
    const closed = donors.filter(d =>
      d.stage === 'Stewardship and Retention' || d.stage === 'Referrals & Network Expansion'
    ).length
    const solicitationRate = proposals + closed > 0
      ? (closed / (proposals + closed)) * 100
      : 0

    // Stage distribution by officer
    const officerMap = {}
    for (const d of donors) {
      if (!d.gift_officer || !d.stage) continue
      if (!officerMap[d.gift_officer]) officerMap[d.gift_officer] = { name: d.gift_officer }
      const key = d.stage
        .replace('Identification and Qualification', 'ID & Qual')
        .replace(' and ', ' & ')
      officerMap[d.gift_officer][key] = (officerMap[d.gift_officer][key] || 0) + 1
    }
    const officerStageData = Object.values(officerMap)
      .sort((a, b) => {
        const sumA = Object.values(a).filter(v => typeof v === 'number').reduce((s, n) => s + n, 0)
        const sumB = Object.values(b).filter(v => typeof v === 'number').reduce((s, n) => s + n, 0)
        return sumB - sumA
      })

    // Unique stage names for the stacked bar legend
    const stageNames = [...new Set(
      activeStages.map(s => s.shortName)
    )]

    // Conversion approximation: count at each stage as % of first stage
    const firstActive = activeStages.find(s => s.count > 0)
    const conversionData = activeStages.map(s => ({
      name: s.shortName,
      count: s.count,
      conversionPct: firstActive ? Math.round((s.count / firstActive.count) * 100) : 0,
      color: s.color,
    }))

    return {
      stageData, activeStages, maxCount, maxValue,
      totalPipelineValue, inPipeline: inPipeline.length, avgScore,
      proposals, closed, solicitationRate,
      officerStageData, stageNames, conversionData,
    }
  }, [donors])

  return (
    <div className="space-y-6">

      {/* Health indicators */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">In Pipeline</p>
          <p className="text-2xl font-bold text-gray-800">{data.inPipeline}</p>
          <p className="text-xs text-gray-400">active donors</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Pipeline Value</p>
          <p className="text-2xl font-bold text-gray-800">{formatCurrency(data.totalPipelineValue, true)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Avg AI Score</p>
          <p className="text-2xl font-bold text-gray-800">{data.avgScore.toFixed(0)}</p>
          <p className="text-xs text-gray-400">pipeline donors</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Solicitation Rate</p>
          <p className="text-2xl font-bold text-gray-800">{data.solicitationRate.toFixed(0)}%</p>
          <p className="text-xs text-gray-400">{data.closed} closed / {data.proposals + data.closed} in late stages</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Active Proposals</p>
          <p className="text-2xl font-bold text-gray-800">{data.proposals}</p>
          <p className="text-xs text-gray-400">awaiting decision</p>
        </div>
      </div>

      {/* Funnel + Stage bar chart */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

        {/* Pipeline Funnel */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Pipeline Funnel</h3>
          <p className="text-xs text-gray-400 mb-4">
            <span className="inline-block w-3 h-2 rounded-full mr-1" style={{ backgroundColor: TEAL }} />Donors
            <span className="inline-block w-3 h-2 rounded-full mr-1 ml-3" style={{ backgroundColor: GOLD }} />Value
          </p>
          <div className="space-y-3">
            {data.stageData.map((s, i) => (
              <FunnelStep
                key={s.name}
                stage={s.name}
                count={s.count}
                value={s.value}
                maxCount={data.maxCount}
                maxValue={data.maxValue}
                color={s.color}
                index={i}
                total={data.stageData.length}
              />
            ))}
          </div>
        </div>

        {/* Pipeline by Stage (bar chart) */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Pipeline Stage Distribution</h3>
          <ResponsiveContainer width="100%" height={380}>
            <BarChart data={data.activeStages} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="shortName" tick={{ fontSize: 10 }} width={100} />
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="count" name="Donors" radius={[0, 4, 4, 0]}>
                {data.activeStages.map((s, i) => (
                  <Cell key={i} fill={s.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Stage Distribution by Officer + Conversion rates */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

        {/* By Officer stacked bar */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Stage Distribution by Officer</h3>
          {data.officerStageData.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(280, data.officerStageData.length * 40)}>
              <BarChart data={data.officerStageData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={120} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                {data.stageNames.map((stage, i) => (
                  <Bar
                    key={stage}
                    dataKey={stage}
                    name={stage}
                    stackId="a"
                    fill={STAGE_COLORS[STAGES.findIndex(s =>
                      s.replace('Identification and Qualification', 'ID & Qual')
                        .replace(' and ', ' & ') === stage
                    ) % STAGE_COLORS.length] || STAGE_COLORS[i % STAGE_COLORS.length]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-gray-400">No officer/stage data available</p>
          )}
        </div>

        {/* Conversion rates */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Stage Conversion (% of Top-of-Funnel)</h3>
          <ResponsiveContainer width="100%" height={Math.max(280, data.conversionData.length * 40)}>
            <BarChart data={data.conversionData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={100} />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null
                  return (
                    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs">
                      <p className="font-semibold text-gray-700 mb-1">{label}</p>
                      <p>{payload[0].value}% of top-of-funnel ({payload[0].payload.count} donors)</p>
                    </div>
                  )
                }}
              />
              <Bar dataKey="conversionPct" name="Conversion %" radius={[0, 4, 4, 0]}>
                {data.conversionData.map((s, i) => (
                  <Cell key={i} fill={s.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Stage detail table */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Pipeline Detail by Stage</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Stage</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Donors</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Value</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Avg AI Score</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Avg Lapse Risk</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">% of Pipeline</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.stageData.filter(s => s.count > 0).map(s => {
                const avgAI = s.donors.length > 0
                  ? s.donors.reduce((sum, d) => sum + (d.ai_score || 0), 0) / s.donors.length
                  : 0
                const avgLapse = s.donors.length > 0
                  ? s.donors.reduce((sum, d) => sum + (d.lapse_risk || 0), 0) / s.donors.length
                  : 0
                const pipelinePct = data.inPipeline > 0 ? (s.count / data.inPipeline) * 100 : 0
                return (
                  <tr key={s.name} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                        <span className="font-medium text-gray-800">{s.name}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">{s.count}</td>
                    <td className="px-4 py-3 text-right font-mono text-gray-800">{formatCurrency(s.value, true)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`text-xs font-bold ${avgAI >= 70 ? 'text-emerald-600' : avgAI >= 50 ? 'text-amber-600' : 'text-red-500'}`}>
                        {avgAI.toFixed(0)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`text-xs font-bold ${avgLapse >= 0.6 ? 'text-red-500' : avgLapse >= 0.3 ? 'text-amber-600' : 'text-emerald-600'}`}>
                        {(avgLapse * 100).toFixed(0)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">{pipelinePct.toFixed(1)}%</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
