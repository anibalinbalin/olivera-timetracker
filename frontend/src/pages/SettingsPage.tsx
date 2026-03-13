import { useState, useEffect } from 'react'
import { useSettings, useUpdateSettings } from '@/hooks/useSettings'
import { Button } from '@/components/ui/button'
import type { Settings } from '@/types'

export default function SettingsPage() {
  const { data: settings, isLoading } = useSettings()
  const update = useUpdateSettings()

  const [form, setForm] = useState<Settings>({
    capture_interval_seconds: 30,
    screenshot_retention_hours: 24,
    ocr_enabled: true,
    categorization_confidence_threshold: 0.7,
  })
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (settings) setForm(settings)
  }, [settings])

  const handleChange = (field: keyof Settings, value: Settings[keyof Settings]) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    setSaved(false)
  }

  const handleSave = () => {
    update.mutate(form, {
      onSuccess: () => {
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      },
    })
  }

  if (isLoading) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Loading settings…</p>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      <div className="rounded-md border p-6 space-y-5">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">Capture interval (seconds)</label>
          <input
            type="number"
            min={5}
            step={5}
            value={form.capture_interval_seconds}
            onChange={(e) => handleChange('capture_interval_seconds', Number(e.target.value))}
            className="border rounded-md px-3 py-2 text-sm bg-background w-40"
          />
          <p className="text-xs text-muted-foreground">How often the agent captures a screenshot.</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">Screenshot retention (hours)</label>
          <input
            type="number"
            min={1}
            step={1}
            value={form.screenshot_retention_hours}
            onChange={(e) => handleChange('screenshot_retention_hours', Number(e.target.value))}
            className="border rounded-md px-3 py-2 text-sm bg-background w-40"
          />
          <p className="text-xs text-muted-foreground">Screenshots older than this are deleted.</p>
        </div>

        <div className="flex items-center gap-3">
          <input
            id="ocr_enabled"
            type="checkbox"
            checked={form.ocr_enabled}
            onChange={(e) => handleChange('ocr_enabled', e.target.checked)}
            className="w-4 h-4 accent-primary"
          />
          <label htmlFor="ocr_enabled" className="text-sm font-medium cursor-pointer">
            OCR enabled
          </label>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">Confidence threshold</label>
          <input
            type="number"
            min={0}
            max={1}
            step={0.1}
            value={form.categorization_confidence_threshold}
            onChange={(e) =>
              handleChange('categorization_confidence_threshold', Number(e.target.value))
            }
            className="border rounded-md px-3 py-2 text-sm bg-background w-40"
          />
          <p className="text-xs text-muted-foreground">
            Minimum AI confidence (0–1) to auto-categorize a capture.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <Button onClick={handleSave} disabled={update.isPending}>
          {update.isPending ? 'Saving…' : 'Save'}
        </Button>
        {saved && <p className="text-sm text-green-600 font-medium">Settings saved.</p>}
        {update.isError && (
          <p className="text-sm text-destructive font-medium">Failed to save. Try again.</p>
        )}
      </div>
    </div>
  )
}
