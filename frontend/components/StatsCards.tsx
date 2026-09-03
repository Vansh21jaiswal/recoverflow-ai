type Stat = {
  label: string
  value: string
  subtitle?: string
  accent?: 'blue' | 'green' | 'amber' | 'red' | 'gray' | 'indigo'
}

const accentStyles: Record<string, { bg: string, text: string }> = {
  blue: { bg: '#EFF6FF', text: '#2563EB' },
  indigo: { bg: '#EEF2FF', text: '#4F46E5' },
  green: { bg: '#F0FDF4', text: '#16A34A' },
  amber: { bg: '#FFFBEB', text: '#D97706' },
  red: { bg: '#FEF2F2', text: '#DC2626' },
  gray: { bg: '#F8FAFC', text: '#64748B' },
}

export default function StatsCards({ stats }: { stats: Stat[] }) {
  return (
    <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {stats.map((s) => {
        const accent = accentStyles[s.accent ?? 'gray']
        return (
          <div
            key={s.label}
            className="p-5 bg-white rounded-lg flex flex-col justify-between"
            style={{
              border: '1px solid #E2E8F0',
            }}
          >
            <div className="flex items-start justify-between mb-2">
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#64748B', letterSpacing: '0.06em' }}>{s.label}</p>
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: accent.text }} />
            </div>
            <div>
              <p className="text-2xl font-bold" style={{ color: '#0F172A' }}>{s.value}</p>
              {s.subtitle && (
                <p className="text-xs mt-1" style={{ color: '#94A3B8' }}>{s.subtitle}</p>
              )}
            </div>
          </div>
        )
      })}
    </section>
  )
}
