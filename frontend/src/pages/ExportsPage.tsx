import { useEffect, useState } from 'react'
import { Download, FolderOpen, Play, Trash2 } from 'lucide-react'
import { api, apiUrl } from '../lib/api'
import type { ExportItem } from '../types/api'

function formatBytes(bytes: number | null): string {
  if (!bytes) return '—'
  const mb = bytes / (1024 * 1024)
  return `${mb.toFixed(1)} MB`
}

export function ExportsPage() {
  const [exportsList, setExportsList] = useState<ExportItem[]>([])
  const [loading, setLoading] = useState(true)
  const [previewId, setPreviewId] = useState<number | null>(null)

  const load = async () => {
    try {
      const data = await api.listExports()
      setExportsList(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const handleDelete = async (id: number) => {
    await api.deleteExport(id)
    if (previewId === id) setPreviewId(null)
    setExportsList((prev) => prev.filter((e) => e.id !== id))
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-8">
      <div className="flex items-center justify-between border-b border-zinc-800 pb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">Exports</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Render queue, export history, and local MP4 outputs
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="rounded-lg border border-zinc-700 bg-[#111113] px-4 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-800"
        >
          Refresh
        </button>
      </div>

      {previewId !== null && (
        <div className="rounded-xl border border-zinc-800 bg-[#111113] p-5">
          <div className="mb-3 flex items-center justify-between text-sm text-zinc-300">
            <span className="font-medium">Export Preview (#{previewId})</span>
            <button
              type="button"
              onClick={() => setPreviewId(null)}
              className="rounded border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
            >
              Close
            </button>
          </div>
          <video
            key={previewId}
            src={apiUrl(`/exports/${previewId}/video`)}
            controls
            autoPlay
            className="mx-auto max-h-[520px] rounded-lg bg-black"
          />
        </div>
      )}

      {loading ? (
        <div className="text-sm text-zinc-500">Loading exports...</div>
      ) : exportsList.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-[#111113] p-14 text-center">
          <Download className="mx-auto h-10 w-10 text-zinc-600" />
          <p className="mt-3 text-base text-zinc-300">No rendered clips yet.</p>
          <p className="mt-1 text-sm text-zinc-500">
            Select a clip in Create Clips and click Export MP4 to render your first short.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-white/[0.06] rounded-xl border border-zinc-800 bg-[#111113]">
          {exportsList.map((exp) => (
            <div key={exp.id} className="flex flex-wrap items-center justify-between gap-4 p-5">
              <div>
                <div className="text-base font-medium text-zinc-100">
                  Export #{exp.id} · {exp.preset} ({exp.aspect_ratio})
                </div>
                <div className="mt-1 text-sm text-zinc-400">
                  Subtitles: {exp.subtitle_style} · {exp.duration ? `${exp.duration}s` : '—'} ·{' '}
                  {formatBytes(exp.file_size)}
                </div>
                <div className="mt-1 truncate max-w-xl font-mono text-xs text-zinc-500" title={exp.output_path}>
                  Saved: {exp.output_path}
                </div>
              </div>
              <div className="flex items-center gap-2.5">
                <span
                  className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                    exp.status === 'completed'
                      ? 'bg-zinc-800 text-zinc-100'
                      : exp.status === 'failed'
                        ? 'bg-red-500/15 text-red-400'
                        : 'bg-amber-500/15 text-amber-400'
                  }`}
                >
                  {exp.status}
                </span>
                {exp.status === 'completed' && (
                  <>
                    <button
                      type="button"
                      onClick={() => setPreviewId(exp.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800"
                    >
                      <Play className="h-4 w-4" />
                      Preview
                    </button>
                    <a
                      href={apiUrl(`/exports/${exp.id}/video`)}
                      download={`clipmagic_export_${exp.id}_${exp.preset}.mp4`}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-950 hover:bg-white"
                    >
                      <Download className="h-4 w-4" />
                      Download
                    </a>
                    <button
                      type="button"
                      onClick={() => api.openExportFolder(exp.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800"
                    >
                      <FolderOpen className="h-4 w-4" />
                      Open Folder
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => handleDelete(exp.id)}
                  className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-800 hover:text-red-400"
                  title="Delete export"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
