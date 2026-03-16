import { useState, useEffect, useRef, useCallback } from 'react'
import { format, addDays, subDays } from 'date-fns'

import { ArrowLeft01Icon, ArrowRight01Icon, CheckmarkCircle02Icon, Download01Icon, Tick01Icon } from 'hugeicons-react'
import { useEntries, useGenerateEntries, useUpdateEntry, useUpdateEntryStatus } from '@/hooks/useEntries'
import { useCaptures, useReassignCapture } from '@/hooks/useCaptures'
import { useMatters } from '@/hooks/useMatters'
import { useClients } from '@/hooks/useClients'
import { matterColor } from '@/lib/colors'
import { MatterSelect } from '@/components/MatterSelect'
import type { TimeEntry, Capture, Matter, Client } from '@/types'


function formatHours(minutes: number): string {
  return (minutes / 60).toFixed(1)
}

// --- Inline editable description ---
function EditableDescription({
  value,
  onSave,
}: {
  value: string
  onSave: (v: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  if (!editing) {
    return (
      <button
        type="button"
        aria-label="Edit description"
        onClick={() => {
          setDraft(value)
          setEditing(true)
        }}
        className="text-left w-full"
      >
        {value ? (
          <span className="text-sm text-pretty" style={{ color: 'var(--near-black)' }}>{value}</span>
        ) : (
          <span className="text-sm italic text-gray-400 text-pretty">Add description…</span>
        )}
      </button>
    )
  }

  return (
    <textarea
      ref={inputRef}
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={() => {
        setEditing(false)
        if (draft !== value) onSave(draft)
      }}
      onKeyDown={e => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault()
          inputRef.current?.blur()
        }
        if (e.key === 'Escape') {
          setDraft(value)
          setEditing(false)
        }
      }}
      rows={2}
      aria-label="Entry description"
      className="w-full text-sm rounded-md px-2 py-1 outline-none resize-none"
      style={{
        border: '1px solid var(--neutral)',
        color: 'var(--near-black)',
      }}
    />
  )
}

// --- Client card ---
interface MatterGroup {
  matter: Matter
  entries: TimeEntry[]
  totalMinutes: number
  displayDescription: string
  allApproved: boolean
}

interface ClientGroup {
  client: Client
  matters: MatterGroup[]
  totalMinutes: number
}

function ClientCard({
  group,
  onApprove,
  onUpdateDescription,
  captureConfidence,
}: {
  group: ClientGroup
  onApprove: (id: number) => void
  onUpdateDescription: (id: number, desc: string) => void
  captureConfidence: Map<number, number>
}) {
  const allApproved = group.matters.every(m => m.allApproved)

  return (
    <div
      className="rounded-xl bg-white overflow-hidden"
      style={{
        border: '1px solid var(--neutral)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
      }}
    >
      {/* Client header */}
      <div className="flex items-center justify-between px-5 py-3 bg-gray-50/60">
        <div className="flex items-center gap-2">
          <span className="font-semibold" style={{ color: 'var(--navy)' }}>{group.client.name}</span>
          {allApproved && (
            <CheckmarkCircle02Icon size={18} style={{ color: 'var(--success)' }} aria-hidden="true" />
          )}
        </div>
        <span className="text-sm font-medium text-gray-500 tabular-nums">
          {formatHours(group.totalMinutes)}h
        </span>
      </div>

      {/* Matters + entries */}
      <div className="divide-y divide-gray-50">
        {group.matters.map(({ matter, entries, totalMinutes, displayDescription, allApproved: matterApproved }) => {
          const confidence = captureConfidence.get(matter.id)

          return (
            <div key={matter.id} className="px-5 py-3">
              <div className="flex items-center gap-3 py-2">
                {/* Color dot */}
                <div
                  className="size-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: matterColor(matter.id) }}
                />
                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium" style={{ color: 'var(--near-black)' }}>
                      {matter.name}{' '}
                      <span className="text-gray-400 font-normal">({matter.matter_number})</span>
                      {/* AI confidence badge */}
                      {confidence != null && confidence > 0 && (
                        <span
                          className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold"
                          style={{ backgroundColor: 'var(--gold)', color: 'var(--near-black)' }}
                        >
                          {Math.round(confidence * 100)}%
                        </span>
                      )}
                    </span>
                    <span className="text-sm tabular-nums text-gray-500 shrink-0">
                      {formatHours(totalMinutes)}h
                    </span>
                  </div>
                  <div className="mt-0.5 border-l-2 border-gray-100 pl-3">
                    <EditableDescription
                      value={displayDescription}
                      onSave={v => onUpdateDescription(entries[0].id, v)}
                    />
                  </div>
                </div>
                {/* Approve toggle */}
                <button
                  type="button"
                  aria-label={matterApproved ? 'Unapprove' : 'Approve entry'}
                  onClick={() => {
                    entries.forEach(e => {
                      if (matterApproved) {
                        onApprove(e.id)
                      } else if (e.status !== 'APPROVED') {
                        onApprove(e.id)
                      }
                    })
                  }}
                  className={`px-3 py-1 rounded-md text-xs font-medium shrink-0 transition-[background-color,color,border-color] focus-visible:ring-2 focus-visible:ring-[var(--gold)] focus-visible:outline-none ${
                    matterApproved
                      ? 'text-white'
                      : 'hover:text-white'
                  }`}
                  style={
                    matterApproved
                      ? { backgroundColor: 'var(--success)' }
                      : { border: '1px solid var(--navy)', color: 'var(--navy)' }
                  }
                  onMouseEnter={e => {
                    if (!matterApproved) {
                      (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--navy)';
                      (e.currentTarget as HTMLElement).style.color = 'white';
                    }
                  }}
                  onMouseLeave={e => {
                    if (!matterApproved) {
                      (e.currentTarget as HTMLElement).style.backgroundColor = '';
                      (e.currentTarget as HTMLElement).style.color = 'var(--navy)';
                    }
                  }}
                >
                  {matterApproved ? '✓ Approved' : 'Approve'}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// --- Uncategorized captures ---
function UncategorizedCard({
  captures,
  matters,
  onAssign,
}: {
  captures: Capture[]
  matters: Matter[]
  onAssign: (captureId: number, matterId: number) => void
}) {
  if (captures.length === 0) return null

  const totalMinutes = captures.length

  return (
    <div className="rounded-xl bg-amber-50 overflow-hidden border border-amber-300">
      <div className="flex items-center justify-between px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="text-amber-600" aria-hidden="true">⚠</span>
          <span className="font-semibold text-amber-800">Uncategorized</span>
        </div>
        <span className="text-sm font-medium text-amber-600 tabular-nums">
          {formatHours(totalMinutes)}h
        </span>
      </div>
      <div className="px-5 pb-4 space-y-2">
        {Object.entries(
          captures.reduce<Record<string, { title: string; count: number; ids: number[] }>>(
            (acc, c) => {
              const key = c.app_name
              if (!acc[key]) acc[key] = { title: c.window_title, count: 0, ids: [] }
              acc[key].count++
              acc[key].ids.push(c.id)
              return acc
            },
            {},
          ),
        ).map(([app, { title, count, ids: _ids }]) => (
          <div key={app} className="flex items-center justify-between gap-3 text-sm">
            <div className="flex-1 min-w-0">
              <span className="font-medium" style={{ color: 'var(--near-black)' }}>{app}</span>
              <span className="text-gray-400 ml-1 truncate">— {title}</span>
            </div>
            <span className="tabular-nums text-gray-500 shrink-0">
              {formatHours(count)}h
            </span>
          </div>
        ))}
        <div className="pt-2">
          <MatterSelect
            matters={matters}
            onChange={matterId => {
              captures.forEach(c => onAssign(c.id, matterId))
            }}
          />
        </div>
      </div>
    </div>
  )
}

// --- Main Dashboard ---
export default function DashboardPage() {
  const [date, setDate] = useState(() => new Date())
  const dateStr = format(date, 'yyyy-MM-dd')

  // Data
  const { data: entries = [], isLoading: entriesLoading } = useEntries({ date: dateStr })
  const { data: captures = [], isLoading: capturesLoading } = useCaptures({ date: dateStr })
  const { data: matters = [] } = useMatters()
  const { data: clients = [] } = useClients()

  // Mutations
  const generateEntries = useGenerateEntries()
  const updateEntry = useUpdateEntry()
  const updateStatus = useUpdateEntryStatus()
  const reassignCapture = useReassignCapture()

  // Auto-generate on load if captures exist but no entries
  const hasAutoGenerated = useRef(false)
  useEffect(() => {
    if (
      !entriesLoading &&
      !capturesLoading &&
      captures.length > 0 &&
      entries.length === 0 &&
      !hasAutoGenerated.current &&
      !generateEntries.isPending
    ) {
      hasAutoGenerated.current = true
      generateEntries.mutate({ user_id: 1, date: dateStr })
    }
  }, [entriesLoading, capturesLoading, captures.length, entries.length, dateStr, generateEntries])

  // Reset auto-generate flag when date changes
  useEffect(() => {
    hasAutoGenerated.current = false
  }, [dateStr])

  // Build capture confidence map: matter_id → avg ai_confidence
  const captureConfidence = new Map<number, number>()
  for (const c of captures) {
    if (c.matter_id && c.ai_confidence != null && c.ai_confidence > 0) {
      const existing = captureConfidence.get(c.matter_id)
      if (existing == null || c.ai_confidence > existing) {
        captureConfidence.set(c.matter_id, c.ai_confidence)
      }
    }
  }

  // Build client groups
  const clientGroups: ClientGroup[] = buildClientGroups(entries, matters, clients)

  // Uncategorized captures (no matter_id)
  const uncategorized = captures.filter(c => !c.matter_id)

  // Total hours
  const totalMinutes = entries.reduce((s, e) => s + e.duration_minutes, 0)
  const totalHours = totalMinutes / 60

  const handleToggleApprove = useCallback(
    (id: number) => {
      const entry = entries.find(e => e.id === id)
      if (!entry) return
      if (entry.status === 'APPROVED') {
        updateStatus.mutate({ id, status: 'DRAFT' })
      } else if (entry.status === 'DRAFT') {
        updateStatus.mutate({ id, status: 'REVIEWED' }, {
          onSuccess: () => updateStatus.mutate({ id, status: 'APPROVED' }),
        })
      } else {
        updateStatus.mutate({ id, status: 'APPROVED' })
      }
    },
    [updateStatus, entries],
  )

  const handleUpdateDescription = useCallback(
    (id: number, description: string) => updateEntry.mutate({ id, description }),
    [updateEntry],
  )

  const handleApproveAll = () => {
    const pending = entries.filter(e => e.status !== 'APPROVED')
    if (pending.length === 0) return
    if (!window.confirm(`Approve ${pending.length} entries?`)) return
    pending.forEach(e => handleToggleApprove(e.id))
  }

  const handleExportCSV = async () => {
    const params = new URLSearchParams({ from: dateStr, to: dateStr, status: 'APPROVED' })
    const res = await fetch(`/api/entries/export?${params}`, {
      credentials: 'include',
      headers: { 'X-API-Key': 'olivera2026' },
    })
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `hours-${dateStr}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const isLoading = entriesLoading || capturesLoading

  return (
    <div className="min-h-full" style={{ backgroundColor: 'var(--warm-white)' }}>
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Previous day"
              onClick={() => setDate(d => subDays(d, 1))}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-[background-color,color] focus-visible:ring-2 focus-visible:ring-[var(--gold)] focus-visible:outline-none"
            >
              <ArrowLeft01Icon size={20} />
            </button>
            <h1 className="text-lg font-semibold text-balance" style={{ color: 'var(--navy)' }}>
              {(() => {
                const formatted = format(date, 'EEEE, MMMM d')
                return formatted.charAt(0).toUpperCase() + formatted.slice(1)
              })()}
            </h1>
            <button
              type="button"
              aria-label="Next day"
              onClick={() => setDate(d => addDays(d, 1))}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-[background-color,color] focus-visible:ring-2 focus-visible:ring-[var(--gold)] focus-visible:outline-none"
            >
              <ArrowRight01Icon size={20} />
            </button>
          </div>
          <span className="text-sm text-gray-500">Laura C</span>
        </div>

        {/* Summary bar */}
        <div className="space-y-2">
          <span className="text-2xl font-bold tabular-nums" style={{ color: 'var(--navy)' }}>
            Today: {totalHours.toFixed(1)} hours
          </span>
        </div>

        {/* Loading state */}
        {isLoading && (
          <div className="text-center py-12 text-gray-400 text-sm">Loading…</div>
        )}

        {/* Generating state */}
        {generateEntries.isPending && (
          <div className="text-center py-8 text-gray-400 text-sm">
            Generating entries…
          </div>
        )}

        {/* Client groups */}
        {!isLoading && clientGroups.map(group => (
          <ClientCard
            key={group.client.id}
            group={group}
            onApprove={handleToggleApprove}
            onUpdateDescription={handleUpdateDescription}
            captureConfidence={captureConfidence}
          />
        ))}

        {/* Uncategorized */}
        {!isLoading && (
          <UncategorizedCard
            captures={uncategorized}
            matters={matters}
            onAssign={(captureId, matterId) =>
              reassignCapture.mutate({ id: captureId, matter_id: matterId })
            }
          />
        )}

        {/* Empty state */}
        {!isLoading && !generateEntries.isPending && entries.length === 0 && uncategorized.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <p className="text-lg text-balance">No activity recorded</p>
            <p className="text-sm mt-1 text-pretty">Captures will appear here automatically</p>
          </div>
        )}

        {/* Bottom actions */}
        {!isLoading && entries.length > 0 && (
          <div className="flex items-center justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={handleApproveAll}
              disabled={entries.every(e => e.status === 'APPROVED')}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white transition-[background-color] disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-[var(--gold)] focus-visible:outline-none"
              style={{ backgroundColor: 'var(--navy)' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--navy-light)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--navy)' }}
            >
              <Tick01Icon size={16} aria-hidden="true" />
              Approve All
            </button>
            <button
              type="button"
              onClick={handleExportCSV}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-[background-color,color,border-color] focus-visible:ring-2 focus-visible:ring-[var(--gold)] focus-visible:outline-none"
              style={{ border: '1px solid var(--navy)', color: 'var(--navy)' }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--navy)';
                (e.currentTarget as HTMLElement).style.color = 'white';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.backgroundColor = '';
                (e.currentTarget as HTMLElement).style.color = 'var(--navy)';
              }}
            >
              <Download01Icon size={16} aria-hidden="true" />
              Export CSV
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// --- Helpers ---
function buildClientGroups(
  entries: TimeEntry[],
  matters: Matter[],
  clients: Client[],
): ClientGroup[] {
  const matterMap = new Map(matters.map(m => [m.id, m]))
  const clientMap = new Map(clients.map(c => [c.id, c]))

  const byClient = new Map<number, Map<number, TimeEntry[]>>()

  for (const entry of entries) {
    const matter = matterMap.get(entry.matter_id)
    if (!matter) continue
    const clientId = matter.client_id

    if (!byClient.has(clientId)) byClient.set(clientId, new Map())
    const matterEntries = byClient.get(clientId)!
    if (!matterEntries.has(matter.id)) matterEntries.set(matter.id, [])
    matterEntries.get(matter.id)!.push(entry)
  }

  const groups: ClientGroup[] = []
  for (const [clientId, matterEntries] of byClient) {
    const client = clientMap.get(clientId) ?? {
      id: clientId,
      name: entries.find(e => e.client_name && matterMap.get(e.matter_id)?.client_id === clientId)?.client_name ?? `Client ${clientId}`,
      code: '',
      is_active: true,
      created_at: '',
    }

    const mattersList = Array.from(matterEntries.entries())
      .map(([matterId, es]) => {
        const totalMins = es.reduce((s, e) => s + e.duration_minutes, 0)
        return {
          matter: matterMap.get(matterId) ?? {
            id: matterId,
            client_id: clientId,
            name: es[0]?.matter_name ?? `Matter ${matterId}`,
            matter_number: es[0]?.matter_number ?? '',
            is_active: true,
            created_at: '',
          },
          entries: es,
          totalMinutes: totalMins,
          displayDescription: es.map(e => e.description).filter(Boolean).join('; '),
          allApproved: es.every(e => e.status === 'APPROVED'),
        }
      })
      .filter(m => m.totalMinutes > 0)

    const totalMinutes = mattersList.reduce((sum, m) => sum + m.totalMinutes, 0)

    groups.push({ client, matters: mattersList, totalMinutes })
  }

  groups.sort((a, b) => b.totalMinutes - a.totalMinutes)
  return groups
}
