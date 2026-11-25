import { useEffect, useState } from 'react'
import { Check, RefreshCw, Save } from 'lucide-react'
import { api } from '../lib/api'
import type { AppSettings, OllamaModelInfo } from '../types/api'

export function SettingsPage() {
  const [form, setForm] = useState<AppSettings | null>(null)
  const [ollamaModels, setOllamaModels] = useState<OllamaModelInfo[]>([])
  const [ollamaAvailable, setOllamaAvailable] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const load = async () => {
    const [settingsData, ollamaData] = await Promise.all([
      api.getSettings(),
      api.listOllamaModels(),
    ])
    setForm(settingsData)
    setOllamaAvailable(ollamaData.available)
    setOllamaModels(ollamaData.models)
  }

  useEffect(() => {
    load()
  }, [])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form) return
    setSaving(true)
    setSaved(false)
    try {
      const updated = await api.updateSettings(form)
      setForm(updated)
      setSaved(true)
      window.setTimeout(() => setSaved(false), 2500)
    } finally {
      setSaving(false)
    }
  }

  if (!form) {
    return <div className="p-8 text-sm text-zinc-500">Loading settings...</div>
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-8">
      <div className="flex items-center justify-between border-b border-zinc-800 pb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">Settings</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Configure local Whisper transcription, Ollama AI model, and export defaults
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-[#111113] px-4 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-800"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh Models
        </button>
      </div>

      <form onSubmit={handleSave} className="space-y-6 rounded-xl border border-zinc-800 bg-[#111113] p-6">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-zinc-300">Whisper Model Size</label>
            <select
              value={form.whisper_model}
              onChange={(e) => setForm({ ...form, whisper_model: e.target.value })}
              className="mt-2 w-full rounded-lg border border-zinc-700 bg-[#09090b] px-3.5 py-2.5 text-sm text-zinc-100"
            >
              <option value="tiny">tiny (fastest, lowest VRAM)</option>
              <option value="base">base (recommended for 4GB VRAM)</option>
              <option value="small">small (higher accuracy, heavier)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300">Whisper Compute Device</label>
            <select
              value={form.whisper_device}
              onChange={(e) => setForm({ ...form, whisper_device: e.target.value })}
              className="mt-2 w-full rounded-lg border border-zinc-700 bg-[#09090b] px-3.5 py-2.5 text-sm text-zinc-100"
            >
              <option value="auto">Auto (GPU with CPU fallback)</option>
              <option value="cuda">CUDA (NVIDIA GPU)</option>
              <option value="cpu">CPU only</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300">
              Ollama Highlight Model {ollamaAvailable ? '' : '(Ollama offline)'}
            </label>
            <select
              value={form.ollama_model}
              onChange={(e) => setForm({ ...form, ollama_model: e.target.value })}
              className="mt-2 w-full rounded-lg border border-zinc-700 bg-[#09090b] px-3.5 py-2.5 text-sm text-zinc-100"
            >
              {ollamaModels.length === 0 ? (
                <option value={form.ollama_model}>{form.ollama_model}</option>
              ) : (
                ollamaModels.map((m) => (
                  <option key={m.name} value={m.name}>
                    {m.name} {m.is_cloud ? '(cloud)' : '(local)'}
                  </option>
                ))
              )}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300">Default Aspect Ratio</label>
            <select
              value={form.default_aspect_ratio}
              onChange={(e) => setForm({ ...form, default_aspect_ratio: e.target.value })}
              className="mt-2 w-full rounded-lg border border-zinc-700 bg-[#09090b] px-3.5 py-2.5 text-sm text-zinc-100"
            >
              <option value="9:16">9:16 (Shorts / Reels / TikTok)</option>
              <option value="1:1">1:1 (Square)</option>
              <option value="16:9">16:9 (Landscape)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300">Min Clip Duration (s)</label>
            <input
              type="number"
              min={5}
              max={120}
              value={form.default_clip_min_seconds}
              onChange={(e) => setForm({ ...form, default_clip_min_seconds: Number(e.target.value) })}
              className="mt-2 w-full rounded-lg border border-zinc-700 bg-[#09090b] px-3.5 py-2.5 text-sm text-zinc-100"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300">Max Clip Duration (s)</label>
            <input
              type="number"
              min={10}
              max={180}
              value={form.default_clip_max_seconds}
              onChange={(e) => setForm({ ...form, default_clip_max_seconds: Number(e.target.value) })}
              className="mt-2 w-full rounded-lg border border-zinc-700 bg-[#09090b] px-3.5 py-2.5 text-sm text-zinc-100"
            />
          </div>
        </div>

        <label className="flex items-center gap-3 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={form.prefer_hw_encoding}
            onChange={(e) => setForm({ ...form, prefer_hw_encoding: e.target.checked })}
            className="h-4 w-4 rounded border-zinc-700 bg-[#09090b] accent-zinc-100"
          />
          <span>Prefer NVIDIA NVENC hardware encoding when supported (falls back to libx264 CPU)</span>
        </label>

        <div className="flex items-center justify-end gap-3 border-t border-zinc-800 pt-5">
          {saved && (
            <span className="inline-flex items-center gap-1.5 text-sm text-zinc-100">
              <Check className="h-4 w-4" />
              Saved
            </span>
          )}
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-zinc-50 px-5 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-zinc-200 disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </form>
    </div>
  )
}
