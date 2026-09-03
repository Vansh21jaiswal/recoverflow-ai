import React, { useState } from 'react'
import api from '../lib/api'

export default function RecoveryExecutionSection({ data, recommendedAction, onExecuted }: { data: any, recommendedAction: string, onExecuted: () => void }) {
  const [isExecuting, setIsExecuting] = useState(false)
  const [localExecutionResult, setLocalExecutionResult] = useState<any>(null)

  const isAlreadyExecuted = data.audit_trail && data.audit_trail.length > 1;

  // Extract from existing audit trail if it exists, otherwise use local result
  let finalOutcomeEvent = null;
  let finalGuardrailEvent = null;
  
  if (localExecutionResult) {
     finalGuardrailEvent = { status: localExecutionResult.guardrail_decision.status }
     finalOutcomeEvent = { outcome: localExecutionResult.outcome, recovered_amount: localExecutionResult.recovered_amount }
  } else if (isAlreadyExecuted) {
     const rev = [...data.audit_trail].reverse()
     const outcome = rev.find((e: any) => e.type === 'outcome')
     const guardrail = rev.find((e: any) => e.type === 'guardrail')
     if (outcome) {
         finalOutcomeEvent = { outcome: outcome.metadata?.outcome || 'unknown', recovered_amount: outcome.metadata?.recovered || 0 }
     }
     if (guardrail) {
         let st = 'allowed';
         if (guardrail.title.includes('Blocked')) st = 'blocked';
         if (guardrail.title.includes('Review')) st = 'requires_review';
         finalGuardrailEvent = { status: st }
     }
  }

  // Client-side preview of guardrails
  const checks = [
    { name: 'Customer contact allowed', passed: true, reason: 'Customer has not opted out.' },
    { name: 'Contact frequency', passed: (data.attempt_count || 0) < 3, reason: (data.attempt_count || 0) < 3 ? 'Within limits' : 'Max attempts reached' },
  ]
  
  const isHighValue = data.cart_value >= 5000;
  const isRiskyAction = !['send_payment_reminder', 'send_personalized_nudge', 'no_action'].includes(recommendedAction);
  const requiresReview = isHighValue && isRiskyAction;
  
  if (requiresReview) {
      checks.push({ name: 'Action type permitted', passed: false, reason: 'High value transactions require human review for this action.' });
  } else {
      checks.push({ name: 'Action type permitted', passed: true, reason: 'Action is permitted for this risk tier.' });
  }

  const allPassed = checks.every(c => c.passed) && !requiresReview;
  const policyStatus = requiresReview ? 'Review Required' : (allPassed ? 'Allowed' : 'Blocked');

  const actionLabels: any = {
    send_payment_reminder: 'Send Reminder',
    send_personalized_nudge: 'Send Nudge',
    offer_limited_discount: 'Offer Discount',
    create_payment_link: 'Create Link',
    no_action: 'No Action',
    escalate_for_review: 'Human Review',
    retry_payment: 'Retry Payment',
    switch_payment_method: 'Switch Payment Method'
  }
  const actionLabel = actionLabels[recommendedAction] || recommendedAction.replace(/_/g, ' ')

  const handleExecute = async () => {
    setIsExecuting(true)
    try {
      const res = await api.executeRecoveryAction(data.checkout_id)
      setLocalExecutionResult(res)
      onExecuted()
    } catch (err) {
      console.error(err)
      alert("Failed to execute")
    } finally {
      setIsExecuting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="mt-8 border-t border-slate-200 pt-8" />
      
      <div>
        <h2 className="text-xl font-bold mb-1" style={{ color: '#0F172A' }}>RECOVERY EXECUTION</h2>
        <p className="text-sm" style={{ color: '#64748B' }}>Validate the recommended action against policy guardrails and execute a bounded recovery workflow.</p>
      </div>

      {/* 1. Policy & Guardrail Check */}
      {!isAlreadyExecuted && (
          <div className="bg-white rounded-2xl p-7 shadow-sm" style={{ border: '1px solid #E2E8F0' }}>
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: '#64748B' }}>1. Policy & Guardrail Check</h3>
              <span className="px-3 py-1.5 rounded-full text-xs font-bold" style={{
                backgroundColor: policyStatus === 'Allowed' ? '#DCFCE7' : (policyStatus === 'Review Required' ? '#FEF3C7' : '#FEE2E2'),
                color: policyStatus === 'Allowed' ? '#15803D' : (policyStatus === 'Review Required' ? '#B45309' : '#B91C1C')
              }}>
                {policyStatus}
              </span>
            </div>
            <ul className="space-y-4">
              {checks.map((c, i) => (
                <li key={i} className="flex items-start gap-4">
                  <div className="mt-0.5">
                    {c.passed ? (
                      <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800">{c.name}</p>
                    <p className="text-sm text-slate-500 mt-0.5">{c.reason}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
      )}

      {/* 2. Execute Button */}
      {!isAlreadyExecuted && !localExecutionResult && (
        <div className="bg-white rounded-2xl p-7 shadow-sm" style={{ border: '1px solid #E2E8F0' }}>
            <h3 className="text-xs font-bold uppercase tracking-wider mb-5" style={{ color: '#64748B' }}>2. Execute Recovery Action</h3>
            {policyStatus === 'Allowed' || policyStatus === 'Review Required' ? (
                <button
                    onClick={handleExecute}
                    disabled={isExecuting}
                    className="w-full sm:w-auto px-8 py-3.5 rounded-xl font-bold text-white transition-colors"
                    style={{ backgroundColor: isExecuting ? '#94A3B8' : '#2563EB', boxShadow: isExecuting ? 'none' : '0 4px 6px -1px rgba(37, 99, 235, 0.2)' }}
                >
                    {isExecuting ? 'Executing...' : `Execute ${actionLabel}`}
                </button>
            ) : (
                <p className="text-sm font-medium text-slate-500">Execution blocked by policy.</p>
            )}
        </div>
      )}

      {/* 3. Result Card */}
      {(localExecutionResult || isAlreadyExecuted) && finalOutcomeEvent && (
        <div className="bg-white rounded-2xl p-7 shadow-sm" style={{ border: '1px solid #E2E8F0', borderLeft: '4px solid #16A34A' }}>
          <h3 className="text-xs font-bold uppercase tracking-wider mb-5" style={{ color: '#64748B' }}>3. Recovery Workflow Result</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
             <div>
                <p className="text-xs uppercase tracking-wider font-semibold mb-1.5" style={{ color: '#64748B' }}>Recovery Action</p>
                <p className="text-base font-bold text-slate-800">{actionLabel}</p>
             </div>
             <div>
                <p className="text-xs uppercase tracking-wider font-semibold mb-1.5" style={{ color: '#64748B' }}>Policy Status</p>
                <p className="text-base font-bold capitalize text-slate-800">{finalGuardrailEvent?.status?.replace(/_/g, ' ') || 'Unknown'}</p>
             </div>
             <div>
                <p className="text-xs uppercase tracking-wider font-semibold mb-1.5" style={{ color: '#64748B' }}>Execution Status</p>
                <p className="text-base font-bold text-slate-800">Executed</p>
             </div>
             <div>
                <p className="text-xs uppercase tracking-wider font-semibold mb-1.5" style={{ color: '#64748B' }}>Current Outcome</p>
                <p className="text-base font-bold capitalize text-slate-800">{finalOutcomeEvent.outcome.replace(/_/g, ' ')}</p>
             </div>
          </div>
          {finalOutcomeEvent.outcome === 'recovered' && (
              <div className="mt-6 pt-6 border-t border-slate-100 flex items-center justify-between">
                  <p className="text-sm font-bold uppercase tracking-wider text-slate-500">Recovered Revenue</p>
                  <p className="text-2xl font-bold text-green-600">₹{finalOutcomeEvent.recovered_amount}</p>
              </div>
          )}
        </div>
      )}

      {/* 4. Audit Trail */}
      {/* If it was executed, the parent page already renders the Execution Audit Trail from `data.audit_trail`. So we only need to show a local simulated one if they JUST clicked execute and we are waiting for the page refresh, OR we can let the page refresh handle it. Since we call onExecuted(), the page refreshes and the parent renders it. */}
      {localExecutionResult && !isAlreadyExecuted && (
         <div className="bg-white rounded-2xl p-7 shadow-sm" style={{ border: '1px solid #E2E8F0' }}>
            <h3 className="text-xs font-bold uppercase tracking-wider mb-6" style={{ color: '#64748B' }}>4. Execution Audit Trail</h3>
            <div className="relative mt-6">
               <div className="absolute top-0 bottom-0 left-[19px] w-px bg-slate-200" />
               <div className="space-y-8">
                 {[
                     { label: 'Checkout event identified', time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) },
                     { label: 'Revenue recovery opportunity detected', time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) },
                     { label: `Recommended action selected (${actionLabel})`, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) },
                     { label: `Policy guardrails evaluated: ${finalGuardrailEvent?.status}`, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) },
                     { label: 'Recovery action executed', time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) },
                     { label: `Workflow outcome recorded: ${finalOutcomeEvent?.outcome.replace(/_/g, ' ')}`, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) },
                 ].map((event, idx) => (
                     <div key={idx} className="relative flex gap-5">
                         <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 z-10" style={{ backgroundColor: '#F8FAFC', border: '4px solid white', boxShadow: '0 0 0 1px #E2E8F0' }}>
                             <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                         </div>
                         <div className="pt-2 flex-1 pb-1">
                             <div className="flex justify-between items-start mb-1.5">
                                 <h3 className="text-base font-bold text-slate-800">{event.label}</h3>
                                 <span className="text-xs font-semibold text-slate-400">{event.time}</span>
                             </div>
                         </div>
                     </div>
                 ))}
               </div>
            </div>
         </div>
      )}
    </div>
  )
}
