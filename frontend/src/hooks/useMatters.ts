import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { Matter } from '@/types'

export function useMatters() {
  return useQuery({
    queryKey: ['matters'],
    queryFn: () => api<Matter[]>('/matters'),
  })
}

export function useCreateMatter() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: {
      client_id: number
      name: string
      matter_number: string
      description?: string
    }) => api<Matter>('/matters', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['matters'] }),
  })
}

export function useUpdateMatter() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      ...data
    }: {
      id: number
      name?: string
      matter_number?: string
      description?: string
      client_id?: number
    }) => api<Matter>(`/matters/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['matters'] }),
  })
}

export function useDeleteMatter() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) =>
      api<void>(`/matters/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['matters'] }),
  })
}
