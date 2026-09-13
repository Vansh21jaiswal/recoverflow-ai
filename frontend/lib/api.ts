const isServer = typeof window === 'undefined'
const BACKEND_URL = isServer
  ? (process.env.BACKEND_URL || 'http://127.0.0.1:8000/api')
  : '/api'

async function fetchJson(path: string) {
  const url = `${BACKEND_URL}${path}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json()
}

export async function getCheckoutsSummary() {
  return fetchJson('/checkouts/summary')
}

export async function getRecoveryBaselineSummary() {
  return fetchJson('/recovery/baseline-summary')
}

export async function getRecoveryDecisions(limit = 25) {
  return fetchJson(`/recovery/decisions?limit=${limit}`)
}

export async function getRecoveryDecisionById(id: string) {
  return fetchJson(`/recovery/decision/${id}`)
}

export async function getExecutionSummary() {
  return fetchJson('/recovery/execution-summary')
}

export async function batchExecuteRecovery(limit = 100) {
  const url = `${BACKEND_URL}/recovery/batch-execute?limit=${limit}`
  const res = await fetch(url, { method: 'POST' })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json()
}

export async function executeRecoveryAction(id: string) {
  const url = `${BACKEND_URL}/recovery/execute/${id}`
  const res = await fetch(url, { method: 'POST' })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json()
}

export default { getCheckoutsSummary, getRecoveryBaselineSummary, getRecoveryDecisions, getRecoveryDecisionById, getExecutionSummary, batchExecuteRecovery, executeRecoveryAction }
