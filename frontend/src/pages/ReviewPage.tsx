import { useState, useRef, useEffect } from 'react'
import { CheckmarkCircle02Icon, Clock01Icon, Edit01Icon } from 'hugeicons-react'
import { Button } from '@/components/ui/button'
import { useEntries, useUpdateEntry, useUpdateEntryStatus } from '@/hooks/useEntries'
import type { TimeEntry } from '@/types'

type StatusTab = 'DRAFT' | 'REVIEWED' | 'APPROVED'

const STATUS_LABELS: Record<StatusTab, string> = {
  DRAFT: 'Draft',
  REVIEWED: 'Reviewed',
  APPROVED: 'Approved',
}

const STATUS_BADGE: Record<TimeEntry['status'], string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  REVIEWED: 'bg-yellow-100 text-yellow-700',
  APPROVED: 'bg-green-100 text-green-700',
}

function formatDuration(minutes: number): string {
  return `${(minutes / 60).toFixed(1)}h`
}

// ── Inline description editor ─────────────────────────────────────────────────
function DescriptionCell({
  entry,
  onSave,
  isPending,
}: {
  entry: TimeEntry
  onSave: (value: string) => void
  isPending: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(entry.description ?? '')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (editing) textareaRef.current?.focus()
  }, [editing])

  function handleStart() {
    setValue(entry.description ?? '')
    setEditing(true)
  }

  function handleSave() {
    onSave(value.trim())
    setEditing(false)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSave()
    }
    if (e.key === 'Escape') {
      setValue(entry.description ?? '')
      setEditing(false)
    }
  }

  if (editing) {
    return (
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        disabled={isPending}
        rows={2}
        className="w-full rounded-md border border-blue-300 bg-white px-2 py-1 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 resize-none"
      />
    )
  }

  return (
    <button
      onClick={handleStart}
      className="group flex items-start gap-1 text-left w-full"
      title="Click to edit description"
    >
      <span className="text-sm text-gray-700 leading-snug flex-1">
        {entry.description ?? <span className="text-gray-400 italic">No description</span>}
      </span>
      <Edit01Icon
        size={12}
        className="shrink-0 mt-0.5 text-gray-300 group-hover:text-gray-500 transition-colors"
      />
    </button>
  )
}

// ── Entry card ────────────────────────────────────────────────────────────────
function EntryCard({ entry }: { entry: TimeEntry }) {
  const updateEntry = useUpdateEntry()
  const updateStatus = useUpdateEntryStatus()

  function handleDescriptionSave(description: string) {
    updateEntry.mutate({ id: entry.id, description })
  }

  function handleReview() {
    updateStatus.mutate({ id: entry.id, status: 'REVIEWED' })
  }

  function handleApprove() {
    updateStatus.mutate({ id: entry.id, status: 'APPROVED' })
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm p-4 flex flex-col gap-3">
      {/* Top row: matter info + status badge */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 text-sm leading-tight">
            {entry.matter_name ?? `Matter #${entry.matter_id}`}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {entry.matter_number && (
              <span className="font-mono mr-2">{entry.matter_number}</span>
            )}
            {entry.client_name && (
              <span>{entry.client_name}</span>
            )}
          </p>
        </div>
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium shrink-0 ${STATUS_BADGE[entry.status]}`}
        >
          {entry.status}
        </span>
      </div>

      {/* Date + duration */}
      <div className="flex items-center gap-4 text-xs text-gray-500">
        <span>{entry.date}</span>
        <span className="flex items-center gap-1">
          <Clock01Icon size={12} />
          {formatDuration(entry.duration_minutes)}
        </span>
      </div>

      {/* Inline description editing */}
      <DescriptionCell
        entry={entry}
        onSave={handleDescriptionSave}
        isPending={updateEntry.isPending}
      />

      {/* Action buttons */}
      <div className="flex items-center gap-2 pt-1">
        {entry.status === 'DRAFT' && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleReview}
            disabled={updateStatus.isPending}
          >
            <CheckmarkCircle02Icon size={14} />
            Review
          </Button>
        )}
        {entry.status === 'REVIEWED' && (
          <Button
            size="sm"
            onClick={handleApprove}
            disabled={updateStatus.isPending}
          >
            <CheckmarkCircle02Icon size={14} />
            Approve
          </Button>
        )}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ReviewPage() {
  const today = new Date().toISOString().split('T')[0]
  const firstOfMonth = today.slice(0, 8) + '01'

  const [activeTab, setActiveTab] = useState<StatusTab>('DRAFT')
  const [from, setFrom] = useState(firstOfMonth)
  const [to, setTo] = useState(today)

  const { data: entries, isLoading } = useEntries({ status: activeTab })

  const filtered: TimeEntry[] = (entries ?? []).filter((e) => {
    if (from && e.date < from) return false
    if (to && e.date > to) return false
    return true
  })

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Review</h1>

      {/* Status tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {(Object.keys(STATUS_LABELS) as StatusTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === tab
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {STATUS_LABELS[tab]}
          </button>
        ))}
      </div>

      {/* Date filters */}
      <div className="flex flex-wrap gap-4 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-muted-foreground">From</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="border rounded-md px-3 py-2 text-sm bg-background"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-muted-foreground">To</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="border rounded-md px-3 py-2 text-sm bg-background"
          />
        </div>
      </div>

      {/* Entry list */}
      {isLoading ? (
        <div className="text-sm text-gray-500 py-8 text-center">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-lg font-medium">No entries with status {activeTab}</p>
          <p className="text-sm mt-1">
            {activeTab === 'DRAFT'
              ? 'All caught up — no drafts in this date range.'
              : `No ${STATUS_LABELS[activeTab].toLowerCase()} entries in this date range.`}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((entry) => (
            <EntryCard key={entry.id} entry={entry} />
          ))}
        </div>
      )}

      {!isLoading && filtered.length > 0 && (
        <p className="text-sm text-muted-foreground">
          {filtered.length} {filtered.length === 1 ? 'entry' : 'entries'} —{' '}
          {(filtered.reduce((s, e) => s + e.duration_minutes, 0) / 60).toFixed(1)}h total
        </p>
      )}
    </div>
  )
}
