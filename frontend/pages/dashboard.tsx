import { useEffect, useState, useMemo } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import Layout from '../components/Layout'
import StatsCards from '../components/StatsCards'
import RecoveryTable from '../components/RecoveryTable'
import api from '../lib/api'

// Recharts uses browser-only APIs (ResizeObserver, window) — must be loaded
// client-side only or it crashes SSR and produces a white screen on refresh.
const RecoveryInsights = dynamic(() => import('../components/RecoveryInsights'), {
  ssr: false,
  loading: () => (
    <div className="bg-white rounded-lg p-6 h-72 flex items-center justify-center text-sm" style={{ border: '1px solid #E2E8F0', color: '#94A3B8' }}>
      Loading insights…
    </div>
  ),
})

function Skeleton({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded ${className ?? ''}`} style={{ backgroundColor: '#F1F5F9' }} />
  )
}

export default function Dashboard() {
  const [summary, setSummary] = useState<any>(null)
  const [baseline, setBaseline] = useState<any>(null)
  const [decisions, setDecisions] = useState<any>(null)
  const [execution, setExecution] = useState<any>(null)

  const [loadingSummary, setLoadingSummary] = useState(true)
  const [loadingBaseline, setLoadingBaseline] = useState(true)
  const [loadingDecisions, setLoadingDecisions] = useState(true)
  const [loadingExecution, setLoadingExecution] = useState(true)

  const [errorSummary, setErrorSummary] = useState<string | null>(null)
  const [errorBaseline, setErrorBaseline] = useState<string | null>(null)
  const [errorDecisions, setErrorDecisions] = useState<string | null>(null)
  const [errorExecution, setErrorExecution] = useState<string | null>(null)
  const [isExecutingBatch, setIsExecutingBatch] = useState(false)

  useEffect(() => {
    let mounted = true

    const fetchSummary = async () => {
      try {
        const s = await api.getCheckoutsSummary()
        if (mounted) setSummary(s)
      } catch (err: any) {
        console.error('API request failed: checkouts/summary', err)
        if (mounted) setErrorSummary(err.message)
      } finally {
        if (mounted) setLoadingSummary(false)
      }
    }

    const fetchBaseline = async () => {
      try {
        const b = await api.getRecoveryBaselineSummary()
        if (mounted) setBaseline(b)
      } catch (err: any) {
        console.error('API request failed: recovery/baseline-summary', err)
        if (mounted) setErrorBaseline(err.message)
      } finally {
        if (mounted) setLoadingBaseline(false)
      }
    }

    const fetchDecisions = async () => {
      try {
        const d = await api.getRecoveryDecisions(200)
        if (mounted) setDecisions(d)
      } catch (err: any) {
        console.error('API request failed: recovery/decisions?limit=200', err)
        if (mounted) setErrorDecisions(err.message)
      } finally {
        if (mounted) setLoadingDecisions(false)
      }
    }

    const fetchExecution = async () => {
      try {
        const e = await api.getExecutionSummary()
        if (mounted) setExecution(e)
      } catch (err: any) {
        console.error('API request failed: recovery/execution-summary', err)
        if (mounted) setErrorExecution(err.message)
      } finally {
        if (mounted) setLoadingExecution(false)
      }
    }

    fetchSummary()
    fetchBaseline()
    fetchDecisions()
    fetchExecution()

    return () => { mounted = false }
  }, [])

  const handleBatchExecute = async () => {
    setIsExecutingBatch(true)
    try {
      await api.batchExecuteRecovery(100)
      // refresh data
      const [s, b, d, e] = await Promise.all([
        api.getCheckoutsSummary(),
        api.getRecoveryBaselineSummary(),
        api.getRecoveryDecisions(200),
        api.getExecutionSummary()
      ])
      setSummary(s)
      setBaseline(b)
      setDecisions(d)
      setExecution(e)
    } catch (err) {
      console.error(err)
      alert("Failed to execute batch.")
    } finally {
      setIsExecutingBatch(false)
    }
  }

  // ── Derived metrics ─────────────────────────────────────────────────────────
  const derivedMetrics = useMemo(() => {
    if (!baseline || !summary) return null

    const eligibleRate = summary.total_checkouts > 0
      ? ((baseline.total_eligible_cases / summary.total_checkouts) * 100).toFixed(1)
      : '0'

    const avgOrderValue = baseline.total_eligible_cases > 0
      ? baseline.total_revenue_at_risk / baseline.total_eligible_cases
      : 0

    const highValueCases = Array.isArray(decisions)
      ? decisions.filter((d: any) => (d.expected_recoverable_revenue ?? 0) >= 500).length
      : 0

    const recoveryRate = baseline.total_revenue_at_risk > 0
      ? ((baseline.total_expected_recoverable_revenue / baseline.total_revenue_at_risk) * 100).toFixed(1)
      : '0'

    const actualRecoveryRate = execution?.total_checkout_value_at_risk > 0
      ? ((execution.total_amount_recovered / execution.total_checkout_value_at_risk) * 100).toFixed(1)
      : '0'

    return { eligibleRate, avgOrderValue, highValueCases, recoveryRate, actualRecoveryRate }
  }, [summary, baseline, decisions, execution])

  // ── Recovery probability buckets ────────────────────────────────────────────
  const probBuckets = useMemo(() => {
    if (!Array.isArray(decisions)) return null
    const buckets = [
      { label: '< 20%', count: 0, color: '#E2E8F0' },
      { label: '20–40%', count: 0, color: '#93C5FD' },
      { label: '40–60%', count: 0, color: '#3B82F6' },
      { label: '> 60%', count: 0, color: '#1D4ED8' },
    ]
    decisions.forEach((d: any) => {
      const p = (d.estimated_recovery_probability ?? 0) * 100
      if (p < 20) buckets[0].count++
      else if (p < 40) buckets[1].count++
      else if (p < 60) buckets[2].count++
      else buckets[3].count++
    })
    const max = Math.max(...buckets.map((b) => b.count), 1)
    return { buckets, max }
  }, [decisions])

  const formatCurrency = (val: any) => {
    if (!val || isNaN(val)) return '₹0'
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(val)
  }

  // ── Stats cards ─────────────────────────────────────────────────────────────
  const stats = [
    {
      label: 'Total Checkouts',
      value: loadingSummary ? '...' : (summary?.total_checkouts ?? 0).toLocaleString('en-US'),
      subtitle: loadingSummary ? '' : `${summary?.completed_checkouts?.toLocaleString('en-US') ?? 0} completed`,
      accent: 'blue' as const,
    },
    {
      label: 'Eligible Recovery Cases',
      value: loadingBaseline ? '...' : (baseline?.total_eligible_cases ?? 0).toLocaleString('en-US'),
      subtitle: loadingBaseline || loadingSummary ? '' : `${derivedMetrics?.eligibleRate ?? 0}% of all checkouts`,
      accent: 'amber' as const,
    },
    {
      label: 'Revenue at Risk',
      value: loadingSummary ? '...' : formatCurrency(summary?.total_revenue_at_risk),
      subtitle: loadingBaseline ? '' : `${baseline?.total_eligible_cases ?? 0} eligible cases`,
      accent: 'red' as const,
    },
    {
      label: 'Actually Recovered',
      value: loadingExecution ? '...' : formatCurrency(execution?.total_amount_recovered),
      subtitle: loadingExecution ? '' : `${derivedMetrics?.actualRecoveryRate ?? 0}% recovery rate (Baseline: ${formatCurrency(baseline?.total_expected_recoverable_revenue)})`,
      accent: 'green' as const,
    },
  ]

  return (
    <Layout>
      {/* Page header */}
      <div className="mb-6">
        <Link 
          href="/"
          className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm font-medium transition-colors mb-3 -ml-2.5"
          style={{ color: '#475569', backgroundColor: 'transparent' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = '#2563EB'
            e.currentTarget.style.backgroundColor = '#EFF6FF'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = '#475569'
            e.currentTarget.style.backgroundColor = 'transparent'
          }}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
          Back to Home
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold" style={{ color: '#0F172A' }}>Recovery Dashboard</h1>
            <p className="text-sm mt-1" style={{ color: '#64748B' }}>
              AI-powered checkout recovery — identify opportunities, prioritize cases, recover revenue.
            </p>
          </div>
          <button 
            onClick={handleBatchExecute}
            disabled={isExecutingBatch}
            className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all"
            style={{ 
              backgroundColor: isExecutingBatch ? '#93C5FD' : '#2B63C6',
              color: 'white',
              cursor: isExecutingBatch ? 'not-allowed' : 'pointer'
            }}
          >
            {isExecutingBatch ? 'Simulating...' : 'Batch Execute Recoveries'}
          </button>
        </div>
      </div>

      {/* Top stats */}
      <StatsCards stats={stats} />

      {/* Recovery Funnel */}
      {!loadingSummary && !loadingBaseline && !loadingExecution && summary && baseline && execution && (
        <div className="bg-white rounded-lg p-5 mb-6" style={{ border: '1px solid #E2E8F0' }}>
          <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: '#64748B', letterSpacing: '0.06em' }}>Revenue Funnel</p>
          <div className="flex items-center gap-2 flex-wrap">
            {[
              { label: 'Total Processed', value: formatCurrency(summary.total_revenue_completed + summary.total_revenue_at_risk), bg: '#F8FAFC', text: '#475569', border: '#E2E8F0' },
              null,
              { label: 'Revenue at Risk', value: formatCurrency(summary.total_revenue_at_risk), bg: '#FEF2F2', text: '#DC2626', border: '#FECACA' },
              null,
              { label: 'Expected Baseline', value: formatCurrency(baseline.total_expected_recoverable_revenue), bg: '#EFF6FF', text: '#2563EB', border: '#BFDBFE' },
              null,
              { label: 'Actually Recovered', value: formatCurrency(execution.total_amount_recovered), bg: '#F0FDF4', text: '#16A34A', border: '#BBF7D0' },
            ].map((item, i) =>
              item ? (
                <div key={i} className="px-3 py-2 rounded-lg text-sm font-medium" style={{ backgroundColor: item.bg, border: `1px solid ${item.border}` }}>
                  <span className="text-xs block opacity-70" style={{ color: item.text }}>{item.label}</span>
                  <span className="font-bold" style={{ color: item.text }}>{item.value}</span>
                </div>
              ) : (
                <span key={i} className="text-lg font-light" style={{ color: '#CBD5E1' }}>→</span>
              )
            )}
          </div>
        </div>
      )}

      {/* Charts + Metrics row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-6">
        {/* Recovery action distribution */}
        <div className="lg:col-span-2">
          {loadingBaseline ? (
            <div className="bg-white rounded-lg p-6 h-72 flex flex-col gap-3" style={{ border: '1px solid #E2E8F0' }}>
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-64" />
              <Skeleton className="flex-1 mt-2" />
            </div>
          ) : errorBaseline ? (
            <div className="bg-white rounded-lg p-6 h-72 flex items-center justify-center text-sm" style={{ border: '1px solid #E2E8F0', color: '#DC2626' }}>
              Failed to load insights
            </div>
          ) : (
            <RecoveryInsights distribution={baseline?.action_distribution ?? {}} />
          )}
        </div>

        {/* Key Metrics */}
        <div className="flex flex-col gap-5">
          <div className="bg-white rounded-lg p-5 flex-1" style={{ border: '1px solid #E2E8F0' }}>
            <p className="text-xs font-semibold uppercase tracking-wide mb-4" style={{ color: '#64748B', letterSpacing: '0.06em' }}>Key Metrics</p>
            {loadingBaseline || loadingSummary || loadingExecution ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-5 w-full" />)}
              </div>
            ) : (
              <div className="space-y-3 text-sm">
                <MetricRow label="Expected Recovery Rate" value={`${derivedMetrics?.recoveryRate ?? 0}%`} />
                <MetricRow label="Actual Recovery Rate" value={`${derivedMetrics?.actualRecoveryRate ?? 0}%`} highlight />
                <MetricRow label="Avg. Order Value (at risk)" value={formatCurrency(derivedMetrics?.avgOrderValue ?? 0)} />
                <MetricRow label="Cases Stopped by Policy" value={(execution?.number_of_cases_stopped_by_policy ?? 0).toString()} />
                <MetricRow label="Cases Requiring Review" value={(execution?.number_of_cases_requiring_review ?? 0).toString()} />
              </div>
            )}

            {!loadingBaseline && baseline && (
              <>
                <div className="mt-4 pt-4" style={{ borderTop: '1px solid #F1F5F9' }}>
                  <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: '#64748B', letterSpacing: '0.06em' }}>Decision Engine</p>
                  <div className="space-y-2 text-sm">
                    <MetricRow
                      label="Rule-Based"
                      value={((baseline?.source_distribution?.rule_based ?? 0) + (baseline?.source_distribution?.fallback ?? 0)).toString()}
                    />
                    <MetricRow
                      label="ML-Assisted"
                      value={(baseline?.source_distribution?.ml_assisted ?? 0).toString()}
                      accent="blue"
                    />
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Recovery probability distribution */}
      {!loadingDecisions && probBuckets && decisions?.length > 0 && (
        <div className="bg-white rounded-lg p-5 mb-6" style={{ border: '1px solid #E2E8F0' }}>
          <p className="text-xs font-semibold uppercase tracking-wide mb-4" style={{ color: '#64748B', letterSpacing: '0.06em' }}>Recovery Probability Distribution</p>
          <div className="grid grid-cols-4 gap-3">
            {probBuckets.buckets.map((b) => (
              <div key={b.label} className="text-center">
                <div className="h-16 flex items-end justify-center mb-1">
                  <div
                    className="w-10 rounded-t transition-all"
                    style={{ height: `${Math.max(8, (b.count / probBuckets.max) * 100)}%`, backgroundColor: b.color }}
                  />
                </div>
                <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>{b.count}</p>
                <p className="text-xs" style={{ color: '#94A3B8' }}>{b.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recovery Queue */}
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold" style={{ color: '#0F172A' }}>Recovery Queue</h2>
        {!loadingDecisions && decisions && (
          <span className="text-xs" style={{ color: '#94A3B8' }}>{decisions.length} cases loaded</span>
        )}
      </div>

      {loadingDecisions ? (
        <div className="bg-white rounded-lg p-10 text-center" style={{ border: '1px solid #E2E8F0' }}>
          <div className="w-6 h-6 rounded-full border-2 border-t-transparent mx-auto mb-3 animate-spin" style={{ borderColor: '#2563EB', borderTopColor: 'transparent' }} />
          <p className="text-sm" style={{ color: '#94A3B8' }}>Loading recovery cases...</p>
        </div>
      ) : errorDecisions ? (
        <div className="bg-white rounded-lg p-8 text-center text-sm" style={{ border: '1px solid #E2E8F0', color: '#DC2626' }}>
          <p className="mb-2">Failed to load recovery queue</p>
          <button onClick={() => window.location.reload()} className="text-xs underline" style={{ color: '#2563EB' }}>Retry</button>
        </div>
      ) : (
        <RecoveryTable items={decisions ?? []} />
      )}
    </Layout>
  )
}

function MetricRow({
  label,
  value,
  highlight,
  accent,
}: {
  label: string
  value: string
  highlight?: boolean
  accent?: 'blue'
}) {
  const valueBg = highlight ? '#F0FDF4' : accent === 'blue' ? '#EFF6FF' : '#F8FAFC'
  const valueColor = highlight ? '#16A34A' : accent === 'blue' ? '#2563EB' : '#475569'
  return (
    <div className="flex justify-between items-center">
      <span style={{ color: '#64748B' }}>{label}</span>
      <strong
        className="font-semibold text-sm px-2 py-0.5 rounded"
        style={{ backgroundColor: valueBg, color: valueColor }}
      >
        {value}
      </strong>
    </div>
  )
}
