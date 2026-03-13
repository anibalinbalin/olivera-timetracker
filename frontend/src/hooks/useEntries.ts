import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { TimeEntry } from '@/types'

interface EntryFilters {
  date?: string
  user_id?: number
  status?: string
}

export function useEntries(filters: EntryFilters) {
  const params = new URLSearchParams()
  if (filters.date) params.set('date', filters.date)
  if (filters.user_id) params.set('user_id', String(filters.user_id))
  if (filters.status) params.set('status', filters.status)
  const qs = params.toString()

  return useQuery({
    queryKey: ['entries', filters],
    queryFn: () => api<TimeEntry[]>(`/entries${qs ? `?${qs}` : ''}`),
  })
}

export function useCreateEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: {
      user_id: number
      matter_id: number
      date: string
      duration_minutes: number
      description?: string
      capture_ids?: number[]
    }) => api<TimeEntry>('/entries', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['entries'] }),
  })
}

export function useUpdateEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      ...data
    }: {
      id: number
      description?: string
      matter_id?: number
      duration_minutes?: number
    }) => api<TimeEntry>(`/entries/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['entries'] }),
  })
}

export function useUpdateEntryStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      api<TimeEntry>(`/entries/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['entries'] }),
  })
}

export function useGenerateEntries() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { user_id: number; date: string }) =>
      api<TimeEntry[]>('/entries/generate', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['entries'] })
      qc.invalidateQueries({ queryKey: ['captures'] })
    },
  })
}
