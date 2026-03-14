import type { Matter } from '@/types'

interface Props {
  value?: number
  onChange: (matterId: number) => void
  matters: Matter[]
}

export function MatterSelect({ value, onChange, matters }: Props) {
  // Group by client
  const grouped = matters.reduce<Record<string, Matter[]>>((acc, m) => {
    const key = m.client_name ?? `Client ${m.client_id}`
    if (!acc[key]) acc[key] = []
    acc[key].push(m)
    return acc
  }, {})

  return (
    <select
      value={value ?? ''}
      onChange={e => onChange(Number(e.target.value))}
      aria-label="Seleccionar asunto"
      className="h-7 rounded-md border border-gray-300 bg-white px-2 text-xs outline-none focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-200 min-w-[160px]"
    >
      <option value="" disabled>Seleccionar asunto…</option>
      {Object.entries(grouped).map(([clientName, clientMatters]) => (
        <optgroup key={clientName} label={clientName}>
          {clientMatters.map(m => (
            <option key={m.id} value={m.id}>
              {m.name} ({m.matter_number})
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}
