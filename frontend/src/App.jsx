import { useState, useEffect } from 'react'
import { fetchDonors, fetchCampaigns, fetchActions } from './utils/api.js'
import Dashboard from './components/Dashboard.jsx'

export default function App() {
  const [state, setState] = useState('loading')  // loading | ready | error
  const [donors, setDonors] = useState([])
  const [campaigns, setCampaigns] = useState([])
  const [actions, setActions] = useState([])
  const [error, setError] = useState(null)
  const [lastRefresh, setLastRefresh] = useState(null)

  async function load() {
    setState('loading')
    try {
      const [d, c, a] = await Promise.all([fetchDonors(), fetchCampaigns(), fetchActions()])
      setDonors(d)
      setCampaigns(c)
      setActions(a)
      setLastRefresh(new Date())
      setState('ready')
    } catch (err) {
      setError(err.message)
      setState('error')
    }
  }

  useEffect(() => { load() }, [])

  if (state === 'loading') {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-teal border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-teal font-medium">Loading fundraising intelligence...</p>
        </div>
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <div className="bg-white rounded-xl border border-red-200 p-8 max-w-md text-center shadow-sm">
          <div className="text-4xl mb-4">⚠</div>
          <h2 className="text-lg font-semibold text-gray-800 mb-2">Could not load data</h2>
          <p className="text-gray-500 text-sm mb-6">{error}</p>
          <p className="text-xs text-gray-400 mb-6">
            Make sure GCS is configured and sf_sync has run at least once.
            Check VITE_GCS_BASE_URL in your .env.local file.
          </p>
          <button
            onClick={load}
            className="bg-teal text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-teal-light transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  return (
    <Dashboard
      donors={donors}
      campaigns={campaigns}
      actions={actions}
      lastRefresh={lastRefresh}
      onRefresh={load}
    />
  )
}
