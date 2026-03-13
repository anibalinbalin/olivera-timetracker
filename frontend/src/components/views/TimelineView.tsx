import type { Capture, Matter } from '@/types'
import { CaptureCard } from '@/components/CaptureCard'

interface Props {
  captures: Capture[]
  matters: Matter[]
  onReassign: (captureId: number, matterId: number) => void
  selectedIds: Set<number>
  onToggleSelect: (captureId: number) => void
}

export function TimelineView({ captures, matters, onReassign, selectedIds, onToggleSelect }: Props) {
  if (captures.length === 0) {
    return <p className="text-sm text-gray-400 py-8 text-center">No captures for this day.</p>
  }

  return (
    <div className="flex flex-col gap-1.5">
      {captures.map(c => (
        <CaptureCard
          key={c.id}
          capture={c}
          matters={matters}
          onReassign={onReassign}
          selected={selectedIds.has(c.id)}
          onToggleSelect={onToggleSelect}
        />
      ))}
    </div>
  )
}
