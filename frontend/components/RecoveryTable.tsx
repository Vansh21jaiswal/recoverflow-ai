import { useState, useMemo } from 'react'
import { useRouter } from 'next/router'
import PriorityBadge, { getPriority } from './PriorityBadge'

export default function RecoveryTable({ items }: { items: any[] }) {
  const router = useRouter()
  const [limit, setLimit] = useState(25)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [actionFilter, setActionFilter] = useState('All Actions')
  const [priorityFilter, setPriorityFilter] = useState('All')

  const [sortField, setSortField] = useState<'cart_value' | 'confidence' | 'estimated_recovery_probability' | 'expected_recoverable_revenue'>('expected_recoverable_revenue')
  const [sortDesc, setSortDesc] = useState(true)

  const filteredAndSortedItems = useMemo(() => {
    let result = items.filter((item) => {
      if (searchQuery && !item.checkout_id.toLowerCase().includes(searchQuery.toLowerCase())) return false
      if (statusFilter !== 'All' && item.payment_status?.toLowerCase() !== statusFilter.toLowerCase()) return false
      if (actionFilter !== 'All Actions') {
        const actionMap: any = {
          'Send Reminder': 'send_reminder',
          'Retry Payment': 'retry_payment',
          'Switch Payment Method': 'switch_payment_method',
          'Offer Small Incentive': 'offer_small_incentive',
          'Human Review': 'human_review',
        }
        const expected = actionMap[actionFilter]
        if (item.recommended_action !== expected) return false
      }
      if (priorityFilter !== 'All') {
        const p = getPriority(item.expected_recoverable_revenue ?? 0)
        if (p !== priorityFilter) return false
      }
      return true
    })

    result.sort((a, b) => {
      const valA = a[sortField] ?? 0
      const valB = b[sortField] ?? 0
      if (valA < valB) return sortDesc ? 1 : -1
      if (valA > valB) return sortDesc ? -1 : 1
      return 0
    })

    return result
  }, [items, searchQuery, statusFilter, actionFilter, priorityFilter, sortField, sortDesc])

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDesc(!sortDesc)
    } else {
      setSortField(field)
      setSortDesc(true)
    }
  }

  const resetFilters = () => {
    setSearchQuery('')
    setStatusFilter('All')
    setActionFilter('All Actions')
    setPriorityFilter('All')
  }

  const formatCurrency = (val: any) => {
    if (val == null) return '—'
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(val)
  }

  const formatPercent = (val: any) => {
    if (val == null) return '—'
    return `${(Number(val) * 100).toFixed(1)}%`
  }

  const ACTION_LABELS: Record<string, string> = {
    send_reminder: 'Send Reminder',
    retry_payment: 'Retry Payment',
    switch_payment_method: 'Switch Method',
    offer_small_incentive: 'Offer Incentive',
    human_review: 'Human Review',
    no_action: 'No Action',
  }

  // Sort indicator: only shown on active column
  const SortIndicator = ({ field }: { field: typeof sortField }) => {
    if (sortField !== field) return null
    return (
      <span className="ml-1 text-xs" style={{ color: '#2563EB' }}>
        {sortDesc ? '↓' : '↑'}
      </span>
    )
  }

  const shown = filteredAndSortedItems.slice(0, limit)

  return (
    <div className="bg-white rounded-lg mb-6" style={{ border: '1px solid #E2E8F0' }}>
      {/* Header */}
      <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3" style={{ borderBottom: '1px solid #E2E8F0' }}>
        <div>
          <h3 className="text-sm font-semibold" style={{ color: '#0F172A' }}>Recovery Queue</h3>
          <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>
            Showing {shown.length} of {filteredAndSortedItems.length} eligible cases
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Priority filter pills */}
          {['All', 'High', 'Medium', 'Low'].map((p) => (
            <button
              key={p}
              onClick={() => setPriorityFilter(p)}
              className="px-3 py-1 rounded-full text-xs font-medium transition-colors"
              style={{
                backgroundColor: priorityFilter === p ? '#2563EB' : '#F8FAFC',
                color: priorityFilter === p ? '#FFFFFF' : '#475569',
                border: `1px solid ${priorityFilter === p ? '#2563EB' : '#E2E8F0'}`,
              }}
            >
              {p === 'All' ? 'All Priority' : p}
            </button>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="px-5 py-3 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3" style={{ borderBottom: '1px solid #F1F5F9' }}>
        <input
          type="text"
          placeholder="Search by Checkout ID..."
          className="rounded-md px-3 py-1.5 text-sm w-full focus:outline-none"
          style={{ border: '1px solid #E2E8F0', color: '#0F172A', backgroundColor: '#FFFFFF' }}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <select
          className="rounded-md px-3 py-1.5 text-sm w-full focus:outline-none"
          style={{ border: '1px solid #E2E8F0', color: '#475569', backgroundColor: '#FFFFFF' }}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="All">All Statuses</option>
          <option value="failed">Failed</option>
          <option value="abandoned">Abandoned</option>
        </select>
        <select
          className="rounded-md px-3 py-1.5 text-sm w-full focus:outline-none"
          style={{ border: '1px solid #E2E8F0', color: '#475569', backgroundColor: '#FFFFFF' }}
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
        >
          <option value="All Actions">All Actions</option>
          <option value="Send Reminder">Send Reminder</option>
          <option value="Retry Payment">Retry Payment</option>
          <option value="Switch Payment Method">Switch Payment Method</option>
          <option value="Offer Small Incentive">Offer Small Incentive</option>
          <option value="Human Review">Human Review</option>
        </select>
        <button
          onClick={resetFilters}
          className="px-4 py-1.5 rounded-md text-sm font-medium transition-colors"
          style={{ border: '1px solid #E2E8F0', color: '#475569', backgroundColor: '#F8FAFC' }}
        >
          Reset
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid #F1F5F9' }}>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: '#94A3B8' }}>Checkout</th>
              <th
                className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide cursor-pointer select-none"
                style={{ color: sortField === 'cart_value' ? '#2563EB' : '#94A3B8' }}
                onClick={() => handleSort('cart_value')}
              >
                Order Value <SortIndicator field="cart_value" />
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: '#94A3B8' }}>Status</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: '#94A3B8' }}>Priority</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: '#94A3B8' }}>Action</th>
              <th
                className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide cursor-pointer select-none"
                style={{ color: sortField === 'estimated_recovery_probability' ? '#2563EB' : '#94A3B8' }}
                onClick={() => handleSort('estimated_recovery_probability')}
              >
                Recovery % <SortIndicator field="estimated_recovery_probability" />
              </th>
              <th
                className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide cursor-pointer select-none"
                style={{ color: sortField === 'expected_recoverable_revenue' ? '#2563EB' : '#94A3B8' }}
                onClick={() => handleSort('expected_recoverable_revenue')}
              >
                Expected <SortIndicator field="expected_recoverable_revenue" />
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center text-sm" style={{ color: '#94A3B8' }}>
                  <div className="mb-3 text-3xl">—</div>
                  No matching recovery cases found.
                  <button onClick={resetFilters} className="block mx-auto mt-2 text-xs underline" style={{ color: '#2563EB' }}>Clear filters</button>
                </td>
              </tr>
            ) : (
              shown.map((r) => (
                <tr
                  key={r.checkout_id}
                  className="cursor-pointer transition-colors"
                  style={{ borderBottom: '1px solid #F8FAFC' }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#EFF6FF')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  onClick={() => router.push(`/recovery/${r.checkout_id}`)}
                >
                  <td className="px-5 py-3">
                    <span className="font-mono text-xs px-2 py-0.5 rounded" style={{ color: '#64748B', backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                      {r.checkout_id.substring(0, 8)}…
                    </span>
                  </td>
                  <td className="px-4 py-3 font-semibold" style={{ color: '#0F172A' }}>{formatCurrency(r.cart_value)}</td>
                  <td className="px-4 py-3">
                    <span
                      className="px-2 py-0.5 rounded text-xs font-medium"
                      style={
                        r.payment_status === 'failed'
                          ? { backgroundColor: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }
                          : { backgroundColor: '#FFFBEB', color: '#D97706', border: '1px solid #FDE68A' }
                      }
                    >
                      {r.payment_status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <PriorityBadge revenue={r.expected_recoverable_revenue ?? 0} />
                  </td>
                  <td className="px-4 py-3 text-sm" style={{ color: '#475569' }}>
                    {ACTION_LABELS[r.recommended_action] || r.recommended_action?.replace(/_/g, ' ') || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: '#E2E8F0' }}>
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${(r.estimated_recovery_probability ?? 0) * 100}%`, backgroundColor: '#2563EB' }}
                        />
                      </div>
                      <span className="text-xs tabular-nums" style={{ color: '#475569' }}>
                        {formatPercent(r.estimated_recovery_probability)}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-semibold" style={{ color: '#2563EB' }}>
                    {formatCurrency(r.expected_recoverable_revenue)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Load more */}
      {limit < filteredAndSortedItems.length && (
        <div className="px-5 py-4 text-center" style={{ borderTop: '1px solid #F1F5F9' }}>
          <button
            onClick={() => setLimit(limit + 25)}
            className="px-6 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{ border: '1px solid #E2E8F0', color: '#475569', backgroundColor: '#F8FAFC' }}
          >
            Load {Math.min(25, filteredAndSortedItems.length - limit)} more
          </button>
        </div>
      )}
    </div>
  )
}
