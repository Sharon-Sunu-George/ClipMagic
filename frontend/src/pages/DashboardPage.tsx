import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Film, Plus } from 'lucide-react'
import { api, apiUrl } from '../lib/api'
import type { DashboardStats } from '../types/api'

function formatDuration(seconds: number | null): string {
  if (seconds == null) return '00:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

export function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    api
      .getDashboard()
      .then((data) => {
        if (active) {
          setStats(data)
          setError(null)
        }
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof Error ? err.message : 'Failed to connect to backend')
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-8">
      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3.5 text-sm text-red-300">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <span>Backend connection error: {error}</span>
        </div>
      )}

      {/* CapCut-style Hero Banner */}
      <Link
        to="/create"
        onClick={() => window.localStorage.removeItem('clipmagic_last_project_id')}
        className="flex h-44 w-full items-center justify-center gap-3 rounded-2xl bg-gradient-to-r bg-[#111113] border border-zinc-800 hover:bg-[#18181b] text-white transition-colors hover:scale-[1.005]"
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-100 text-zinc-950">
          <Plus className="h-5 w-5" />
        </div>
        <span className="text-xl font-semibold tracking-tight">New project</span>
      </Link>

      {/* Minimal Stats Strip */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: 'Videos', value: stats?.total_videos_processed ?? 0 },
          { label: 'Clips', value: stats?.total_clips_generated ?? 0 },
          { label: 'Exports', value: stats?.total_exports ?? 0 },
          { label: 'Active Jobs', value: stats?.active_jobs.length ?? 0 },
        ].map((item) => (
          <div key={item.label} className="rounded-xl border border-zinc-800 bg-[#111113] px-5 py-4">
            <div className="text-xs font-medium text-zinc-400">{item.label}</div>
            <div className="mt-1.5 text-2xl font-semibold text-white">
              {loading ? '—' : item.value}
            </div>
          </div>
        ))}
      </div>

      {/* CapCut-style Projects Grid */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Projects</h2>
          <Link to="/projects" className="text-sm font-medium text-zinc-100 hover:text-zinc-200">
            View all
          </Link>
        </div>

        {!stats || stats.recent_projects.length === 0 ? (
          <div className="rounded-xl border border-zinc-800 bg-[#111113] py-14 text-center text-sm text-zinc-400">
            No projects yet. Click <span className="font-medium text-white">New project</span> above to start.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {stats.recent_projects.map((p) => (
              <Link
                key={p.id}
                to={`/create/${p.id}`}
                className="group space-y-2.5"
              >
                <div className="aspect-square w-full overflow-hidden rounded-xl border border-zinc-800 bg-[#111113]">
                  {p.thumbnail_path ? (
                    <img
                      src={apiUrl(`/projects/${p.id}/thumbnail`)}
                      alt={p.name}
                      className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-zinc-600">
                      <Film className="h-8 w-8" />
                    </div>
                  )}
                </div>
                <div>
                  <div className="truncate text-sm font-medium text-zinc-100 group-hover:text-zinc-200">
                    {p.name}
                  </div>
                  <div className="mt-0.5 text-xs text-zinc-500">
                    {p.resolution ?? 'Pending'} | {formatDuration(p.duration)}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
