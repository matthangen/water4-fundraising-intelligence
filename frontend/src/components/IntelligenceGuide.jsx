/**
 * IntelligenceGuide.jsx — At-a-glance summary of the FIS logic:
 * tier thresholds, stewardship calendar, AI scoring fields, pipeline stages,
 * and action priority system.
 */

import { TIERS } from '../utils/tiers.js'
import { STAGES } from '../utils/api.js'

const STEWARDSHIP = [
  {
    tier: 'Transformational',
    color: 'border-violet-400 bg-violet-50',
    headerColor: 'bg-violet-100 text-violet-800',
    min: '$100,000+',
    frequency: 'Monthly',
    actions: [
      { timing: 'Monthly',    label: 'Personal call or meeting from major gifts officer' },
      { timing: 'Quarterly',  label: 'Impact report with project-level updates' },
      { timing: 'Annually',   label: 'Executive leadership meeting + site visit offer' },
      { timing: 'Annually',   label: 'Customized recognition and co-design opportunities' },
    ],
  },
  {
    tier: 'Leadership',
    color: 'border-teal-400 bg-teal-50',
    headerColor: 'bg-teal-100 text-teal-800',
    min: '$25,000–$99,999',
    frequency: 'Bi-monthly',
    actions: [
      { timing: 'Bi-monthly', label: 'Personal outreach (call, email, or meeting)' },
      { timing: 'Semi-annual',label: 'Detailed impact story with giving acknowledgment' },
      { timing: 'Annually',   label: 'Leadership-level donor event or exclusive briefing' },
      { timing: 'Annually',   label: 'Renewal conversation and multi-year ask consideration' },
    ],
  },
  {
    tier: 'Major',
    color: 'border-amber-400 bg-amber-50',
    headerColor: 'bg-amber-100 text-amber-800',
    min: '$10,000–$24,999',
    frequency: 'Quarterly',
    actions: [
      { timing: 'Quarterly',  label: 'Meaningful touch (call, handwritten note, or visit)' },
      { timing: 'Semi-annual',label: 'Impact update email with statistics and stories' },
      { timing: 'Annually',   label: 'Major donor appreciation event invitation' },
      { timing: 'Annually',   label: 'Personal renewal and upgrade conversation' },
    ],
  },
  {
    tier: 'Mid-Level',
    color: 'border-sky-400 bg-sky-50',
    headerColor: 'bg-sky-100 text-sky-800',
    min: '$5,000–$9,999',
    frequency: 'Quarterly',
    actions: [
      { timing: 'Quarterly',  label: 'Personalized email or phone touchpoint' },
      { timing: 'Semi-annual',label: 'Impact report' },
      { timing: 'Annually',   label: 'Renewal ask with upgrade opportunity' },
    ],
  },
  {
    tier: 'Donor',
    color: 'border-emerald-400 bg-emerald-50',
    headerColor: 'bg-emerald-100 text-emerald-800',
    min: '$1,000–$4,999',
    frequency: 'Semi-annual',
    actions: [
      { timing: 'Semi-annual',label: 'Thank-you + impact touchpoint' },
      { timing: 'Annually',   label: 'Renewal communication with giving summary' },
    ],
  },
  {
    tier: 'Prospect',
    color: 'border-gray-300 bg-gray-50',
    headerColor: 'bg-gray-100 text-gray-700',
    min: '$0–$999',
    frequency: 'As needed',
    actions: [
      { timing: 'First',      label: 'Wealth screen — identify giving capacity before investing relationship time' },
      { timing: '6 months',   label: 'Qualify & cultivation call — gauge mission alignment and first-gift intent' },
      { timing: 'Annually',   label: 'Annual appeal email — if no response, route to mass appeal cadence' },
    ],
  },
]

const SCORING = [
  {
    field: 'AI Score',
    key: 'ai_score',
    range: '0–100',
    description: 'Composite score computed by Claude from all available signals. Higher = higher engagement priority.',
    color: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  },
  {
    field: 'Lapse Risk',
    key: 'lapse_risk',
    range: '0–1',
    description: 'Probability the donor does not give in the current fiscal year based on recency and engagement decline. High = needs attention.',
    color: 'text-red-700 bg-red-50 border-red-200',
  },
  {
    field: 'Upgrade Propensity',
    key: 'upgrade_propensity',
    range: '0–1',
    description: 'Probability the donor is ready to give at a higher tier this cycle. High = present an upgrade ask.',
    color: 'text-violet-700 bg-violet-50 border-violet-200',
  },
  {
    field: 'Recency (R)',
    key: 'rfm_r',
    range: '1–5',
    description: 'How recently the donor gave. 5 = gave within the last 90 days. 1 = no gift in 3+ years.',
    color: 'text-gray-700 bg-gray-50 border-gray-200',
  },
  {
    field: 'Frequency (F)',
    key: 'rfm_f',
    range: '1–5',
    description: 'How often the donor gives. 5 = consistent multi-year donor. 1 = single gift.',
    color: 'text-gray-700 bg-gray-50 border-gray-200',
  },
  {
    field: 'Monetary (M)',
    key: 'rfm_m',
    range: '1–5',
    description: 'Gift size relative to the full portfolio. 5 = top tier. 1 = small or no gifts.',
    color: 'text-gray-700 bg-gray-50 border-gray-200',
  },
]

const PRIORITY_LEVELS = [
  { level: 1, label: 'Critical', color: 'bg-red-500', description: 'Requires immediate action — lapse risk, major renewal, or time-sensitive opportunity.' },
  { level: 2, label: 'High',     color: 'bg-orange-500', description: 'Overdue touchpoint, upgrade signal, or high-value donor needing engagement this week.' },
  { level: 3, label: 'Medium',   color: 'bg-amber-500', description: 'Scheduled stewardship action within the standard cadence.' },
  { level: 4, label: 'Low',      color: 'bg-sky-400', description: 'Informational or optional action. Complete when capacity allows.' },
  { level: 5, label: 'Routine',  color: 'bg-gray-400', description: 'Automated or administrative task with no urgency.' },
]

function Section({ title, children }) {
  return (
    <section className="mb-8">
      <h2 className="text-base font-semibold text-gray-800 mb-3 pb-2 border-b border-gray-200">{title}</h2>
      {children}
    </section>
  )
}

export default function IntelligenceGuide() {
  return (
    <div className="max-w-5xl mx-auto">

      <div className="mb-6">
        <h1 className="text-xl font-serif text-gray-900">Fundraising Intelligence — How It Works</h1>
        <p className="text-sm text-gray-500 mt-1">
          This system uses Salesforce giving history and AI analysis to surface the right actions at the right time for each donor relationship.
        </p>
      </div>

      {/* Tier Thresholds */}
      <Section title="Donor Tiers">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2">
          {TIERS.map(t => (
            <div key={t.id} className={`rounded-lg border px-3 py-2 ${t.bg} ${t.border}`}>
              <div className="text-xs font-semibold" style={{ color: t.color }}>{t.label}</div>
              <div className="text-xs text-gray-500 mt-0.5">
                {t.id === 'prospect' ? '$0–$999' :
                 t.id === 'transformational' ? '$100K+' :
                 `$${(t.min / 1000).toFixed(0)}K+`}
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Tier is calculated from the higher of current FY or last FY giving. It determines stewardship cadence and action frequency.
        </p>
      </Section>

      {/* Pipeline Stages */}
      <Section title="Pipeline Stages">
        <div className="flex flex-wrap gap-2">
          {STAGES.map((s, i) => (
            <span key={s} className="inline-flex items-center gap-1.5 text-xs bg-white border border-gray-200 rounded-full px-3 py-1 text-gray-700">
              <span className="w-4 h-4 rounded-full bg-teal text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: '#1B4D5C' }}>
                {i + 1}
              </span>
              {s}
            </span>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Stages are updated at the Organization (Account) level in Salesforce. Gift officers update stage from the Action Queue or Donor tab.
          Updates are logged as Salesforce Tasks under the gift officer's name.
        </p>
      </Section>

      {/* Action Priority */}
      <Section title="Action Priority System">
        <div className="space-y-2">
          {PRIORITY_LEVELS.map(p => (
            <div key={p.level} className="flex items-start gap-3 bg-white border border-gray-100 rounded-lg px-4 py-2.5">
              <span className={`w-6 h-6 rounded-full ${p.color} text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5`}>
                {p.level}
              </span>
              <div>
                <span className="text-sm font-semibold text-gray-800">{p.label}</span>
                <span className="text-xs text-gray-500 ml-2">{p.description}</span>
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-2">
          The Action Queue shows priority 1–2 items badged in red. Actions are generated nightly by the Action Engine and stored in GCS.
          Completing an action creates a Salesforce Task logged under the assigned gift officer.
        </p>
      </Section>

      {/* AI Scoring */}
      <Section title="AI Scoring Fields">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {SCORING.map(s => (
            <div key={s.key} className={`rounded-lg border px-4 py-3 ${s.color}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold">{s.field}</span>
                <span className="text-xs font-mono opacity-60">{s.range}</span>
              </div>
              <p className="text-xs opacity-80 leading-relaxed">{s.description}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Stewardship Calendar */}
      <Section title="Stewardship Calendar by Tier">
        <div className="space-y-4">
          {STEWARDSHIP.map(t => (
            <div key={t.tier} className={`rounded-lg border-l-4 ${t.color}`}>
              <div className={`flex items-center gap-3 px-4 py-2 rounded-t-lg ${t.headerColor}`}>
                <span className="text-sm font-semibold">{t.tier}</span>
                <span className="text-xs opacity-70">{t.min}</span>
                <span className="ml-auto text-xs opacity-60">Contact frequency: {t.frequency}</span>
              </div>
              <div className="px-4 py-3 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {t.actions.map((a, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-gray-700">
                    <span className="text-gray-400 font-medium w-20 flex-shrink-0">{a.timing}</span>
                    <span>{a.label}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Dashboard Views */}
      <Section title="Dashboard Views">
        <div className="space-y-3">
          {[
            {
              tab: 'Executive Dashboard',
              desc: 'Leadership-level overview of organizational fundraising performance.',
              metrics: [
                'Revenue This FY / Last FY with year-over-year change',
                'Pipeline Value — sum of ask amounts (or best giving) for donors in active pipeline stages (excludes Blocked, Stewardship, and Referrals)',
                'Donor Retention — donors who gave last FY who also gave this FY, as a percentage of all last-FY donors',
                'Revenue per MGO — total FY revenue divided by number of gift officers',
                'Active Solicitations — donors currently in Proposal, Decision Making, or Closing stages',
              ],
              charts: 'Revenue & Pipeline Comparison bar chart, Revenue by Segment (tier) with YoY bars, Giving Treemap by segment, Pipeline by Stage (dual-axis: donor count + dollar value), YoY Change by Segment table.',
            },
            {
              tab: 'Action Queue',
              desc: 'Daily operational hub for gift officers. AI-generated, priority-ranked actions from the Action Engine.',
              metrics: [
                'Priority 1–2 items badged in red for urgent attention',
                'Pending vs. completed tabs with search',
                'Completing an action creates a Salesforce Task under the assigned officer',
              ],
              charts: null,
            },
            {
              tab: 'Donors',
              desc: 'Searchable, sortable donor list with expandable inline profiles.',
              metrics: [
                'Donor Profile Radar — 6-axis chart: AI Score, Retention (1 − lapse risk), Upgrade Propensity, RFM Recency, Frequency, Monetary (each normalized to 0–100)',
                'Engagement Score — composite ring gauge: 40% AI Score + 30% Retention + 30% Upgrade Propensity',
                'Giving Comparison — bar chart of Last FY vs This FY vs Recommended Ask',
                'Pipeline stage selector with Salesforce write-back',
              ],
              charts: null,
            },
            {
              tab: 'Pipeline',
              desc: 'Visualizes pipeline health across all 10 stages.',
              metrics: [
                'Pipeline Funnel — dual bars for donor count and dollar value at each stage',
                'Solicitation Rate — donors in closed stages (Stewardship, Referrals) as % of all late-stage donors (Proposal + Decision + Closing + closed)',
                'Stage Conversion — each stage shown as a % of the top-of-funnel stage count',
                'Avg AI Score across all pipeline donors',
              ],
              charts: 'Pipeline Stage Distribution bar chart, Stage Distribution by Officer (stacked bar), Conversion % bar chart, Pipeline Detail table with avg AI score and avg lapse risk per stage.',
            },
            {
              tab: 'Campaigns',
              desc: 'Campaign list with status badges, types, date ranges, and owner assignments.',
              metrics: [
                'Total Campaigns, Total Won, Avg AI Score, Active count',
                'Filterable and sortable by status and type',
              ],
              charts: null,
            },
            {
              tab: 'Portfolio View',
              desc: 'Portfolio-level analysis with capacity planning and risk assessment.',
              metrics: [
                'Capacity Utilization — active donors per officer as % of recommended 200-donor caseload, color-coded: red (>100%), amber (≥70%), teal (normal)',
                'Tier Distribution — horizontal bar chart with donor count and revenue per tier',
                'Segment Revenue YoY — side-by-side This FY vs Last FY by tier',
                'Portfolio Composition — donut chart of donor count by tier',
                'Risk/Opportunity Matrix — 4 quadrants based on lapse risk (≥0.5) and upgrade propensity (≥0.5): Cultivate, Priority, Steward, Recover',
              ],
              charts: null,
            },
            {
              tab: 'Officers',
              desc: 'Gift officer performance comparison with expandable detail views.',
              metrics: [
                'Officer table: Portfolio size, This FY (with YoY%), Avg AI Score, Action Completion rate, Pending Actions, At-Risk count, Upgrade-Ready count',
                'Revenue by Officer — horizontal bar chart comparing This FY vs Last FY',
                'Officer Detail: Performance Profile radar (5-axis), Pipeline Distribution, Tier Distribution, Top 10 Donors table',
                'Action Completion — completed / (completed + pending) as a percentage',
              ],
              charts: null,
            },
          ].map(v => (
            <div key={v.tab} className="bg-white border border-gray-200 rounded-lg px-4 py-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-semibold text-gray-800">{v.tab}</span>
              </div>
              <p className="text-xs text-gray-500 mb-2">{v.desc}</p>
              <ul className="space-y-0.5">
                {v.metrics.map((m, i) => (
                  <li key={i} className="text-xs text-gray-600 flex items-start gap-1.5">
                    <span className="text-gray-300 mt-0.5">•</span>
                    <span>{m}</span>
                  </li>
                ))}
              </ul>
              {v.charts && (
                <p className="text-xs text-gray-400 mt-2 italic">{v.charts}</p>
              )}
            </div>
          ))}
        </div>
      </Section>

      {/* Data Flow */}
      <Section title="How Data Flows">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          {[
            { step: '1', title: 'Salesforce Sync', desc: 'Nightly pull of Contacts, Accounts, Campaigns, and giving history via SOQL.' },
            { step: '2', title: 'Claude Analysis', desc: 'Claude scores each donor for lapse risk, upgrade propensity, and engagement priority.' },
            { step: '3', title: 'Action Engine', desc: 'Rules + AI generate a prioritized action queue stored to GCS.' },
            { step: '4', title: 'Dashboard', desc: 'Gift officers view actions, update pipeline stages, and complete tasks — all logged back to Salesforce.' },
          ].map(s => (
            <div key={s.step} className="bg-white border border-gray-200 rounded-lg px-4 py-3">
              <div className="w-6 h-6 rounded-full bg-teal-600 text-white text-xs font-bold flex items-center justify-center mb-2"
                style={{ backgroundColor: '#1B4D5C' }}>
                {s.step}
              </div>
              <div className="text-sm font-semibold text-gray-800 mb-1">{s.title}</div>
              <div className="text-xs text-gray-500">{s.desc}</div>
            </div>
          ))}
        </div>
      </Section>

    </div>
  )
}
