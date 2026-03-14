import { useState, useEffect, useRef, useCallback } from 'react'
import { format, addDays, subDays } from 'date-fns'
import { es } from 'date-fns/locale'
import { ArrowLeft01Icon, ArrowRight01Icon, CheckmarkCircle02Icon, Download01Icon, Tick01Icon } from 'hugeicons-react'
import { useEntries, useGenerateEntries, useUpdateEntry, useUpdateEntryStatus } from '@/hooks/useEntries'
import { useCaptures, useReassignCapture } from '@/hooks/useCaptures'
import { useMatters } from '@/hooks/useMatters'
import { useClients } from '@/hooks/useClients'
import { matterColor } from '@/lib/colors'
import { MatterSelect } from '@/components/MatterSelect'
import { Button } from '@/components/ui/button'
import type { TimeEntry, Capture, Matter, Client } from '@/types'

const GOAL_HOURS = 8

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
        aria-label="Editar descripción"
        onClick={() => {
          setDraft(value)
          setEditing(true)
        }}
        className="text-left w-full"
      >
        {value ? (
          <span className="text-sm text-gray-600">{value}</span>
        ) : (
          <span className="text-sm italic text-gray-400">Agregar descripción…</span>
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
      aria-label="Descripción de la entrada"
      className="w-full text-sm border border-gray-200 rounded-md px-2 py-1 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200 resize-none"
    />
  )
}

// --- Client card ---
interface MatterGroup {
  matter: Matter
  entries: TimeEntry[]  // original entries (for approve-all)
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
}: {
  group: ClientGroup
  onApprove: (id: number) => void
  onUpdateDescription: (id: number, desc: string) => void
}) {
  const allApproved = group.matters.every(m => m.allApproved)

  return (
    <div className="rounded-xl bg-white shadow-sm border border-gray-100 overflow-hidden">
      {/* Client header */}
      <div className="flex items-center justify-between px-5 py-3 bg-gray-50/60">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-gray-900">{group.client.name}</span>
          {allApproved && (
            <CheckmarkCircle02Icon size={18} className="text-green-500" aria-hidden="true" />
          )}
        </div>
        <span className="text-sm font-medium text-gray-500 tabular-nums">
          {formatHours(group.totalMinutes)}h
        </span>
      </div>

      {/* Matters + entries */}
      <div className="divide-y divide-gray-50">
        {group.matters.map(({ matter, entries, totalMinutes, displayDescription, allApproved: matterApproved }) => (
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
                  <span className="text-sm font-medium text-gray-800">
                    {matter.name}{' '}
                    <span className="text-gray-400 font-normal">({matter.matter_number})</span>
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
              {/* Approve checkbox — approves ALL entries for this matter */}
              <button
                type="button"
                aria-label={matterApproved ? 'Aprobado' : 'Aprobar entrada'}
                onClick={() => {
                  if (!matterApproved) {
                    entries.forEach(e => {
                      if (e.status !== 'APPROVED') onApprove(e.id)
                    })
                  }
                }}
                className={`size-5 rounded border-2 flex items-center justify-center shrink-0 transition-[color,background-color,border-color] focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:outline-none ${
                  matterApproved
                    ? 'bg-green-500 border-green-500 text-white'
                    : 'border-gray-300 hover:border-green-400'
                }`}
              >
                {matterApproved && <Tick01Icon size={14} aria-hidden="true" />}
              </button>
            </div>
          </div>
        ))}
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

  const totalMinutes = captures.length // each capture ≈ 1 min (interval)

  return (
    <div className="rounded-xl bg-amber-50/50 shadow-sm border border-amber-200/60 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="text-amber-600" aria-hidden="true">⚠</span>
          <span className="font-semibold text-amber-800">Sin categorizar</span>
        </div>
        <span className="text-sm font-medium text-amber-600 tabular-nums">
          {formatHours(totalMinutes)}h
        </span>
      </div>
      <div className="px-5 pb-4 space-y-2">
        {/* Group by app */}
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
              <span className="text-gray-700 font-medium">{app}</span>
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

  // Build client groups
  const clientGroups: ClientGroup[] = buildClientGroups(entries, matters, clients)

  // Uncategorized captures (no matter_id)
  const uncategorized = captures.filter(c => !c.matter_id)

  // Total hours
  const totalMinutes = entries.reduce((s, e) => s + e.duration_minutes, 0)
  const totalHours = totalMinutes / 60
  const progressPct = Math.min((totalHours / GOAL_HOURS) * 100, 100)

  const handleToggleApprove = useCallback(
    (id: number) => {
      const entry = entries.find(e => e.id === id)
      if (!entry) return
      if (entry.status === 'APPROVED') {
        // Undo: APPROVED → DRAFT
        updateStatus.mutate({ id, status: 'DRAFT' })
      } else if (entry.status === 'DRAFT') {
        // Two-step: DRAFT → REVIEWED → APPROVED
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
    if (!window.confirm(`¿Aprobar ${pending.length} entradas?`)) return
    pending.forEach(e => handleToggleApprove(e.id))
  }

  const handleExportCSV = async () => {
    const params = new URLSearchParams({ from: dateStr, to: dateStr, status: 'APPROVED' })
    const res = await fetch(`/api/entries/export?${params}`, {
      credentials: 'include',
      headers: { 'X-API-Key': 'test' },
    })
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `horas-${dateStr}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const isLoading = entriesLoading || capturesLoading

  return (
    <div className="min-h-screen bg-gray-50/50">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Día anterior"
              onClick={() => setDate(d => subDays(d, 1))}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:outline-none"
            >
              <ArrowLeft01Icon size={20} />
            </button>
            <h1 className="text-lg font-semibold text-gray-900">
              {(() => {
                const formatted = format(date, "EEEE, d 'de' MMMM", { locale: es })
                return formatted.charAt(0).toUpperCase() + formatted.slice(1)
              })()}
            </h1>
            <button
              type="button"
              aria-label="Día siguiente"
              onClick={() => setDate(d => addDays(d, 1))}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:outline-none"
            >
              <ArrowRight01Icon size={20} />
            </button>
          </div>
          <span className="text-sm text-gray-500">Laura C</span>
        </div>

        {/* Summary bar */}
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold text-gray-900">
              Hoy: {totalHours.toFixed(1)} horas
            </span>
            <span className="text-sm text-gray-400">{GOAL_HOURS}h meta</span>
          </div>
          <div className="h-3 rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-blue-500 transition-[width] duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Loading state */}
        {isLoading && (
          <div className="text-center py-12 text-gray-400 text-sm">Cargando…</div>
        )}

        {/* Generating state */}
        {generateEntries.isPending && (
          <div className="text-center py-8 text-gray-400 text-sm">
            Generando entradas…
          </div>
        )}

        {/* Client groups */}
        {!isLoading && clientGroups.map(group => (
          <ClientCard
            key={group.client.id}
            group={group}
            onApprove={handleToggleApprove}
            onUpdateDescription={handleUpdateDescription}
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
            <p className="text-lg">Sin actividad registrada</p>
            <p className="text-sm mt-1">Las capturas aparecerán aquí automáticamente</p>
          </div>
        )}

        {/* Bottom actions */}
        {!isLoading && entries.length > 0 && (
          <div className="flex items-center justify-between gap-3 pt-2">
            <Button
              onClick={handleApproveAll}
              disabled={entries.every(e => e.status === 'APPROVED')}
              className="gap-2"
            >
              <Tick01Icon size={16} />
              Aprobar todo
            </Button>
            <Button variant="outline" onClick={handleExportCSV} className="gap-2">
              <Download01Icon size={16} />
              Exportar CSV
            </Button>
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

  // Group entries by client_id
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
      name: entries.find(e => e.client_name && matterMap.get(e.matter_id)?.client_id === clientId)?.client_name ?? `Cliente ${clientId}`,
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
            name: es[0]?.matter_name ?? `Asunto ${matterId}`,
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
      .filter(m => m.totalMinutes > 0)  // Fix 3: exclude 0-minute matters

    const totalMinutes = mattersList.reduce((sum, m) => sum + m.totalMinutes, 0)

    groups.push({ client, matters: mattersList, totalMinutes })
  }

  // Sort by total hours desc
  groups.sort((a, b) => b.totalMinutes - a.totalMinutes)
  return groups
}
