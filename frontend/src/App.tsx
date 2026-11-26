import { useEffect, useState } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { initBackendConnection, isTauriDesktop } from './lib/api'
import { Layout } from './components/Layout'
import { DashboardPage } from './pages/DashboardPage'
import { ProjectsPage } from './pages/ProjectsPage'
import { CreateClipsPage } from './pages/CreateClipsPage'
import { ExportsPage } from './pages/ExportsPage'
import { SettingsPage } from './pages/SettingsPage'

export function App() {
  const [backendReady, setBackendReady] = useState(!isTauriDesktop())
  const [startupError, setStartupError] = useState<string | null>(null)

  useEffect(() => {
    if (!isTauriDesktop()) return
    initBackendConnection()
      .then((status) => {
        if (status.ready) {
          setBackendReady(true)
        } else {
          setStartupError(status.error || 'Local backend failed to start.')
        }
      })
      .catch((err) => {
        setStartupError(err instanceof Error ? err.message : 'Failed to initialize desktop backend.')
      })
  }, [])

  if (startupError) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#09090b] p-6 text-zinc-100">
        <div className="max-w-md rounded-xl border border-red-500/30 bg-[#111113] p-6 space-y-3">
          <div className="flex items-center gap-2.5 text-red-400 font-semibold">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <span>ClipMagic Backend Startup Error</span>
          </div>
          <p className="text-sm text-zinc-300 leading-relaxed">{startupError}</p>
        </div>
      </div>
    )
  }

  if (!backendReady) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center gap-3 bg-[#09090b] text-zinc-200">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-100" />
        <div className="text-sm font-medium">Starting ClipMagic local engine...</div>
      </div>
    )
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/create" element={<CreateClipsPage />} />
          <Route path="/create/:projectId" element={<CreateClipsPage />} />
          <Route path="/exports" element={<ExportsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
