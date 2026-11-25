import type {
  AppSettings,
  ClipExportPayload,
  ClipSuggestion,
  DashboardStats,
  ExportItem,
  ExportJobResponse,
  HealthResponse,
  JobItem,
  OllamaModelsResponse,
  Project,
  TranscriptOut,
  UploadResponse,
} from '../types/api'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || `Request failed with status ${response.status}`)
  }
  if (response.status === 204) {
    return undefined as T
  }
  return response.json() as Promise<T>
}

export const api = {
  getHealth: () => request<HealthResponse>('/health'),
  getDashboard: () => request<DashboardStats>('/dashboard'),
  listProjects: () => request<Project[]>('/projects'),
  getProject: (id: number) => request<Project>(`/projects/${id}`),
  uploadVideo: async (file: File, name: string, category: string): Promise<UploadResponse> => {
    const formData = new FormData()
    formData.append('file', file)
    if (name.trim()) formData.append('name', name.trim())
    formData.append('category', category)

    const response = await fetch('/api/projects/upload', {
      method: 'POST',
      body: formData,
    })
    if (!response.ok) {
      const text = await response.text()
      throw new Error(text || `Upload failed (${response.status})`)
    }
    return response.json() as Promise<UploadResponse>
  },
  deleteProject: (id: number) => request<void>(`/projects/${id}`, { method: 'DELETE' }),
  listJobs: () => request<JobItem[]>('/jobs'),
  getJob: (id: number) => request<JobItem>(`/jobs/${id}`),
  cancelJob: (id: number) => request<JobItem>(`/jobs/${id}/cancel`, { method: 'POST' }),
  subscribeToJob: (
    jobId: number,
    onUpdate: (job: JobItem) => void,
    onError?: () => void,
  ): (() => void) => {
    const es = new EventSource(`/api/jobs/${jobId}/events`)
    es.onmessage = (event) => {
      try {
        const job = JSON.parse(event.data) as JobItem
        onUpdate(job)
        if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
          es.close()
        }
      } catch {
        // ignore parse errors
      }
    }
    es.onerror = () => {
      es.close()
      onError?.()
    }
    return () => es.close()
  },
  getSettings: () => request<AppSettings>('/settings'),
  updateSettings: (payload: AppSettings) =>
    request<AppSettings>('/settings', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  listOllamaModels: () => request<OllamaModelsResponse>('/settings/ollama-models'),
  getTranscript: (projectId: number) =>
    request<TranscriptOut | null>(`/projects/${projectId}/transcript`),
  startTranscription: (projectId: number) =>
    request<JobItem>(`/projects/${projectId}/transcribe`, { method: 'POST' }),
  listClips: (projectId: number) =>
    request<ClipSuggestion[]>(`/projects/${projectId}/clips`),
  detectHighlights: (projectId: number, minSeconds: number, maxSeconds: number, model?: string) =>
    request<JobItem>(`/projects/${projectId}/clips/detect`, {
      method: 'POST',
      body: JSON.stringify({ min_seconds: minSeconds, max_seconds: maxSeconds, model: model || null }),
    }),
  createManualClip: (
    projectId: number,
    payload: { title: string; start_time: number; end_time: number; category: string },
  ) =>
    request<ClipSuggestion>(`/projects/${projectId}/clips`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateClip: (
    clipId: number,
    payload: Partial<Pick<ClipSuggestion, 'title' | 'start_time' | 'end_time' | 'status' | 'caption'>>,
  ) =>
    request<ClipSuggestion>(`/clips/${clipId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  deleteClip: (clipId: number) => request<void>(`/clips/${clipId}`, { method: 'DELETE' }),
  exportClip: (clipId: number, payload: ClipExportPayload) =>
    request<ExportJobResponse>(`/clips/${clipId}/export`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  listExports: () => request<ExportItem[]>('/exports'),
  openExportFolder: (exportId: number) =>
    request<{ status: string }>(`/exports/${exportId}/open-folder`, { method: 'POST' }),
  deleteExport: (exportId: number) => request<void>(`/exports/${exportId}`, { method: 'DELETE' }),
}
