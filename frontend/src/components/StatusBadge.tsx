import type { TimeEntry } from '@/types'

const STATUS_STYLES: Record<TimeEntry['status'], string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  REVIEWED: 'bg-yellow-100 text-yellow-700',
  APPROVED: 'bg-green-100 text-green-700',
}

export function StatusBadge({ status }: { status: TimeEntry['status'] }) {
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}>
      {status}
    </span>
  )
}
