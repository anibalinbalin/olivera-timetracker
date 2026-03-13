import { useState } from 'react'
import { ArrowDown01Icon, ArrowRight01Icon } from 'hugeicons-react'
import type { Capture, Matter } from '@/types'
import { matterColor } from '@/lib/colors'
import { CaptureCard } from '@/components/CaptureCard'

interface Props {
  captures: Capture[]
  matters: Matter[]
  onReassign: (captureId: number, matterId: number) => void
  selectedIds: Set<number>
  onToggleSelect: (captureId: number) => void
}

interface GroupCardProps {
  label: string
  color?: string
  totalCaptures: number
  captures: Capture[]
  matters: Matter[]
  onReassign: (captureId: number, matterId: number) => void
  selectedIds: Set<number>
  onToggleSelect: (captureId: number) => void
}

function GroupCard({ label, color, totalCaptures, captures, matters, onReassign, selectedIds, onToggleSelect }: GroupCardProps) {
  const [expanded, setExpanded] = useState(true)

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-2.5 px-4 py-3 bg-gray-50 border-b border-gray-200 hover:bg-gray-100 transition-colors"
      >
        {color && (
          <span className="inline-block w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
        )}
        <span className="font-semibold text-gray-900 text-sm flex-1 text-left">{label}</span>
        <span className="text-xs text-gray-400">{totalCaptures} capture{totalCaptures !== 1 ? 's' : ''}</span>
        {expanded ? <ArrowDown01Icon size={14} className="text-gray-400" /> : <ArrowRight01Icon size={14} className="text-gray-400" />}
      </button>
      {expanded && (
        <div className="p-2 flex flex-col gap-1">
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
      )}
    </div>
  )
}

export function MatterGroupedView({ captures, matters, onReassign, selectedIds, onToggleSelect }: Props) {
  const assigned = captures.filter(c => c.matter_id)
  const unassigned = captures.filter(c => !c.matter_id)

  // Group by matter
  const byMatter = assigned.reduce<Record<number, Capture[]>>((acc, c) => {
    const mid = c.matter_id!
    if (!acc[mid]) acc[mid] = []
    acc[mid].push(c)
    return acc
  }, {})

  if (captures.length === 0) {
    return <p className="text-sm text-gray-400 py-8 text-center">No captures for this day.</p>
  }

  return (
    <div className="flex flex-col gap-3">
      {Object.entries(byMatter).map(([midStr, caps]) => {
        const mid = Number(midStr)
        const matter = matters.find(m => m.id === mid)
        return (
          <GroupCard
            key={mid}
            label={matter?.name ?? `Matter ${mid}`}
            color={matterColor(mid)}
            totalCaptures={caps.length}
            captures={caps}
            matters={matters}
            onReassign={onReassign}
            selectedIds={selectedIds}
            onToggleSelect={onToggleSelect}
          />
        )
      })}
      {unassigned.length > 0 && (
        <GroupCard
          label="Uncategorized"
          totalCaptures={unassigned.length}
          captures={unassigned}
          matters={matters}
          onReassign={onReassign}
          selectedIds={selectedIds}
          onToggleSelect={onToggleSelect}
        />
      )}
    </div>
  )
}
