import { useState } from 'react'
import { format, addDays, subDays } from 'date-fns'
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  ViewIcon,
  GridViewIcon,
  Calendar01Icon,
  LayoutTable01Icon,
  SparklesIcon,
  Add01Icon,
} from 'hugeicons-react'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/StatusBadge'
import { MatterSelect } from '@/components/MatterSelect'
import { TimelineView } from '@/components/views/TimelineView'
import { MatterGroupedView } from '@/components/views/MatterGroupedView'
import { CalendarView } from '@/components/views/CalendarView'
import { ComboView } from '@/components/views/ComboView'
import { useCaptures, useReassignCapture } from '@/hooks/useCaptures'
import { useEntries, useGenerateEntries, useCreateEntry } from '@/hooks/useEntries'
import { useMatters } from '@/hooks/useMatters'

// Hardcoded user ID 1 — auth will be added later
const USER_ID = 1

type ViewMode = 'timeline' | 'grouped' | 'calendar' | 'combo'

const VIEW_TABS: { id: ViewMode; label: string; Icon: React.ElementType }[] = [
  { id: 'timeline', label: 'Timeline', Icon: ViewIcon },
  { id: 'grouped', label: 'Grouped', Icon: GridViewIcon },
  { id: 'calendar', label: 'Calendar', Icon: Calendar01Icon },
  { id: 'combo', label: 'Combo', Icon: LayoutTable01Icon },
]

export default function TodayPage() {
  const [date, setDate] = useState<Date>(new Date())
  const [view, setView] = useState<ViewMode>('timeline')
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [createMatterId, setCreateMatterId] = useState<number | undefined>()
  const [showCreateForm, setShowCreateForm] = useState(false)

  const dateStr = format(date, 'yyyy-MM-dd')

  const { data: captures = [], isLoading: capturesLoading } = useCaptures({ date: dateStr, user_id: USER_ID })
  const { data: entries = [], isLoading: entriesLoading } = useEntries({ date: dateStr, user_id: USER_ID })
  const { data: matters = [] } = useMatters()
  const reassign = useReassignCapture()
  const generateEntries = useGenerateEntries()
  const createEntry = useCreateEntry()

  const activeMatters = matters.filter(m => m.is_active)

  function handlePrevDay() { setDate(d => subDays(d, 1)); setSelectedIds(new Set()) }
  function handleNextDay() { setDate(d => addDays(d, 1)); setSelectedIds(new Set()) }

  function handleReassign(captureId: number, matterId: number) {
    reassign.mutate({ id: captureId, matter_id: matterId })
  }

  function handleToggleSelect(captureId: number) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(captureId)) next.delete(captureId)
      else next.add(captureId)
      return next
    })
  }

  function handleGenerateEntries() {
    generateEntries.mutate({ user_id: USER_ID, date: dateStr })
  }

  function handleCreateEntry() {
    if (!createMatterId || selectedIds.size === 0) return
    createEntry.mutate(
      {
        user_id: USER_ID,
        matter_id: createMatterId,
        date: dateStr,
        duration_minutes: selectedIds.size, // placeholder: 1 min per capture
        capture_ids: Array.from(selectedIds),
      },
      {
        onSuccess: () => {
          setSelectedIds(new Set())
          setShowCreateForm(false)
          setCreateMatterId(undefined)
        },
      }
    )
  }

  const isToday = format(new Date(), 'yyyy-MM-dd') === dateStr

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white shrink-0">
        <div className="flex items-center gap-3">
          <Button size="icon-sm" variant="ghost" onClick={handlePrevDay} title="Previous day">
            <ArrowLeft01Icon size={16} />
          </Button>
          <div className="text-center">
            <p className="text-sm font-semibold text-gray-900">{format(date, 'EEEE, MMMM d')}</p>
            {isToday && <p className="text-xs text-blue-500 font-medium">Today</p>}
          </div>
          <Button size="icon-sm" variant="ghost" onClick={handleNextDay} title="Next day">
            <ArrowRight01Icon size={16} />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleGenerateEntries}
            disabled={generateEntries.isPending}
          >
            <SparklesIcon size={14} />
            {generateEntries.isPending ? 'Generating…' : 'Generate Entries'}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-6 py-4 flex flex-col gap-6">
        {/* View selector + multi-select toolbar */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          {/* View tabs */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            {VIEW_TABS.map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => setView(id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  view === id
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Icon size={15} />
                {label}
              </button>
            ))}
          </div>

          {/* Multi-select toolbar */}
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">{selectedIds.size} selected</span>
              {!showCreateForm ? (
                <Button size="sm" onClick={() => setShowCreateForm(true)}>
                  <Add01Icon size={14} />
                  Create Entry from Selected
                </Button>
              ) : (
                <div className="flex items-center gap-2">
                  <MatterSelect
                    matters={activeMatters}
                    value={createMatterId}
                    onChange={setCreateMatterId}
                  />
                  <Button size="sm" onClick={handleCreateEntry} disabled={!createMatterId || createEntry.isPending}>
                    {createEntry.isPending ? 'Creating…' : 'Create'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setShowCreateForm(false); setCreateMatterId(undefined) }}>
                    Cancel
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Captures */}
        {capturesLoading ? (
          <p className="text-sm text-gray-400 py-8 text-center">Loading captures…</p>
        ) : (
          <>
            {view === 'timeline' && (
              <TimelineView
                captures={captures}
                matters={activeMatters}
                onReassign={handleReassign}
                selectedIds={selectedIds}
                onToggleSelect={handleToggleSelect}
              />
            )}
            {view === 'grouped' && (
              <MatterGroupedView
                captures={captures}
                matters={activeMatters}
                onReassign={handleReassign}
                selectedIds={selectedIds}
                onToggleSelect={handleToggleSelect}
              />
            )}
            {view === 'calendar' && (
              <CalendarView captures={captures} matters={activeMatters} />
            )}
            {view === 'combo' && (
              <ComboView
                captures={captures}
                matters={activeMatters}
                onReassign={handleReassign}
                selectedIds={selectedIds}
                onToggleSelect={handleToggleSelect}
              />
            )}
          </>
        )}

        {/* Entries section */}
        <div>
          <h2 className="text-sm font-semibold text-gray-700 mb-2">Time Entries</h2>
          {entriesLoading ? (
            <p className="text-sm text-gray-400">Loading entries…</p>
          ) : entries.length === 0 ? (
            <p className="text-sm text-gray-400">No entries for this day. Generate or create manually.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {entries.map(entry => (
                <div
                  key={entry.id}
                  className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm"
                >
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-gray-800">{entry.matter_name ?? `Matter ${entry.matter_id}`}</span>
                    {entry.client_name && (
                      <span className="ml-2 text-xs text-gray-400">{entry.client_name}</span>
                    )}
                    {entry.description && (
                      <p className="text-xs text-gray-500 truncate mt-0.5">{entry.description}</p>
                    )}
                  </div>
                  <span className="text-xs text-gray-500 shrink-0">
                    {entry.duration_minutes} min
                  </span>
                  <StatusBadge status={entry.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
