import { format } from 'date-fns'
import type { Capture, Matter } from '@/types'
import { matterColor } from '@/lib/colors'
import { MatterSelect } from './MatterSelect'

interface Props {
  capture: Capture
  matters: Matter[]
  onReassign: (captureId: number, matterId: number) => void
  selected?: boolean
  onToggleSelect?: (captureId: number) => void
}

export function CaptureCard({ capture, matters, onReassign, selected, onToggleSelect }: Props) {
  const unassigned = !capture.matter_id
  const matter = capture.matter_id ? matters.find(m => m.id === capture.matter_id) : undefined
  const color = matter ? matterColor(matter.id) : undefined
  const time = format(new Date(capture.timestamp), 'HH:mm')

  return (
    <div
      className={`flex items-start gap-2.5 rounded-lg border px-3 py-2 text-sm transition-colors ${
        unassigned
          ? 'border-amber-200 bg-amber-50'
          : 'border-gray-100 bg-white hover:bg-gray-50'
      } ${selected ? 'ring-2 ring-blue-400' : ''}`}
    >
      {onToggleSelect && (
        <input
          type="checkbox"
          checked={selected ?? false}
          onChange={() => onToggleSelect(capture.id)}
          className="mt-0.5 shrink-0 accent-blue-500"
        />
      )}

      <span className="shrink-0 font-mono text-xs text-gray-400 mt-0.5 w-10">{time}</span>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-medium text-gray-800 truncate">{capture.app_name}</span>
          {matter && (
            <span
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium text-white"
              style={{ backgroundColor: color }}
            >
              {matter.name}
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500 truncate mt-0.5">{capture.window_title}</p>

        {unassigned && (
          <div className="mt-1.5">
            <MatterSelect
              matters={matters}
              onChange={matterId => onReassign(capture.id, matterId)}
            />
          </div>
        )}
      </div>
    </div>
  )
}
