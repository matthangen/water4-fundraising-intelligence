import { useMemo } from 'react'
import { formatCurrency, classifyTier, TIERS } from '../utils/tiers.js'
import { STAGES } from '../utils/api.js'
import {
  BarChart, Bar, LineChart, Line, Treemap,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, ComposedChart, Cell,
} from 'recharts'

/* ── KPI Card ── */
function KPI({ label, value, sub, subColor, borderColor }) {
  return (
    <div className={`bg-white rounded-xl border p-4 ${borderColor || 'border-gray-200'}`}>
      <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-800">{value}</p>
      {sub && <p className={`text-xs mt-0.5 font-medium ${subColor || 'text-gray-400'}`}>{sub}</p>}
    </div>
  )
}

/* ── Helpers ── */
function pct(n) { return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%` }

function getMonthKey(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (isNaN(d)) return null
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function getQuarterKey(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (isNaN(d)) return null
  const q = Math.ceil((d.getMonth() + 1) / 3)
  return `${d.getFullYear()} Q${q}`
}

function getCurrentFY() {
  // Water4 likely uses calendar year or July-June FY. Using calendar year for now.
  return new Date().getFullYear()
}

/* ── Custom tooltip ── */
function ChartTooltip({ active, payload, label, formatter }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-gray-700 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>
          {p.name}: {formatter ? formatter(p.value) : formatCurrency(p.value, true)}
        </p>
      ))}
    </div>
  )
}

/* ── Treemap custom content ── */
function TreemapContent({ x, y, width, height, name, value, color }) {
  if (width < 50 || height < 30) return null
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={color} rx={4} stroke="#fff" strokeWidth={2} />
      <text x={x + width / 2} y={y + height / 2 - 6} textAnchor="middle" fill="#fff" fontSize={11} fontWeight="bold">
        {name}
      </text>
      <text x={x + width / 2} y={y + height / 2 + 10} textAnchor="middle" fill="rgba(255,255,255,0.8)" fontSize={10}>
        {formatCurrency(value, true)}
      </text>
    </g>
  )
}

/* ── Main component ── */
export default function ExecutiveDashboard({ donors, campaigns, actions }) {
  const stats = useMemo(() => {
    const fy = getCurrentFY()

    // Revenue
    const totalThisFY = donors.reduce((s, d) => s + (d.giving_this_fy || 0), 0)
    const totalLastFY = donors.reduce((s, d) => s + (d.giving_last_fy || 0), 0)
    const yoyChange = totalLastFY > 0 ? ((totalThisFY - totalLastFY) / totalLastFY) * 100 : null

    // Officers
    const officers = [...new Set(donors.map(d => d.gift_officer).filter(Boolean))]
    const revenuePerMGO = officers.length > 0 ? totalThisFY / officers.length : 0

    // Retention: donors who gave last FY AND this FY / donors who gave last FY
    const gaveLast = donors.filter(d => (d.giving_last_fy || 0) > 0)
    const retained = gaveLast.filter(d => (d.giving_this_fy || 0) > 0)
    const retentionRate = gaveLast.length > 0 ? (retained.length / gaveLast.length) * 100 : 0

    // Pipeline value: donors with active stages × their ask_amount or giving
    const pipelineStages = new Set(STAGES.filter(s =>
      !['Blocked', 'Stewardship and Retention', 'Referrals & Network Expansion'].includes(s)
    ))
    const pipelineDonors = donors.filter(d => d.stage && pipelineStages.has(d.stage))
    const pipelineValue = pipelineDonors.reduce((s, d) =>
      s + (d.ask_amount || d.giving_this_fy || d.giving_last_fy || 0), 0)

    // Active solicitations (Proposal + Decision Making + Closing)
    const solicitationStages = new Set(['Proposal', 'Decision Making', 'Closing and Onboarding'])
    const activeSolicitations = donors.filter(d => solicitationStages.has(d.stage)).length

    // Revenue by tier/segment
    const segmentData = []
    for (const tier of TIERS) {
      const group = donors.filter(d => classifyTier(Math.max(d.giving_this_fy || 0, d.giving_last_fy || 0)).id === tier.id)
      const thisFY = group.reduce((s, d) => s + (d.giving_this_fy || 0), 0)
      const lastFY = group.reduce((s, d) => s + (d.giving_last_fy || 0), 0)
      if (group.length > 0) {
        segmentData.push({ name: tier.label, thisFY, lastFY, color: tier.color, count: group.length })
      }
    }

    // Treemap data for giving by segment
    const treemapData = segmentData
      .filter(s => s.thisFY > 0)
      .map(s => ({ name: s.name, value: s.thisFY, color: s.color }))

    // Giving trend by month (from last_gift_date bucketing — approximate)
    // Since we don't have full gift history, show FY comparison by tier
    const givingTrend = segmentData.map(s => ({
      name: s.name,
      'This FY': s.thisFY,
      'Last FY': s.lastFY,
    }))

    // Pipeline by stage
    const stageData = STAGES.map(stage => {
      const group = donors.filter(d => d.stage === stage)
      return {
        name: stage.replace(' and ', ' & ').replace('Identification and Qualification', 'ID & Qual'),
        fullName: stage,
        count: group.length,
        value: group.reduce((s, d) => s + (d.ask_amount || d.giving_this_fy || d.giving_last_fy || 0), 0),
      }
    }).filter(s => s.count > 0)

    // Campaign stats
    const activeCampaigns = campaigns.filter(c =>
      c.status === 'Active' || c.status === 'In Progress' || c.is_active
    ).length
    const wonAmount = campaigns.reduce((s, c) => s + (c.amount_won || c.total_won || 0), 0)

    return {
      totalThisFY, totalLastFY, yoyChange,
      officers, revenuePerMGO,
      retentionRate, gaveLast: gaveLast.length, retained: retained.length,
      pipelineValue, pipelineDonors: pipelineDonors.length,
      activeSolicitations,
      segmentData, treemapData, givingTrend,
      stageData,
      activeCampaigns, wonAmount,
    }
  }, [donors, campaigns])

  return (
    <div className="space-y-6">

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-4">
        <KPI
          label="Revenue This FY"
          value={formatCurrency(stats.totalThisFY, true)}
          sub={stats.yoyChange !== null ? `${pct(stats.yoyChange)} vs last FY` : null}
          subColor={stats.yoyChange >= 0 ? 'text-emerald-600' : 'text-red-500'}
        />
        <KPI
          label="Revenue Last FY"
          value={formatCurrency(stats.totalLastFY, true)}
        />
        <KPI
          label="Pipeline Value"
          value={formatCurrency(stats.pipelineValue, true)}
          sub={`${stats.pipelineDonors} donors in pipeline`}
        />
        <KPI
          label="Donor Retention"
          value={`${stats.retentionRate.toFixed(0)}%`}
          sub={`${stats.retained} of ${stats.gaveLast} retained`}
          borderColor={stats.retentionRate >= 60 ? 'border-emerald-200' : 'border-red-200'}
        />
        <KPI
          label="Revenue per MGO"
          value={formatCurrency(stats.revenuePerMGO, true)}
          sub={`${stats.officers.length} officers`}
        />
        <KPI
          label="Active Solicitations"
          value={stats.activeSolicitations}
          sub={`${stats.activeCampaigns} active campaigns`}
        />
      </div>

      {/* Charts row 1: Revenue comparison + Revenue by Segment */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

        {/* Revenue & Pipeline Comparison */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Revenue & Pipeline Comparison</h3>
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={[
              { name: 'Last FY Revenue', value: stats.totalLastFY, fill: '#94A3B8' },
              { name: 'This FY Revenue', value: stats.totalThisFY, fill: '#1B4D5C' },
              { name: 'Pipeline Value',  value: stats.pipelineValue, fill: '#C4963E' },
            ]}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={v => formatCurrency(v, true)} tick={{ fontSize: 11 }} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                {[
                  { fill: '#94A3B8' },
                  { fill: '#1B4D5C' },
                  { fill: '#C4963E' },
                ].map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Bar>
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Revenue by Segment */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Revenue by Segment</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={stats.segmentData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tickFormatter={v => formatCurrency(v, true)} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={110} />
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="thisFY" name="This FY" radius={[0, 4, 4, 0]}>
                {stats.segmentData.map((s, i) => (
                  <Cell key={i} fill={s.color} />
                ))}
              </Bar>
              <Bar dataKey="lastFY" name="Last FY" fill="#D1D5DB" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Charts row 2: Giving Treemap + Pipeline by Stage */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

        {/* Giving Treemap */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Giving by Segment</h3>
          <ResponsiveContainer width="100%" height={280}>
            <Treemap
              data={stats.treemapData}
              dataKey="value"
              nameKey="name"
              content={<TreemapContent />}
            />
          </ResponsiveContainer>
        </div>

        {/* Pipeline by Stage */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Pipeline by Stage</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={stats.stageData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-35} textAnchor="end" height={60} />
              <YAxis yAxisId="count" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="value" orientation="right" tickFormatter={v => formatCurrency(v, true)} tick={{ fontSize: 11 }} />
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar yAxisId="count" dataKey="count" name="Donors" fill="#1B4D5C" radius={[4, 4, 0, 0]} />
              <Bar yAxisId="value" dataKey="value" name="Value" fill="#C4963E" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* YoY Change by Segment table */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Year-over-Year Change by Segment</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Segment</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Donors</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">This FY</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Last FY</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">YoY Change</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {stats.segmentData.map(s => {
                const change = s.lastFY > 0 ? ((s.thisFY - s.lastFY) / s.lastFY) * 100 : null
                return (
                  <tr key={s.name} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                        <span className="font-medium text-gray-800">{s.name}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">{s.count}</td>
                    <td className="px-4 py-3 text-right font-mono text-gray-800">{formatCurrency(s.thisFY, true)}</td>
                    <td className="px-4 py-3 text-right font-mono text-gray-500">{formatCurrency(s.lastFY, true)}</td>
                    <td className="px-4 py-3 text-right">
                      {change !== null ? (
                        <span className={`text-xs font-bold ${change >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                          {change >= 0 ? '▲' : '▼'} {Math.abs(change).toFixed(1)}%
                        </span>
                      ) : (
                        <span className="text-gray-300 text-xs">New</span>
                      )}
                    </td>
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
