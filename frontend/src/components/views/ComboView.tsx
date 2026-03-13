import type { Capture, Matter } from '@/types'
import { matterColor } from '@/lib/colors'
import { TimelineView } from './TimelineView'

interface Props {
  captures: Capture[]
  matters: Matter[]
  onReassign: (captureId: number, matterId: number) => void
  selectedIds: Set<number>
  onToggleSelect: (captureId: number) => void
}

export function ComboView({ captures, matters, onReassign, selectedIds, onToggleSelect }: Props) {
  // Summarize captures by matter
  const byMatter = captures.reduce<Record<number | 'none', { captures: number }>>((acc, c) => {
    const key = c.matter_id ?? 'none'
    if (!acc[key]) acc[key] = { captures: 0 }
    acc[key].captures++
    return acc
  }, {} as Record<number | 'none', { captures: number }>)

  return (
    <div className="flex gap-4 h-full">
      {/* Left 60%: timeline */}
      <div className="flex-[3] min-w-0">
        <TimelineView
          captures={captures}
          matters={matters}
          onReassign={onReassign}
          selectedIds={selectedIds}
          onToggleSelect={onToggleSelect}
        />
      </div>

      {/* Right 40%: matter summary */}
      <div className="flex-[2] min-w-0">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Matter Summary</h3>
          {Object.keys(byMatter).length === 0 ? (
            <p className="text-sm text-gray-400">No captures.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {Object.entries(byMatter).map(([key, info]) => {
                const mid = key === 'none' ? null : Number(key)
                const matter = mid ? matters.find(m => m.id === mid) : null
                const color = mid ? matterColor(mid) : '#94A3B8'
                const label = matter?.name ?? 'Uncategorized'
                const pct = captures.length > 0 ? Math.round((info.captures / captures.length) * 100) : 0

                return (
                  <div key={key} className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                      <span className="text-xs text-gray-700 flex-1 truncate">{label}</span>
                      <span className="text-xs text-gray-400">{info.captures} cap.</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${pct}%`, backgroundColor: color }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
