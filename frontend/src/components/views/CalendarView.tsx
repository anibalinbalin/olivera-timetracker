import { format } from 'date-fns'
import type { Capture, Matter } from '@/types'
import { matterColor } from '@/lib/colors'

interface Props {
  captures: Capture[]
  matters: Matter[]
}

const START_HOUR = 6   // 6am
const END_HOUR = 22    // 10pm
const TOTAL_HOURS = END_HOUR - START_HOUR // 16
const PX_PER_HOUR = 60
const TOTAL_HEIGHT = TOTAL_HOURS * PX_PER_HOUR

function toMinutesFromStart(timestamp: string): number {
  const d = new Date(timestamp)
  const h = d.getHours()
  const m = d.getMinutes()
  return (h - START_HOUR) * 60 + m
}

export function CalendarView({ captures, matters }: Props) {
  // Only show captures within the 6am-10pm window
  const visible = captures.filter(c => {
    const h = new Date(c.timestamp).getHours()
    return h >= START_HOUR && h < END_HOUR
  })

  const hours = Array.from({ length: TOTAL_HOURS + 1 }, (_, i) => START_HOUR + i)

  return (
    <div className="relative flex overflow-y-auto" style={{ height: `${TOTAL_HEIGHT + 32}px` }}>
      {/* Hour labels */}
      <div className="shrink-0 w-14 relative" style={{ height: `${TOTAL_HEIGHT}px` }}>
        {hours.map(h => (
          <div
            key={h}
            className="absolute right-2 text-xs text-gray-400 -translate-y-2"
            style={{ top: `${(h - START_HOUR) * PX_PER_HOUR}px` }}
          >
            {h === 12 ? '12pm' : h > 12 ? `${h - 12}pm` : `${h}am`}
          </div>
        ))}
      </div>

      {/* Grid + blocks */}
      <div className="flex-1 relative border-l border-gray-200" style={{ height: `${TOTAL_HEIGHT}px` }}>
        {/* Hour gridlines */}
        {hours.map(h => (
          <div
            key={h}
            className="absolute left-0 right-0 border-t border-gray-100"
            style={{ top: `${(h - START_HOUR) * PX_PER_HOUR}px` }}
          />
        ))}

        {/* Capture blocks */}
        {visible.map(c => {
          const minFromStart = toMinutesFromStart(c.timestamp)
          const top = (minFromStart / 60) * PX_PER_HOUR
          const height = Math.max(8, (30 / 60) * PX_PER_HOUR) // 30s interval, at least 8px
          const matter = c.matter_id ? matters.find(m => m.id === c.matter_id) : undefined
          const color = matter ? matterColor(matter.id) : '#94A3B8'

          return (
            <div
              key={c.id}
              className="absolute left-1 right-1 rounded-sm px-1.5 overflow-hidden cursor-default"
              style={{ top: `${top}px`, height: `${height}px`, backgroundColor: color, opacity: 0.85 }}
              title={`${format(new Date(c.timestamp), 'HH:mm')} — ${c.app_name}: ${c.window_title}`}
            >
              <p className="text-white text-xs truncate leading-tight pt-0.5">{c.app_name}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
