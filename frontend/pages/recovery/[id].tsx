import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import Layout from '../../components/Layout'
import { getPriority } from '../../components/PriorityBadge'
import api from '../../lib/api'
import RecoveryExecutionSection from '../../components/RecoveryExecutionSection'

// ── Constants ─────────────────────────────────────────────────────────────────

const ACTION_LABELS: Record<string, string> = {
  send_reminder: 'Send Reminder',
  retry_payment: 'Retry Payment',
  switch_payment_method: 'Switch Payment Method',
  offer_small_incentive: 'Offer Small Incentive',
  human_review: 'Human Review',
  no_action: 'No Action',
}

const ACTION_DESCRIPTIONS: Record<string, string> = {
  send_reminder:
    'Send a targeted email or SMS nudge to the customer who reached checkout but did not complete payment. These customers showed purchase intent — a well-timed reminder often closes the sale.',
  retry_payment:
    'Automatically re-attempt the payment. Temporary failures (timeouts, brief network errors) succeed on retry in a large proportion of cases without requiring any customer action.',
  switch_payment_method:
    'Prompt the customer to use a different payment method — UPI, card, wallet, or net banking. Repeated failures with one method strongly predict success with an alternative.',
  offer_small_incentive:
    'Present a small discount or free shipping to remove the last barrier to purchase. Most effective for high-value customers with a history of completing orders.',
  human_review:
    'Escalate to a payments operations agent. This case has characteristics (elevated risk score, compliance flags, or high value) that benefit from human judgment before automated action.',
  no_action:
    'This checkout does not meet the eligibility criteria for automated recovery at this time.',
}

// Professional inline SVG icons — no emoji
function ActionIcon({ action }: { action: string }) {
  const cls = "w-5 h-5"
  const stroke = "#2563EB"
  if (action === 'send_reminder') return (
    <svg className={cls} fill="none" viewBox="0 0 24 24" stroke={stroke} strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
    </svg>
  )
  if (action === 'retry_payment') return (
    <svg className={cls} fill="none" viewBox="0 0 24 24" stroke={stroke} strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
    </svg>
  )
  if (action === 'switch_payment_method') return (
    <svg className={cls} fill="none" viewBox="0 0 24 24" stroke={stroke} strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
    </svg>
  )
  if (action === 'offer_small_incentive') return (
    <svg className={cls} fill="none" viewBox="0 0 24 24" stroke={stroke} strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 14.25l6-6m4.5-3.493V21.75l-3.75-1.5-3.75 1.5-3.75-1.5-3.75 1.5V4.757c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0c1.1.128 1.907 1.077 1.907 2.185z" />
    </svg>
  )
  if (action === 'human_review') return (
    <svg className={cls} fill="none" viewBox="0 0 24 24" stroke={stroke} strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
    </svg>
  )
  return (
    <svg className={cls} fill="none" viewBox="0 0 24 24" stroke={stroke} strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
    </svg>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt$(val: any, decimals = 2) {
  if (val == null) return '—'
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(val)
}

function fmtPct(val: any) {
  if (val == null) return '—'
  return `${(Number(val) * 100).toFixed(1)}%`
}

// ── Decision factors derived from real backend fields ─────────────────────────

type Factor = { label: string; detail: string; positive: boolean; iconBg: string; iconColor: string; borderColor: string; borderHoverColor: string }

function buildFactors(data: any): Factor[] {
  const factors: Factor[] = []
  const prob = (data.estimated_recovery_probability ?? 0)
  const revenue = data.expected_recoverable_revenue ?? 0
  const cart = data.cart_value ?? 0
  const segment = data.customer_segment ?? ''
  const status = data.payment_status ?? ''
  const attempts = data.attempt_count ?? 1
  const prevSuccess = data.previous_successful_orders ?? 0
  const prevFailed = data.previous_failed_payments ?? 0
  const failureReason = data.failure_reason ?? ''

  if (cart >= 1000) {
    factors.push({
      label: 'High Order Value',
      detail: `Cart value of ${fmt$(cart, 0)} is above the high-value threshold — revenue impact of recovery is significant.`,
      positive: true,
      iconBg: '#EFF6FF',
      iconColor: '#2563EB', // Blue
      borderColor: '#BFDBFE',
      borderHoverColor: '#93C5FD',
    })
  } else if (cart >= 300) {
    factors.push({
      label: 'Meaningful Order Value',
      detail: `Cart value of ${fmt$(cart, 0)} makes this a worthwhile recovery target.`,
      positive: true,
      iconBg: '#EFF6FF',
      iconColor: '#2563EB', // Blue
      borderColor: '#BFDBFE',
      borderHoverColor: '#93C5FD',
    })
  }

  if (segment === 'high_value') {
    factors.push({
      label: 'High-Value Customer',
      detail: 'Customer is categorised as high-value based on past purchase behaviour. These customers have the best recovery success rates.',
      positive: true,
      iconBg: '#EEF2FF',
      iconColor: '#4F46E5', // Indigo
      borderColor: '#C7D2FE',
      borderHoverColor: '#A5B4FC',
    })
  } else if (segment === 'returning') {
    factors.push({
      label: 'Returning Customer',
      detail: 'Customer has successfully purchased before. Familiarity with the platform increases the likelihood of completing this order.',
      positive: true,
      iconBg: '#EEF2FF',
      iconColor: '#4F46E5', // Indigo
      borderColor: '#C7D2FE',
      borderHoverColor: '#A5B4FC',
    })
  } else if (segment === 'at_risk') {
    factors.push({
      label: 'At-Risk Customer Segment',
      detail: 'Customer is flagged as at-risk. Recovery requires a tailored approach — aggressive tactics may reduce conversion.',
      positive: false,
      iconBg: '#FFFBEB',
      iconColor: '#D97706', // Amber
      borderColor: '#FDE68A',
      borderHoverColor: '#FCD34D',
    })
  }

  if (prevSuccess >= 5) {
    factors.push({
      label: 'Strong Purchase History',
      detail: `${prevSuccess} previous successful orders on record. Established customers are more likely to complete recovery.`,
      positive: true,
      iconBg: '#F0FDFA',
      iconColor: '#0D9488', // Teal
      borderColor: '#99F6E4',
      borderHoverColor: '#5EEAD4',
    })
  } else if (prevSuccess > 0) {
    factors.push({
      label: 'Previous Purchases on Record',
      detail: `${prevSuccess} previous successful order${prevSuccess > 1 ? 's' : ''} — customer has converted before.`,
      positive: true,
      iconBg: '#F0FDFA',
      iconColor: '#0D9488', // Teal
      borderColor: '#99F6E4',
      borderHoverColor: '#5EEAD4',
    })
  }

  if (status === 'abandoned') {
    factors.push({
      label: 'Checkout Abandoned at Payment Stage',
      detail: 'The customer reached the payment screen — indicating strong purchase intent. Abandonment at this stage is more recoverable than early exits.',
      positive: true,
      iconBg: '#EFF6FF',
      iconColor: '#2563EB', // Blue
      borderColor: '#BFDBFE',
      borderHoverColor: '#93C5FD',
    })
  } else if (status === 'failed') {
    if (failureReason === 'bank_timeout' || failureReason === 'gateway_timeout' || failureReason === 'upi_timeout') {
      factors.push({
        label: 'Temporary Payment Failure',
        detail: `Failure caused by a ${failureReason.replace(/_/g, ' ')} — these are transient and frequently resolve on retry.`,
        positive: true,
        iconBg: '#FFFBEB',
        iconColor: '#D97706', // Amber
        borderColor: '#FDE68A',
        borderHoverColor: '#FCD34D',
      })
    } else if (failureReason === 'card_declined') {
      factors.push({
        label: 'Payment Declined',
        detail: 'Card was declined. Switching to an alternative payment method (UPI, wallet) has a good success rate for these cases.',
        positive: true,
        iconBg: '#FFFBEB',
        iconColor: '#D97706', // Amber
        borderColor: '#FDE68A',
        borderHoverColor: '#FCD34D',
      })
    } else if (failureReason) {
      factors.push({
        label: 'Payment Failure Detected',
        detail: `Failure reason: ${failureReason.replace(/_/g, ' ')}. The system has selected the most effective recovery approach.`,
        positive: true,
        iconBg: '#FFFBEB',
        iconColor: '#D97706', // Amber
        borderColor: '#FDE68A',
        borderHoverColor: '#FCD34D',
      })
    }
  }

  if (attempts >= 3) {
    factors.push({
      label: 'Multiple Payment Attempts',
      detail: `${attempts} payment attempts recorded — suggests the customer is motivated to complete the purchase and needs an alternative path.`,
      positive: false,
      iconBg: '#FFFBEB',
      iconColor: '#D97706', // Amber
      borderColor: '#FDE68A',
      borderHoverColor: '#FCD34D',
    })
  }

  if (prevFailed >= 2) {
    factors.push({
      label: 'Previous Payment Failures',
      detail: `${prevFailed} prior failed payments. History of failures reduces recovery probability slightly but switching method often overcomes this.`,
      positive: false,
      iconBg: '#FFFBEB',
      iconColor: '#D97706', // Amber
      borderColor: '#FDE68A',
      borderHoverColor: '#FCD34D',
    })
  }

  if (prob >= 0.4) {
    factors.push({
      label: 'Strong Recovery Probability',
      detail: `Estimated ${fmtPct(prob)} chance of recovery — placing this case in the top recovery potential tier.`,
      positive: true,
      iconBg: '#EFF6FF',
      iconColor: '#2563EB', // Blue
      borderColor: '#BFDBFE',
      borderHoverColor: '#93C5FD',
    })
  } else if (prob >= 0.2) {
    factors.push({
      label: 'Moderate Recovery Potential',
      detail: `Estimated ${fmtPct(prob)} recovery probability — worth pursuing given the order value.`,
      positive: true,
      iconBg: '#EFF6FF',
      iconColor: '#2563EB', // Blue
      borderColor: '#BFDBFE',
      borderHoverColor: '#93C5FD',
    })
  }

  if (revenue >= 500) {
    factors.push({
      label: 'High Expected Revenue Impact',
      detail: `Recovering this case is expected to yield ${fmt$(revenue, 0)} — placing it in the High priority tier.`,
      positive: true,
      iconBg: '#F0FDF4',
      iconColor: '#16A34A', // Emerald/Green
      borderColor: '#BBF7D0',
      borderHoverColor: '#86EFAC',
    })
  }

  return factors.slice(0, 6)
}

// ── Structured explanation ────────────────────────────────────────────────────

type ExplainPoint = { label: string; text: string }

function buildExplainPoints(data: any): ExplainPoint[] {
  const points: ExplainPoint[] = []
  const prob = ((data.estimated_recovery_probability ?? 0) * 100).toFixed(0)
  const revenue = fmt$(data.expected_recoverable_revenue, 0)
  const segment = (data.customer_segment ?? '').replace(/_/g, ' ')
  const prevSuccess = data.previous_successful_orders ?? 0
  const status = data.payment_status ?? ''
  const failureReason = data.failure_reason ?? ''
  const action = ACTION_LABELS[data.recommended_action] ?? (data.recommended_action ?? '').replace(/_/g, ' ')

  if (status === 'abandoned') {
    points.push({ label: 'Payment status', text: 'The customer reached the payment screen but did not complete the transaction — a strong signal of purchase intent.' })
  } else if (status === 'failed') {
    points.push({
      label: 'Payment failure', text: failureReason
        ? `The transaction failed due to a ${failureReason.replace(/_/g, ' ')}. Customers who reach the payment step and experience a failure are significantly more likely to convert when helped promptly.`
        : 'The customer attempted to pay but the transaction did not go through.'
    })
  }

  if (prevSuccess > 0) {
    points.push({ label: 'Customer value', text: `This customer has a strong purchase history with ${prevSuccess} successful order${prevSuccess > 1 ? 's' : ''}, indicating a higher probability of completing this transaction.` })
  } else if (segment) {
    points.push({ label: 'Customer segment', text: `Customer is classified as "${segment}". Segment context influences recovery strategy and probability estimates.` })
  }

  points.push({ label: 'Recovery potential', text: `The decision engine estimates a ${prob}% probability of successful recovery using the "${action}" strategy.` })
  points.push({ label: 'Business impact', text: `The expected recoverable value is ${revenue}, qualifying this case for priority processing.` })

  return points
}

function buildPriorityExplanation(data: any): string {
  const priority = getPriority(data.expected_recoverable_revenue ?? 0)
  const revenue = fmt$(data.expected_recoverable_revenue, 0)
  if (priority === 'High') {
    return `This case is High priority because the expected recoverable revenue (${revenue}) exceeds $500. Acting on high-priority cases first maximises total revenue recovered.`
  }
  if (priority === 'Medium') {
    return `This case is Medium priority with an expected recovery value of ${revenue}. It represents a solid revenue opportunity that should be actioned after higher-value cases.`
  }
  return `This case is Low priority with an expected recovery of ${revenue}. Automated recovery carries minimal cost — but higher-priority cases should be addressed first.`
}

// ── Signal parser ──────────────────────────────────────────────────────────────

function parseSignalEntry(signal: string): { label: string; value: string; icon: string } | null {
  if (signal.startsWith('ml_p(')) {
    const m = signal.match(/^ml_p\((.+?)\)=(.+)$/)
    if (m) {
      const act = m[1].replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
      const pct = (parseFloat(m[2]) * 100).toFixed(0)
      return { label: 'ML Score', value: `${act} — ${pct}% predicted success`, icon: 'ml' }
    }
    return null
  }
  const labelMap: Record<string, { label: string, icon: string }> = {
    time_on_checkout_seconds: { label: 'Time on Checkout', icon: 'time' },
    payment_method: { label: 'Payment Method', icon: 'payment' },
    customer_segment: { label: 'Customer Segment', icon: 'customer' },
    previous_successful_orders: { label: 'Successful Past Orders', icon: 'history' },
    previous_failed_payments: { label: 'Past Failed Payments', icon: 'failed' },
    attempt_count: { label: 'Payment Attempts', icon: 'attempt' },
    risk_score: { label: 'Risk Score', icon: 'risk' },
    rule_action: { label: 'Rule Engine Recommendation', icon: 'rule' },
    ml_selected_action: { label: 'ML Selected Action', icon: 'ml' },
    abandoned_high_value_cart: { label: 'High-Value Abandoned Cart', icon: 'value' },
  }
  const eqIdx = signal.indexOf('=')
  if (eqIdx === -1) return null
  const key = signal.slice(0, eqIdx)
  const val = signal.slice(eqIdx + 1)
  const mapping = labelMap[key]
  if (!mapping) return null
  let displayVal = val.replace(/_/g, ' ')
  if (key === 'time_on_checkout_seconds') displayVal = `${val}s`
  if (key === 'risk_score') displayVal = (parseFloat(val) * 100).toFixed(0) + '% risk'
  if (key === 'abandoned_high_value_cart') displayVal = fmt$(parseFloat(val), 0)
  return { label: mapping.label, value: displayVal, icon: mapping.icon }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center py-2.5" style={{ borderBottom: '1px solid #F8FAFC' }}>
      <dt className="text-sm shrink-0 mr-4" style={{ color: '#64748B' }}>{label}</dt>
      <dd className="text-sm text-right">{value}</dd>
    </div>
  )
}

function ProgressBar({ value, color = '#2563EB' }: { value: number; color?: string }) {
  return (
    <div className="w-full h-2 rounded-full overflow-hidden" style={{ backgroundColor: '#E2E8F0' }}>
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${Math.min(100, value * 100)}%`, backgroundColor: color }}
      />
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: '#64748B', letterSpacing: '0.08em' }}>{children}</p>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function RecoveryDetail() {
  const router = useRouter()
  const { id } = router.query

  const [data, setData] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    if (!id) return
    let mounted = true
    setLoading(true)
    setError(null)

    api.getRecoveryDecisionById(id as string)
      .then((res) => {
        if (!mounted) return
        if (!res) setError('Recovery case not found.')
        else setData(res)
      })
      .catch((err: any) => {
        if (!mounted) return
        setError(err.message?.includes('404') ? 'This recovery case could not be found.' : (err.message || 'Failed to load case data.'))
      })
      .finally(() => { if (mounted) setLoading(false) })

    return () => { mounted = false }
  }, [id, refreshKey])

  return (
    <Layout>
      {/* Breadcrumb nav */}
      <div className="mb-5 flex items-center gap-1.5 text-sm" style={{ color: '#94A3B8' }}>
        <Link href="/" className="transition-colors" style={{ color: '#64748B' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#2563EB')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#64748B')}>
          RecoverFlow AI
        </Link>
        <span>/</span>
        <Link href="/dashboard" className="transition-colors" style={{ color: '#64748B' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#2563EB')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#64748B')}>
          Dashboard
        </Link>
        <span>/</span>
        <span style={{ color: '#94A3B8' }}>Recovery Case</span>
      </div>

      {/* ── Loading skeleton ── */}
      {loading && !error && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 animate-pulse">
          {[...Array(6)].map((_, i) => (
            <div key={i} className={`bg-white rounded-xl p-6 ${i >= 4 ? 'md:col-span-3' : i === 2 ? 'md:col-span-1' : ''}`} style={{ border: '1px solid #E2E8F0' }}>
              <div className="h-3 rounded w-1/3 mb-4" style={{ backgroundColor: '#F1F5F9' }} />
              <div className="space-y-3">
                {[...Array(3)].map((_, j) => <div key={j} className="h-3 rounded w-full" style={{ backgroundColor: '#F1F5F9' }} />)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Error state ── */}
      {error && (
        <div className="rounded-xl p-7 flex items-start gap-4" style={{ backgroundColor: '#FEF2F2', border: '1px solid #FECACA' }}>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: '#FEE2E2' }}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="#DC2626" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <div>
            <h2 className="text-base font-semibold mb-1" style={{ color: '#991B1B' }}>Unable to Load Recovery Case</h2>
            <p className="text-sm mb-3" style={{ color: '#B91C1C' }}>{error}</p>
            <div className="flex gap-3">
              <button
                onClick={() => router.reload()}
                className="text-sm px-4 py-1.5 rounded-lg font-medium"
                style={{ backgroundColor: '#DC2626', color: '#FFFFFF' }}
              >
                Retry
              </button>
              <Link href="/dashboard" className="text-sm px-4 py-1.5 rounded-lg font-medium"
                style={{ border: '1px solid #FECACA', color: '#DC2626' }}>
                Back to Dashboard
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* ── Not found ── */}
      {!loading && !error && !data && (
        <div className="bg-white rounded-xl p-14 text-center" style={{ border: '1px solid #E2E8F0' }}>
          <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: '#F1F5F9' }}>
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="#94A3B8" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
          </div>
          <p className="font-medium mb-1" style={{ color: '#475569' }}>Recovery case not found</p>
          <p className="text-sm mb-5" style={{ color: '#94A3B8' }}>The checkout ID in the URL does not match any recovery record.</p>
          <Link href="/dashboard" className="text-sm font-medium underline" style={{ color: '#2563EB' }}>Return to Dashboard</Link>
        </div>
      )}

      {/* ── Main content ── */}
      {!loading && !error && data && (() => {
        const priority = getPriority(data.expected_recoverable_revenue ?? 0)
        const factors = buildFactors(data)
        const explainPoints = buildExplainPoints(data)
        const priorityExplanation = buildPriorityExplanation(data)
        const signals = (data.signals ?? []).map(parseSignalEntry).filter(Boolean)
        const auditTrail = data.audit_trail ?? []
        const isMlAssisted = data.decision_source === 'ml_assisted'
        const recoveryPct = (data.estimated_recovery_probability ?? 0)
        const confidencePct = (data.confidence ?? 0)

        // Extract from audit trail
        const latestAnalysisEvent = auditTrail.slice().reverse().find((e: any) => e.type === 'analysis') || null;
        const latestDecisionEvent = auditTrail.slice().reverse().find((e: any) => e.type === 'decision') || null;
        const latestGuardrailEvent = auditTrail.slice().reverse().find((e: any) => e.type === 'guardrail') || null;
        const latestOutcomeEvent = auditTrail.slice().reverse().find((e: any) => e.type === 'outcome') || null;

        // AGENT ASSESSMENT
        const riskLevel = latestAnalysisEvent?.metadata?.risk_level ?? data.risk_level ?? 'Medium';
        const abandonmentReason = latestAnalysisEvent?.description?.replace('Identified likely reason: ', '') ?? data.likely_abandonment_reason ?? 'Unknown';
        const confidence = latestAnalysisEvent?.metadata?.confidence ?? data.confidence ?? 0;

        // RECOMMENDED ACTION
        const recommendedAction = latestDecisionEvent?.metadata?.action ?? data.recommended_action;
        const reasonForAction = latestDecisionEvent?.description ?? data.reason_for_action ?? 'Based on historical success patterns.';

        // POLICY STATUS
        const policyStatusStr = latestGuardrailEvent?.title?.replace('Policy check: ', '') ?? 'Not Evaluated';
        const policyExplanation = latestGuardrailEvent?.description ?? 'Action has not yet passed through policy engine.';
        
        let policyColor = '#64748B' // slate
        let policyBg = '#F8FAFC'
        let policyBorder = '#E2E8F0'
        if (policyStatusStr.includes('Allowed')) {
            policyColor = '#16A34A'
            policyBg = '#F0FDF4'
            policyBorder = '#BBF7D0'
        } else if (policyStatusStr.includes('Blocked')) {
            policyColor = '#DC2626'
            policyBg = '#FEF2F2'
            policyBorder = '#FECACA'
        } else if (policyStatusStr.includes('Review')) {
            policyColor = '#D97706'
            policyBg = '#FFFBEB'
            policyBorder = '#FDE68A'
        }

        // RECOVERY RESULT
        const recoveryResultStr = latestOutcomeEvent?.metadata?.outcome ?? (data.recovered ? 'recovered' : 'pending');
        const recoveryResultExplanation = latestOutcomeEvent?.description ?? 'Awaiting execution.';
        
        let outcomeColor = '#64748B' // slate
        let outcomeBg = '#F8FAFC'
        let outcomeBorder = '#E2E8F0'
        if (recoveryResultStr === 'recovered') {
            outcomeColor = '#16A34A'
            outcomeBg = '#F0FDF4'
            outcomeBorder = '#BBF7D0'
        } else if (recoveryResultStr === 'failed' || recoveryResultStr === 'stopped_by_policy') {
            outcomeColor = '#DC2626'
            outcomeBg = '#FEF2F2'
            outcomeBorder = '#FECACA'
        }

        return (
          <div className="space-y-5">

            {/* ── Page title row ── */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-lg font-bold" style={{ color: '#0F172A' }}>Recovery Case</h1>
                <p className="text-xs font-mono mt-0.5" style={{ color: '#94A3B8' }}>{data.checkout_id}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span
                  className="text-xs font-semibold px-2.5 py-1 rounded-full border"
                  style={{ backgroundColor: '#EFF6FF', color: '#1D4ED8', borderColor: '#BFDBFE' }}
                >
                  Agent Workflow
                </span>
              </div>
            </div>

            {/* ── Top Row: Revenue & Result ── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white rounded-2xl p-7 flex flex-col justify-between shadow-sm" style={{ border: '1px solid #E2E8F0' }}>
                <SectionLabel>Revenue at Risk</SectionLabel>
                <div className="mt-4">
                    <p className="text-4xl font-bold tracking-tight" style={{ color: '#0F172A' }}>{fmt$(data.cart_value, 0)}</p>
                    <p className="text-sm mt-1.5" style={{ color: '#64748B' }}>Original checkout value</p>
                </div>
              </div>
              <div className="rounded-2xl p-7 flex flex-col justify-between shadow-sm" style={{ backgroundColor: outcomeBg, border: `1px solid ${outcomeBorder}` }}>
                <SectionLabel>Recovery Result</SectionLabel>
                <div className="mt-4">
                    <p className="text-3xl font-bold uppercase tracking-wide" style={{ color: outcomeColor }}>{recoveryResultStr.replace(/_/g, ' ')}</p>
                    <p className="text-sm mt-1.5 font-medium" style={{ color: outcomeColor === '#16A34A' ? '#15803D' : '#475569' }}>{recoveryResultExplanation}</p>
                </div>
              </div>
            </div>

            {/* ── Agent Assessment ── */}
            <div className="bg-white rounded-2xl p-7 shadow-sm" style={{ border: '1px solid #E2E8F0' }}>
                <SectionLabel>Agent Assessment</SectionLabel>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-5">
                    <div>
                        <p className="text-xs uppercase tracking-wider font-semibold mb-1.5" style={{ color: '#64748B' }}>Risk Level</p>
                        <p className="text-lg font-bold capitalize" style={{ color: '#0F172A' }}>{riskLevel}</p>
                    </div>
                    <div>
                        <p className="text-xs uppercase tracking-wider font-semibold mb-1.5" style={{ color: '#64748B' }}>Likely Abandonment Reason</p>
                        <p className="text-lg font-bold capitalize leading-tight" style={{ color: '#0F172A' }}>{abandonmentReason}</p>
                    </div>
                    <div>
                        <p className="text-xs uppercase tracking-wider font-semibold mb-1.5" style={{ color: '#64748B' }}>Confidence</p>
                        <div className="flex items-center gap-2">
                           <p className="text-lg font-bold" style={{ color: '#0F172A' }}>{fmtPct(confidence)}</p>
                           <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ backgroundColor: '#F1F5F9' }}>
                               <div className="h-full rounded-full transition-all" style={{ width: `${Math.round(confidence * 100)}%`, backgroundColor: confidence > 0.7 ? '#10B981' : (confidence > 0.4 ? '#F59E0B' : '#EF4444') }} />
                           </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Recommended Action ── */}
            <div className="bg-white rounded-2xl p-7 shadow-sm" style={{ border: '1px solid #BFDBFE', backgroundColor: '#F8FAFC' }}>
              <div className="flex items-center gap-2 mb-4">
                 <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#2563EB' }} />
                 <h2 className="text-xs font-bold uppercase tracking-wider" style={{ color: '#1E3A8A' }}>Recommended Action</h2>
              </div>
              <div className="flex items-start gap-5">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 shadow-sm" style={{ backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0' }}>
                  <ActionIcon action={recommendedAction} />
                </div>
                <div className="flex-1 pt-0.5">
                  <h3 className="text-xl font-bold capitalize" style={{ color: '#0F172A' }}>
                    {ACTION_LABELS[recommendedAction] ?? recommendedAction?.replace(/_/g, ' ')}
                  </h3>
                  <p className="text-sm leading-relaxed mt-1.5 font-medium" style={{ color: '#475569' }}>
                    {reasonForAction}
                  </p>
                </div>
              </div>
            </div>

            {/* ── Policy Status ── */}
            <div className="rounded-2xl p-7 shadow-sm" style={{ backgroundColor: policyBg, border: `1px solid ${policyBorder}` }}>
                <SectionLabel>Policy Status</SectionLabel>
                <div className="mt-3 flex items-baseline gap-4">
                    <p className="text-xl font-bold uppercase tracking-wide" style={{ color: policyColor }}>{policyStatusStr}</p>
                    <p className="text-sm font-medium" style={{ color: policyColor === '#16A34A' ? '#15803D' : '#475569' }}>{policyExplanation}</p>
                </div>
            </div>

            {/* ── Audit Trail ── */}
            {auditTrail.length > 0 && (
              <div className="bg-white rounded-2xl p-7 shadow-sm" style={{ border: '1px solid #E2E8F0' }}>
                <SectionLabel>Execution Audit Trail</SectionLabel>
                <div className="relative mt-6">
                  <div className="absolute top-0 bottom-0 left-[19px] w-px bg-slate-200" />
                  <div className="space-y-8">
                    {auditTrail.map((event: any, i: number) => {
                      let iconColor = '#64748B'
                      let iconBg = '#F8FAFC'
                      
                      if (event.type === 'detection') {
                        iconColor = '#F59E0B' // Amber
                        iconBg = '#FEF3C7'
                      } else if (event.type === 'analysis' || event.type === 'decision') {
                        iconColor = '#3B82F6' // Blue
                        iconBg = '#EFF6FF'
                      } else if (event.type === 'guardrail') {
                        iconColor = event.title.includes('Blocked') ? '#DC2626' : (event.title.includes('Review') ? '#D97706' : '#10B981')
                        iconBg = event.title.includes('Blocked') ? '#FEE2E2' : (event.title.includes('Review') ? '#FEF3C7' : '#D1FAE5')
                      } else if (event.type === 'outcome') {
                        iconColor = event.title.includes('Success') ? '#16A34A' : '#64748B'
                        iconBg = event.title.includes('Success') ? '#DCFCE7' : '#F1F5F9'
                      }

                      return (
                        <div key={i} className="relative flex gap-5">
                          <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 z-10" style={{ backgroundColor: iconBg, border: '4px solid white', boxShadow: '0 0 0 1px #E2E8F0' }}>
                            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: iconColor }} />
                          </div>
                          <div className="pt-2 flex-1 pb-1">
                            <div className="flex justify-between items-start mb-1.5">
                              <h3 className="text-base font-bold" style={{ color: '#0F172A' }}>{event.title}</h3>
                              <span className="text-xs font-semibold" style={{ color: '#94A3B8' }}>
                                {new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                              </span>
                            </div>
                            <p className="text-sm leading-relaxed" style={{ color: '#475569' }}>{event.description}</p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}
            {/* ── Decision Engine Signals ── */}
            {signals.length > 0 && (
              <div className="bg-white rounded-2xl p-7 shadow-sm" style={{ border: '1px solid #E2E8F0' }}>
                <SectionLabel>Decision Engine Signals</SectionLabel>
                <p className="text-sm mb-5 mt-2" style={{ color: '#64748B' }}>
                  Raw signals captured by the decision engine for this checkout session.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                  {signals.map((s: any, i: number) => {
                    let iconBg = '#F1F5F9'
                    let iconColor = '#64748B'
                    let borderColor = '#E2E8F0'
                    let borderHoverColor = '#CBD5E1'
                    let iconSvg = <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    
                    if (s.icon === 'payment') {
                      iconBg = '#EFF6FF'
                      iconColor = '#2563EB' // Razorpay blue
                      borderColor = '#BFDBFE' // Blue-200
                      borderHoverColor = '#93C5FD' // Blue-300
                      iconSvg = <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
                    } else if (s.icon === 'customer') {
                      iconBg = '#EEF2FF'
                      iconColor = '#4F46E5' // Indigo
                      borderColor = '#C7D2FE' // Indigo-200
                      borderHoverColor = '#A5B4FC' // Indigo-300
                      iconSvg = <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                    } else if (s.icon === 'history') {
                      iconBg = '#F0FDFA'
                      iconColor = '#0D9488' // Teal
                      borderColor = '#99F6E4' // Teal-200
                      borderHoverColor = '#5EEAD4' // Teal-300
                      iconSvg = <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                    }

                    return (
                      <div
                        key={i}
                        className="rounded-xl p-5 transition-all duration-200 flex flex-col h-full"
                        style={{ backgroundColor: '#FFFFFF', border: `1.5px solid ${borderColor}`, boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)' }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = borderHoverColor
                          e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
                          e.currentTarget.style.transform = 'translateY(-2px)'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = borderColor
                          e.currentTarget.style.boxShadow = '0 1px 2px 0 rgba(0, 0, 0, 0.05)'
                          e.currentTarget.style.transform = 'none'
                        }}
                      >
                        <div className="flex items-center gap-3 mb-4">
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 shadow-sm" style={{ backgroundColor: iconBg }}>
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke={iconColor} strokeWidth={2}>
                              {iconSvg}
                            </svg>
                          </div>
                          <p className="text-xs font-bold uppercase tracking-wider" style={{ color: '#64748B' }}>{s.label}</p>
                        </div>
                        <p className="text-base font-bold capitalize" style={{ color: '#0F172A' }}>{s.value}</p>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ── Recovery Execution (Interactive) ── */}
            <RecoveryExecutionSection 
               data={data} 
               recommendedAction={recommendedAction} 
               onExecuted={() => setRefreshKey(prev => prev + 1)} 
            />

            {/* Back link */}
            <div className="pt-2">
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-1.5 text-sm font-medium transition-colors"
                style={{ color: '#64748B' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#2563EB')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#64748B')}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                </svg>
                Back to Dashboard
              </Link>
            </div>

          </div>
        )
      })()}
    </Layout>
  )
}
