import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { Capture } from '@/types'

interface CaptureFilters {
  date?: string
  user_id?: number
  matter_id?: number
  ocr_status?: string
}

export function useCaptures(filters: CaptureFilters) {
  const params = new URLSearchParams()
  if (filters.date) params.set('date', filters.date)
  if (filters.user_id) params.set('user_id', String(filters.user_id))
  if (filters.matter_id) params.set('matter_id', String(filters.matter_id))
  if (filters.ocr_status) params.set('ocr_status', filters.ocr_status)
  const qs = params.toString()

  return useQuery({
    queryKey: ['captures', filters],
    queryFn: () => api<Capture[]>(`/captures${qs ? `?${qs}` : ''}`),
  })
}

export function useReassignCapture() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, matter_id }: { id: number; matter_id: number }) =>
      api<Capture>(`/captures/${id}`, { method: 'PUT', body: JSON.stringify({ matter_id }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['captures'] }),
  })
}
