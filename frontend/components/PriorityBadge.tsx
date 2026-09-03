type Priority = 'High' | 'Medium' | 'Low'

export function getPriority(expectedRevenue: number): Priority {
  if (expectedRevenue >= 500) return 'High'
  if (expectedRevenue >= 200) return 'Medium'
  return 'Low'
}

const priorityStyles: Record<Priority, { bg: string; text: string; border: string }> = {
  High: { bg: '#EFF6FF', text: '#1D4ED8', border: '#BFDBFE' },
  Medium: { bg: '#F8FAFC', text: '#475569', border: '#CBD5E1' },
  Low: { bg: '#F8FAFC', text: '#64748B', border: '#E2E8F0' },
}

export default function PriorityBadge({ revenue }: { revenue: number }) {
  const priority = getPriority(revenue)
  const s = priorityStyles[priority]
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border"
      style={{ backgroundColor: s.bg, color: s.text, borderColor: s.border }}
    >
      {priority}
    </span>
  )
}
