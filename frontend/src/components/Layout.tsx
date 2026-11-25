import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import {
  Clapperboard,
  FolderKanban,
  Home,
  Scissors,
  Settings,
  Download,
} from 'lucide-react'
import { api } from '../lib/api'
import type { HealthResponse } from '../types/api'

const navItems = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/projects', label: 'Projects', icon: FolderKanban },
  { to: '/create', label: 'Create Clips', icon: Scissors },
  { to: '/exports', label: 'Exports', icon: Download },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export function Layout() {
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [healthError, setHealthError] = useState(false)

  useEffect(() => {
    let active = true
    const loadHealth = async () => {
      try {
        const res = await api.getHealth()
        if (active) {
          setHealth(res)
          setHealthError(false)
        }
      } catch {
        if (active) {
          setHealthError(true)
        }
      }
    }
    loadHealth()
    const id = window.setInterval(loadHealth, 15000)
    return () => {
      active = false
      window.clearInterval(id)
    }
  }, [])

  const statusLabel = healthError
    ? 'Offline'
    : health?.status === 'ok'
      ? 'Ready'
      : 'Degraded'

  const statusDot = healthError
    ? 'bg-red-500'
    : health?.status === 'ok'
      ? 'bg-zinc-100'
      : 'bg-amber-400'

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#09090b] text-zinc-100">
      <aside className="flex w-60 shrink-0 flex-col border-r border-zinc-800 bg-[#111113]">
        <div className="flex h-16 items-center gap-3 px-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br bg-zinc-100 text-zinc-950">
            <Clapperboard className="h-4 w-4" />
          </div>
          <span className="text-base font-semibold tracking-tight text-white">ClipMagic</span>
        </div>

        <div className="px-4 pt-2 pb-1 text-xs font-medium text-zinc-500">Video editing</div>

        <nav className="flex-1 space-y-1 px-3 py-1">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3.5 py-2.5 text-[15px] font-medium transition-colors ${
                    isActive
                      ? 'bg-[#18181b] text-white'
                      : 'text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100'
                  }`
                }
              >
                <Icon className="h-[18px] w-[18px] shrink-0" />
                <span>{item.label}</span>
              </NavLink>
            )
          })}
        </nav>

        <div className="p-3.5">
          <div className="rounded-xl border border-zinc-800 bg-[#09090b] p-3.5">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-zinc-200">{statusLabel}</span>
              <span className={`h-2.5 w-2.5 rounded-full ${statusDot}`} />
            </div>
            {health && !healthError && (
              <div className="mt-2.5 space-y-1 text-xs text-zinc-400">
                <div className="flex justify-between">
                  <span>FFmpeg</span>
                  <span className={health.ffmpeg.available ? 'text-zinc-200' : 'text-red-400'}>
                    {health.ffmpeg.available ? 'OK' : 'Missing'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Ollama</span>
                  <span className={health.ollama.available ? 'text-zinc-200' : 'text-amber-400'}>
                    {health.ollama.available ? 'Online' : 'Offline'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Compute</span>
                  <span className="text-zinc-200">{health.gpu.available ? 'GPU' : 'CPU'}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto bg-[#09090b]">
        <Outlet />
      </main>
    </div>
  )
}
