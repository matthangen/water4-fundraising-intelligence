/**
 * tiers.js — Tier classification and formatting utilities.
 * Shared with the donor dashboard design system.
 */

export const TIERS = [
  { id: 'transformational', label: 'Transformational', min: 100000, color: '#7C3AED', bg: 'bg-violet-100', text: 'text-violet-700', border: 'border-violet-200' },
  { id: 'leadership',       label: 'Leadership',       min:  25000, color: '#1B4D5C', bg: 'bg-teal-100',   text: 'text-teal-700',   border: 'border-teal-200'   },
  { id: 'major',            label: 'Major',            min:  10000, color: '#C4963E', bg: 'bg-amber-100',  text: 'text-amber-700',  border: 'border-amber-200'  },
  { id: 'mid_level',        label: 'Mid-Level',        min:   5000, color: '#0891B2', bg: 'bg-sky-100',    text: 'text-sky-700',    border: 'border-sky-200'    },
  { id: 'donor',            label: 'Donor',            min:   1000, color: '#059669', bg: 'bg-emerald-100',text: 'text-emerald-700',border: 'border-emerald-200'},
  { id: 'friend',           label: 'Friend',           min:      1, color: '#64748B', bg: 'bg-slate-100',  text: 'text-slate-600',  border: 'border-slate-200'  },
  { id: 'prospect',         label: 'Prospect',         min:      0, color: '#94A3B8', bg: 'bg-gray-100',   text: 'text-gray-500',   border: 'border-gray-200'   },
]

export function classifyTier(amount) {
  const n = Number(amount) || 0
  return TIERS.find(t => n >= t.min) || TIERS[TIERS.length - 1]
}

export function formatCurrency(n, compact = false) {
  const num = Number(n) || 0
  if (compact) {
    if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}M`
    if (num >= 1_000)     return `$${(num / 1_000).toFixed(0)}K`
    return `$${num.toFixed(0)}`
  }
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(num)
}

export function formatDate(dateStr) {
  if (!dateStr) return '—'
  try {
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(dateStr))
  } catch {
    return dateStr
  }
}

export function daysSince(dateStr) {
  if (!dateStr) return null
  const diff = Date.now() - new Date(dateStr).getTime()
  return Math.floor(diff / 86_400_000)
}
