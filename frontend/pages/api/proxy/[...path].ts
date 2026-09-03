import type { NextApiRequest, NextApiResponse } from 'next'

let BACKEND = process.env.BACKEND_URL || 'http://127.0.0.1:8000'
// Prevent proxy loop if environment variable was misconfigured
if (BACKEND.includes('/api/proxy') || BACKEND.includes('localhost:3000')) {
    BACKEND = 'http://127.0.0.1:8000'
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const prefix = '/api/proxy'
    const fullUrl = req.url || ''
    const tail = fullUrl.startsWith(prefix) ? fullUrl.slice(prefix.length) : fullUrl
    const target = `${BACKEND}${tail}`

    console.log(`[Proxy] Forwarding ${req.method} ${target}`)

    const fetchOptions: RequestInit = {
      method: req.method,
      headers: {
        'Accept': 'application/json',
      },
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      fetchOptions.body = JSON.stringify(req.body)
      fetchOptions.headers = { ...fetchOptions.headers, 'Content-Type': 'application/json' }
    }

    const r = await fetch(target, fetchOptions)
    
    if (!r.ok) {
        console.error(`[Proxy] Backend returned ${r.status} for ${target}`)
    }

    const text = await r.text()
    res.status(r.status)
    const ct = r.headers.get('content-type')
    if (ct) res.setHeader('content-type', ct)
    res.send(text)
  } catch (err: any) {
    console.error(`[Proxy] Error forwarding to backend:`, err)
    res.status(500).json({ error: err.message })
  }
}
