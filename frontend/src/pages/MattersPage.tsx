import { useState } from 'react'
import {
  Add01Icon,
  Edit01Icon,
  Delete01Icon,
  ArrowDown01Icon,
  ArrowRight01Icon,
  Cancel01Icon,
  FloppyDiskIcon,
} from 'hugeicons-react'
import { Button } from '@/components/ui/button'
import { useClients, useCreateClient, useUpdateClient, useDeleteClient } from '@/hooks/useClients'
import { useMatters, useCreateMatter, useUpdateMatter, useDeleteMatter } from '@/hooks/useMatters'
import type { Client, Matter } from '@/types'

// ── Inline text input ────────────────────────────────────────────────────────
function Field({
  label,
  value,
  onChange,
  placeholder,
  required,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  required?: boolean
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-600">{label}</label>
      <input
        className="h-8 rounded-md border border-gray-300 bg-white px-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
      />
    </div>
  )
}

// ── Inline form shell ────────────────────────────────────────────────────────
function InlineForm({
  onCancel,
  onSubmit,
  isPending,
  children,
  submitLabel = 'Save',
}: {
  onCancel: () => void
  onSubmit: () => void
  isPending: boolean
  children: React.ReactNode
  submitLabel?: string
}) {
  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 flex flex-col gap-3">
      {children}
      <div className="flex gap-2">
        <Button size="sm" onClick={onSubmit} disabled={isPending}>
          <FloppyDiskIcon size={14} />
          {submitLabel}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={isPending}>
          <Cancel01Icon size={14} />
          Cancel
        </Button>
      </div>
    </div>
  )
}

// ── Matter row ───────────────────────────────────────────────────────────────
function MatterRow({ matter }: { matter: Matter }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(matter.name)
  const [number, setNumber] = useState(matter.matter_number)
  const [desc, setDesc] = useState(matter.description ?? '')

  const updateMatter = useUpdateMatter()
  const deleteMatter = useDeleteMatter()

  function handleSave() {
    if (!name.trim() || !number.trim()) return
    updateMatter.mutate(
      { id: matter.id, name: name.trim(), matter_number: number.trim(), description: desc.trim() || undefined },
      { onSuccess: () => setEditing(false) }
    )
  }

  function handleDeactivate() {
    if (confirm(`Deactivate "${matter.name}"?`)) {
      deleteMatter.mutate(matter.id)
    }
  }

  if (editing) {
    return (
      <div className="pl-4">
        <InlineForm
          onCancel={() => { setEditing(false); setName(matter.name); setNumber(matter.matter_number); setDesc(matter.description ?? '') }}
          onSubmit={handleSave}
          isPending={updateMatter.isPending}
        >
          <div className="grid grid-cols-2 gap-2">
            <Field label="Name" value={name} onChange={setName} required />
            <Field label="Matter #" value={number} onChange={setNumber} required />
          </div>
          <Field label="Description" value={desc} onChange={setDesc} placeholder="Optional" />
        </InlineForm>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 py-1.5 pl-4 pr-2 rounded-md hover:bg-gray-50 group">
      <div className="flex-1 min-w-0">
        <span className="text-sm text-gray-800 font-medium">{matter.name}</span>
        <span className="ml-2 text-xs text-gray-400 font-mono">{matter.matter_number}</span>
        {matter.description && (
          <span className="ml-2 text-xs text-gray-500 truncate">{matter.description}</span>
        )}
        {!matter.is_active && (
          <span className="ml-2 text-xs bg-gray-200 text-gray-500 rounded px-1.5 py-0.5">Inactive</span>
        )}
      </div>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button size="icon-sm" variant="ghost" onClick={() => setEditing(true)} title="Edit">
          <Edit01Icon size={14} />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={handleDeactivate}
          disabled={deleteMatter.isPending}
          title="Deactivate"
          className="text-red-500 hover:text-red-600 hover:bg-red-50"
        >
          <Delete01Icon size={14} />
        </Button>
      </div>
    </div>
  )
}

// ── Add matter form ──────────────────────────────────────────────────────────
function AddMatterForm({ clientId, onDone }: { clientId: number; onDone: () => void }) {
  const [name, setName] = useState('')
  const [number, setNumber] = useState('')
  const [desc, setDesc] = useState('')
  const createMatter = useCreateMatter()

  function handleSubmit() {
    if (!name.trim() || !number.trim()) return
    createMatter.mutate(
      { client_id: clientId, name: name.trim(), matter_number: number.trim(), description: desc.trim() || undefined },
      { onSuccess: () => { setName(''); setNumber(''); setDesc(''); onDone() } }
    )
  }

  return (
    <div className="pl-4">
      <InlineForm onCancel={onDone} onSubmit={handleSubmit} isPending={createMatter.isPending} submitLabel="Add Matter">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Name" value={name} onChange={setName} placeholder="Matter name" required />
          <Field label="Matter #" value={number} onChange={setNumber} placeholder="M-2024-001" required />
        </div>
        <Field label="Description" value={desc} onChange={setDesc} placeholder="Optional" />
      </InlineForm>
    </div>
  )
}

// ── Client card ──────────────────────────────────────────────────────────────
function ClientCard({ client, matters }: { client: Client; matters: Matter[] }) {
  const [expanded, setExpanded] = useState(true)
  const [editing, setEditing] = useState(false)
  const [addingMatter, setAddingMatter] = useState(false)
  const [name, setName] = useState(client.name)
  const [code, setCode] = useState(client.code)

  const updateClient = useUpdateClient()
  const deleteClient = useDeleteClient()

  function handleSaveClient() {
    if (!name.trim() || !code.trim()) return
    updateClient.mutate(
      { id: client.id, name: name.trim(), code: code.trim() },
      { onSuccess: () => setEditing(false) }
    )
  }

  function handleDeleteClient() {
    if (confirm(`Delete client "${client.name}"? This cannot be undone.`)) {
      deleteClient.mutate(client.id)
    }
  }

  const clientMatters = matters.filter(m => m.client_id === client.id)

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-200">
        <button
          onClick={() => setExpanded(v => !v)}
          className="text-gray-500 hover:text-gray-700 transition-colors"
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? <ArrowDown01Icon size={16} /> : <ArrowRight01Icon size={16} />}
        </button>
        {editing ? (
          <div className="flex-1 flex items-center gap-2">
            <input
              className="h-7 rounded-md border border-gray-300 bg-white px-2 text-sm font-medium outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 w-48"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Client name"
            />
            <input
              className="h-7 rounded-md border border-gray-300 bg-white px-2 text-sm font-mono uppercase outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 w-28"
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
              placeholder="CODE"
            />
            <Button size="sm" onClick={handleSaveClient} disabled={updateClient.isPending}>
              <FloppyDiskIcon size={14} />
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setName(client.name); setCode(client.code) }}>
              <Cancel01Icon size={14} />
              Cancel
            </Button>
          </div>
        ) : (
          <div className="flex-1 flex items-center gap-2">
            <span className="font-semibold text-gray-900">{client.name}</span>
            <span className="text-xs font-mono text-gray-500 bg-gray-200 rounded px-1.5 py-0.5">{client.code}</span>
            <span className="text-xs text-gray-400">
              {clientMatters.length} matter{clientMatters.length !== 1 ? 's' : ''}
            </span>
          </div>
        )}
        {!editing && (
          <div className="flex gap-1 ml-auto">
            <Button size="icon-sm" variant="ghost" onClick={() => setEditing(true)} title="Edit client">
              <Edit01Icon size={14} />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={handleDeleteClient}
              disabled={deleteClient.isPending}
              title="Delete client"
              className="text-red-500 hover:text-red-600 hover:bg-red-50"
            >
              <Delete01Icon size={14} />
            </Button>
          </div>
        )}
      </div>

      {/* Matters list */}
      {expanded && (
        <div className="px-2 py-2 flex flex-col gap-0.5">
          {clientMatters.length === 0 && !addingMatter && (
            <p className="text-sm text-gray-400 pl-4 py-1">No matters yet.</p>
          )}
          {clientMatters.map(m => (
            <MatterRow key={m.id} matter={m} />
          ))}
          {addingMatter ? (
            <AddMatterForm clientId={client.id} onDone={() => setAddingMatter(false)} />
          ) : (
            <button
              onClick={() => setAddingMatter(true)}
              className="flex items-center gap-1.5 pl-4 py-1.5 text-sm text-blue-600 hover:text-blue-700 rounded-md hover:bg-blue-50 transition-colors w-fit"
            >
              <Add01Icon size={14} />
              Add Matter
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Add client form ──────────────────────────────────────────────────────────
function AddClientForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const createClient = useCreateClient()

  function handleSubmit() {
    if (!name.trim() || !code.trim()) return
    createClient.mutate(
      { name: name.trim(), code: code.trim().toUpperCase() },
      { onSuccess: () => { setName(''); setCode(''); onDone() } }
    )
  }

  return (
    <InlineForm onCancel={onDone} onSubmit={handleSubmit} isPending={createClient.isPending} submitLabel="Add Client">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Client Name" value={name} onChange={setName} placeholder="Smith Corp" required />
        <Field label="Code" value={code} onChange={v => setCode(v.toUpperCase())} placeholder="SMITH" required />
      </div>
    </InlineForm>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function MattersPage() {
  const [addingClient, setAddingClient] = useState(false)
  const { data: clients, isLoading: clientsLoading, error: clientsError } = useClients()
  const { data: matters, isLoading: mattersLoading, error: mattersError } = useMatters()

  const isLoading = clientsLoading || mattersLoading
  const error = clientsError || mattersError

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Matters</h1>
        {!addingClient && (
          <Button onClick={() => setAddingClient(true)}>
            <Add01Icon size={16} />
            Add Client
          </Button>
        )}
      </div>

      {addingClient && (
        <div className="mb-4">
          <AddClientForm onDone={() => setAddingClient(false)} />
        </div>
      )}

      {isLoading && (
        <div className="text-sm text-gray-500 py-8 text-center">Loading…</div>
      )}

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700">
          Failed to load data. Please refresh.
        </div>
      )}

      {!isLoading && !error && clients && matters && (
        <div className="flex flex-col gap-3">
          {clients.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <p className="text-lg font-medium">No clients yet</p>
              <p className="text-sm mt-1">Click "Add Client" to get started.</p>
            </div>
          ) : (
            clients.map(client => (
              <ClientCard key={client.id} client={client} matters={matters} />
            ))
          )}
        </div>
      )}
    </div>
  )
}
