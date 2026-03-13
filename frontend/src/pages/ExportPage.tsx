import { useState } from 'react'
import { Download01Icon } from 'hugeicons-react'
import { useEntries } from '@/hooks/useEntries'
import { Button } from '@/components/ui/button'
import type { TimeEntry } from '@/types'

type StatusFilter = 'ALL' | 'DRAFT' | 'REVIEWED' | 'APPROVED'

function formatDuration(minutes: number): string {
  return (minutes / 60).toFixed(2)
}

export default function ExportPage() {
  const today = new Date().toISOString().split('T')[0]
  const firstOfMonth = today.slice(0, 8) + '01'

  const [from, setFrom] = useState(firstOfMonth)
  const [to, setTo] = useState(today)
  const [status, setStatus] = useState<StatusFilter>('APPROVED')

  const filters = {
    ...(status !== 'ALL' ? { status } : {}),
  }

  const { data: entries, isLoading } = useEntries(filters)

  const filtered: TimeEntry[] = (entries ?? []).filter((e) => {
    if (from && e.date < from) return false
    if (to && e.date > to) return false
    return true
  })

  const downloadCSV = async () => {
    const params = new URLSearchParams()
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    if (status !== 'ALL') params.set('status', status)
    const res = await fetch(`/api/entries/export?${params}`, { credentials: 'include' })
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `timetracker-export-${from}-${to}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Export</h1>
        <Button onClick={downloadCSV} disabled={filtered.length === 0}>
          <Download01Icon className="w-4 h-4 mr-2" />
          Download CSV
        </Button>
      </div>

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
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-muted-foreground">Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
            className="border rounded-md px-3 py-2 text-sm bg-background"
          >
            <option value="ALL">All</option>
            <option value="DRAFT">Draft</option>
            <option value="REVIEWED">Reviewed</option>
            <option value="APPROVED">Approved</option>
          </select>
        </div>
      </div>

      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Date</th>
              <th className="text-left px-4 py-3 font-medium">Matter</th>
              <th className="text-left px-4 py-3 font-medium">Client</th>
              <th className="text-right px-4 py-3 font-medium">Hours</th>
              <th className="text-left px-4 py-3 font-medium">Description</th>
              <th className="text-left px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  No entries match the selected filters.
                </td>
              </tr>
            ) : (
              filtered.map((entry) => (
                <tr key={entry.id} className="border-t hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 whitespace-nowrap">{entry.date}</td>
                  <td className="px-4 py-3">{entry.matter_name ?? entry.matter_id}</td>
                  <td className="px-4 py-3">{entry.client_name ?? '—'}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatDuration(entry.duration_minutes)}
                  </td>
                  <td className="px-4 py-3 max-w-xs truncate">{entry.description ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-muted">
                      {entry.status}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {!isLoading && filtered.length > 0 && (
        <p className="text-sm text-muted-foreground">
          {filtered.length} {filtered.length === 1 ? 'entry' : 'entries'} —{' '}
          {filtered.reduce((sum, e) => sum + e.duration_minutes, 0) / 60 | 0}h total
        </p>
      )}
    </div>
  )
}
