import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell
} from 'recharts'

type Props = {
  distribution: Record<string, number>
}

// Blue-palette action colors for fintech theme
const ACTION_COLORS: Record<string, string> = {
  'Send Reminder': '#2563EB',
  'Retry Payment': '#1D4ED8',
  'Switch Payment Method': '#3B82F6',
  'Human Review': '#60A5FA',
  'Offer Small Incentive': '#93C5FD',
}

export default function RecoveryInsights({ distribution }: Props) {
  const data = Object.entries(distribution || {})
    .map(([action, count]) => ({
      action: action.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
      count,
    }))
    .sort((a, b) => b.count - a.count)

  const total = data.reduce((sum, d) => sum + d.count, 0)

  if (data.length === 0) {
    return (
      <div className="bg-white rounded-lg p-6 h-full flex flex-col" style={{ border: '1px solid #E2E8F0' }}>
        <h3 className="text-sm font-semibold mb-1" style={{ color: '#0F172A' }}>Recovery Actions</h3>
        <p className="text-sm mb-6" style={{ color: '#94A3B8' }}>Distribution of AI-recommended recovery actions</p>
        <div className="flex-1 flex items-center justify-center text-sm" style={{ color: '#94A3B8' }}>No data available</div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg p-6 h-full flex flex-col" style={{ border: '1px solid #E2E8F0' }}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: '#64748B', letterSpacing: '0.06em' }}>Recovery Actions</p>
          <p className="text-sm" style={{ color: '#94A3B8' }}>Distribution of AI-recommended actions</p>
        </div>
        <span className="text-xs px-2 py-1 rounded" style={{ color: '#64748B', backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' }}>{total} cases</span>
      </div>

      {/* Recharts bar chart */}
      <div className="flex-1 min-h-0" style={{ height: 200 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 4, bottom: 0 }}>
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="action"
              width={160}
              tick={{ fontSize: 12, fill: '#64748B' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              formatter={(value: any) => [`${value} cases`, 'Count']}
              contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid #E2E8F0', color: '#0F172A' }}
            />
            <Bar dataKey="count" radius={[0, 4, 4, 0]}>
              {data.map((entry) => (
                <Cell
                  key={entry.action}
                  fill={ACTION_COLORS[entry.action] ?? '#3B82F6'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Legend row with percentages */}
      <div className="mt-4 space-y-1.5">
        {data.map((entry) => (
          <div key={entry.action} className="flex items-center justify-between text-xs" style={{ color: '#475569' }}>
            <div className="flex items-center gap-1.5">
              <span
                className="inline-block w-2.5 h-2.5 rounded-sm"
                style={{ background: ACTION_COLORS[entry.action] ?? '#3B82F6' }}
              />
              {entry.action}
            </div>
            <span style={{ color: '#94A3B8' }}>{total > 0 ? ((entry.count / total) * 100).toFixed(0) : 0}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}
