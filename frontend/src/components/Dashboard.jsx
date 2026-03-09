import { useState } from 'react'
import ActionsPanel   from './ActionsPanel.jsx'
import DonorIntel     from './DonorIntel.jsx'
import CampaignIndex  from './CampaignIndex.jsx'
import PortfolioView  from './PortfolioView.jsx'

export default function Dashboard({ donors, campaigns, actions, lastRefresh, onRefresh }) {
  const [activeTab, setActiveTab] = useState('actions')
  const [selectedOfficer, setSelectedOfficer] = useState('all')

  const urgentCount = actions.filter(a => a.priority <= 2 && a.status === 'pending').length
  const pendingCount = actions.filter(a => a.status === 'pending').length

  const officers = [...new Set(donors.map(d => d.gift_officer).filter(Boolean))].sort()

  const TABS = [
    { id: 'actions',   label: 'Action Queue',    badge: urgentCount || null, badgeColor: 'bg-red-500' },
    { id: 'donors',    label: `Donors (${donors.length})` },
    { id: 'campaigns', label: `Campaigns (${campaigns.length})` },
    { id: 'portfolio', label: 'Portfolio View' },
  ]

  const filteredActions = selectedOfficer === 'all'
    ? actions
    : actions.filter(a => a.gift_officer === selectedOfficer)

  const filteredDonors = selectedOfficer === 'all'
    ? donors
    : donors.filter(d => d.gift_officer === selectedOfficer)

  return (
    <div className="min-h-screen bg-cream flex flex-col">

      {/* Nav */}
      <nav className="bg-teal h-14 flex items-center px-6 shadow sticky top-0 z-30">
        <span className="font-serif text-gold text-lg">Water4.org</span>
        <span className="text-white/40 text-xs ml-3 pl-3 border-l border-white/20 uppercase tracking-widest">
          Fundraising Intelligence
        </span>
        <div className="ml-auto flex items-center gap-4">
          {lastRefresh && (
            <span className="text-white/40 text-xs">
              Updated {lastRefresh.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button
            onClick={onRefresh}
            className="text-white/60 hover:text-white text-xs border border-white/20 hover:border-white/40 px-3 py-1 rounded-lg transition-colors"
          >
            Refresh
          </button>
        </div>
      </nav>

      {/* Tabs + Officer Filter */}
      <div className="bg-white border-b border-gray-200 px-6 sticky top-14 z-20">
        <div className="flex items-center gap-4 max-w-7xl mx-auto">
          <div className="flex gap-1 flex-1">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative text-sm font-medium py-3 px-4 border-b-2 transition-colors
                  ${activeTab === tab.id
                    ? 'border-teal text-teal'
                    : 'border-transparent text-gray-400 hover:text-gray-700'}`}
              >
                {tab.label}
                {tab.badge ? (
                  <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full font-semibold text-white
                    ${tab.badgeColor || 'bg-teal'}`}>
                    {tab.badge}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
          {officers.length > 1 && (
            <div className="flex items-center gap-2 py-2">
              <span className="text-xs text-gray-400">Officer:</span>
              <select
                value={selectedOfficer}
                onChange={e => setSelectedOfficer(e.target.value)}
                className="text-xs border border-gray-200 rounded-lg px-2 py-1 text-gray-700 bg-white focus:outline-none focus:border-teal"
              >
                <option value="all">All Officers</option>
                {officers.map(o => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      <main className="flex-1 px-6 py-6 max-w-7xl mx-auto w-full">

        {activeTab === 'actions' && (
          <ActionsPanel actions={filteredActions} donors={filteredDonors} />
        )}

        {activeTab === 'donors' && (
          <DonorIntel donors={filteredDonors} />
        )}

        {activeTab === 'campaigns' && (
          <CampaignIndex campaigns={campaigns} donors={donors} />
        )}

        {activeTab === 'portfolio' && (
          <PortfolioView donors={filteredDonors} campaigns={campaigns} actions={filteredActions} />
        )}

      </main>
    </div>
  )
}
