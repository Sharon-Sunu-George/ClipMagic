import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Film, Plus, Trash2 } from 'lucide-react'
import { api, apiUrl } from '../lib/api'
import type { Project } from '../types/api'

export function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api
      .listProjects()
      .then(setProjects)
      .finally(() => setLoading(false))
  }, [])

  const handleDelete = async (id: number) => {
    await api.deleteProject(id)
    if (window.localStorage.getItem('clipmagic_last_project_id') === String(id)) {
      window.localStorage.removeItem('clipmagic_last_project_id')
    }
    setProjects((prev) => prev.filter((p) => p.id !== id))
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-8">
      <div className="flex items-center justify-between border-b border-zinc-800 pb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">Projects</h1>
          <p className="mt-1 text-sm text-zinc-400">Manage imported long-form videos</p>
        </div>
        <Link
          to="/create"
          onClick={() => window.localStorage.removeItem('clipmagic_last_project_id')}
          className="inline-flex items-center gap-2 rounded-lg bg-zinc-50 px-4 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-zinc-200 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Project
        </Link>
      </div>

      {loading ? (
        <div className="text-sm text-zinc-500">Loading projects...</div>
      ) : projects.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-800 bg-[#111113] p-14 text-center">
          <Film className="mx-auto h-10 w-10 text-zinc-600" />
          <p className="mt-3 text-base text-zinc-300">No video projects yet.</p>
          <Link
            to="/create"
            className="mt-4 inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-800"
          >
            Import your first video
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <div
              key={p.id}
              className="flex flex-col justify-between overflow-hidden rounded-xl border border-zinc-800 bg-[#111113]"
            >
              <div>
                <div className="aspect-video w-full bg-zinc-900">
                  {p.thumbnail_path ? (
                    <img
                      src={apiUrl(`/projects/${p.id}/thumbnail`)}
                      alt={p.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-zinc-700">
                      <Film className="h-10 w-10" />
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="text-base font-medium text-zinc-100 truncate">{p.name}</h2>
                    <button
                      onClick={() => handleDelete(p.id)}
                      className="rounded p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-red-400"
                      title="Delete project"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-1 text-sm text-zinc-400">
                    {p.category} · {p.resolution ?? 'Unknown'}
                    {p.fps ? ` · ${p.fps} fps` : ''}
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between border-t border-zinc-800 px-4 py-3 text-sm text-zinc-400">
                <span>{p.duration ? `${Math.round(p.duration)}s` : 'Pending'}</span>
                <Link
                  to={`/create/${p.id}`}
                  className="font-medium text-zinc-100 hover:text-zinc-200"
                >
                  Open Studio
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
