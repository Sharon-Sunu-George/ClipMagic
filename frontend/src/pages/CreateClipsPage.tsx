import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeft,
  Captions,
  Check,
  CheckCircle2,
  Crop,
  Download,
  Film,
  Loader2,
  MessageSquareText,
  Play,
  Plus,
  Scissors,
  Trash2,
  Upload,
  X,
  XCircle,
} from 'lucide-react'
import { api } from '../lib/api'
import type {
  ClipSuggestion,
  JobItem,
  OllamaModelInfo,
  Project,
  TranscriptOut,
  TranscriptSegment,
} from '../types/api'

const CONTENT_CATEGORIES = [
  'Podcasts',
  'Interviews',
  'Gaming',
  'Educational videos',
  'Commentary',
  'Tutorials',
  'General videos',
]

const ACCEPTED_EXTENSIONS = ['.mp4', '.mov', '.mkv', '.webm']

function formatBytes(bytes: number | null): string {
  if (!bytes) return '—'
  const mb = bytes / (1024 * 1024)
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(1)} MB`
}

function formatDuration(seconds: number | null): string {
  if (seconds == null) return '—'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

type EditorTab = 'trim' | 'ratio' | 'captions' | 'export'

export function CreateClipsPage() {
  const { projectId } = useParams<{ projectId?: string }>()
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [projectName, setProjectName] = useState('')
  const [category, setCategory] = useState('General videos')
  const [dragActive, setDragActive] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [project, setProject] = useState<Project | null>(null)
  const [job, setJob] = useState<JobItem | null>(null)
  const [transcript, setTranscript] = useState<TranscriptOut | null>(null)
  const [clips, setClips] = useState<ClipSuggestion[]>([])
  const [currentTime, setCurrentTime] = useState(0)

  const [minClipSec, setMinClipSec] = useState(20)
  const [maxClipSec, setMaxClipSec] = useState(60)
  const [ollamaModels, setOllamaModels] = useState<OllamaModelInfo[]>([])
  const [selectedModel, setSelectedModel] = useState('')

  const [showManualForm, setShowManualForm] = useState(false)
  const [manualTitle, setManualTitle] = useState('')
  const [manualStart, setManualStart] = useState(0)
  const [manualEnd, setManualEnd] = useState(30)
  const [rightTab, setRightTab] = useState<'player' | 'transcript'>('player')

  const [editingClip, setEditingClip] = useState<ClipSuggestion | null>(null)
  const [editorTab, setEditorTab] = useState<EditorTab>('trim')
  const [editStart, setEditStart] = useState(0)
  const [editEnd, setEditEnd] = useState(30)
  const [aspectRatio, setAspectRatio] = useState('9:16')
  const [subtitleStyle, setSubtitleStyle] = useState('clean')
  const [fontSize, setFontSize] = useState(58)
  const [captionColor, setCaptionColor] = useState('#FFFFFF')
  const [captionPosition, setCaptionPosition] = useState('bottom')
  const [enableSubtitles, setEnableSubtitles] = useState(true)
  const [previewRender, setPreviewRender] = useState(false)

  const [showJobBanner, setShowJobBanner] = useState(false)
  const [toast, setToast] = useState<{ id: number; title: string; subtitle: string } | null>(null)
  const prevTranscribingRef = useRef(false)
  const prevGeneratingClipsRef = useRef(false)
  const pendingClipsToastRef = useRef(false)
  const bannerTimerRef = useRef<number | null>(null)
  const toastTimerRef = useRef<number | null>(null)

  const hasTranscript = Boolean(transcript)
  const isTranscribing =
    job?.job_type === 'transcribe' && (job.status === 'queued' || job.status === 'processing')
  const isGeneratingClips =
    job?.job_type === 'detect_highlights' && (job.status === 'queued' || job.status === 'processing')

  const showToast = (title: string, subtitle: string) => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
    setToast({ id: Date.now(), title, subtitle })
    toastTimerRef.current = window.setTimeout(() => setToast(null), 4000)
  }

  useEffect(() => {
    if (prevTranscribingRef.current && !isTranscribing && job?.status === 'completed') {
      showToast(
        'Transcription complete',
        'Transcript ready — click Get Clips to generate highlights.',
      )
    }
    prevTranscribingRef.current = isTranscribing
  }, [isTranscribing, job?.status])

  useEffect(() => {
    if (prevGeneratingClipsRef.current && !isGeneratingClips && job?.status === 'completed') {
      pendingClipsToastRef.current = true
    }
    prevGeneratingClipsRef.current = isGeneratingClips
  }, [isGeneratingClips, job?.status])

  useEffect(() => {
    if (pendingClipsToastRef.current) {
      pendingClipsToastRef.current = false
      showToast(`${clips.length} clips generated`, 'Ready to preview and export.')
    }
  }, [clips])

  useEffect(() => {
    if (!job) {
      setShowJobBanner(false)
      return
    }
    if (bannerTimerRef.current) {
      window.clearTimeout(bannerTimerRef.current)
      bannerTimerRef.current = null
    }
    setShowJobBanner(true)
    if (job.status === 'completed') {
      bannerTimerRef.current = window.setTimeout(() => {
        setShowJobBanner(false)
      }, 3000)
    }
    return () => {
      if (bannerTimerRef.current) window.clearTimeout(bannerTimerRef.current)
    }
  }, [job])

  const segments: TranscriptSegment[] = useMemo(() => {
    if (!transcript) return []
    try {
      return JSON.parse(transcript.transcript_data) as TranscriptSegment[]
    } catch {
      return []
    }
  }, [transcript])

  const sortedClips = useMemo(
    () => [...clips].sort((a, b) => b.score - a.score || a.start_time - b.start_time),
    [clips],
  )

  const activeCaption = useMemo(() => {
    if (!enableSubtitles || segments.length === 0) return ''
    const seg = segments.find((s) => currentTime >= s.start && currentTime <= s.end)
    return seg?.text ?? ''
  }, [enableSubtitles, segments, currentTime])

  const loadProjectExtras = async (id: number) => {
    const [t, c] = await Promise.all([
      api.getTranscript(id).catch(() => null),
      api.listClips(id).catch(() => []),
    ])
    setTranscript(t)
    setClips(c)
  }

  useEffect(() => {
    Promise.all([api.getSettings(), api.listOllamaModels()])
      .then(([s, m]) => {
        setMinClipSec(s.default_clip_min_seconds)
        setMaxClipSec(s.default_clip_max_seconds)
        setSelectedModel(s.ollama_model)
        setOllamaModels(m.models)
      })
      .catch(() => { })
  }, [])

  useEffect(() => {
    if (!projectId) {
      const savedId = window.localStorage.getItem('clipmagic_last_project_id')
      if (savedId) {
        navigate(`/create/${savedId}`, { replace: true })
      }
      return
    }
    let active = true
    const id = Number(projectId)
    window.localStorage.setItem('clipmagic_last_project_id', String(id))
    api
      .getProject(id)
      .then((p) => {
        if (!active) return
        setProject(p)
        setError(null)
        loadProjectExtras(id)
      })
      .catch((err) => {
        if (active) {
          window.localStorage.removeItem('clipmagic_last_project_id')
          setError(err instanceof Error ? err.message : 'Failed to load project')
        }
      })
    return () => {
      active = false
    }
  }, [projectId, navigate])

  const seekTo = (seconds: number, autoplay = true) => {
    const v = videoRef.current
    if (!v) return
    v.currentTime = Math.max(0, seconds)
    if (autoplay) {
      v.play().catch(() => { })
    }
  }

  const handleFilePick = (file: File | undefined) => {
    if (!file) return
    const lower = file.name.toLowerCase()
    const valid = ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext))
    if (!valid) {
      setError(`Unsupported file format. Please select ${ACCEPTED_EXTENSIONS.join(', ')}.`)
      return
    }
    setError(null)
    setSelectedFile(file)
    if (!projectName.trim()) {
      setProjectName(file.name.replace(/\.[^/.]+$/, ''))
    }
  }

  const watchJob = (initialJob: JobItem, onComplete: () => void) => {
    setJob(initialJob)
    api.subscribeToJob(
      initialJob.id,
      (updatedJob) => {
        setJob(updatedJob)
        if (updatedJob.status === 'completed') {
          onComplete()
        }
      },
      () => setError('Lost connection to job progress stream.'),
    )
  }

  const handleUpload = async () => {
    if (!selectedFile) return
    setUploading(true)
    setError(null)
    try {
      const res = await api.uploadVideo(selectedFile, projectName, category)
      setProject(res.project)
      navigate(`/create/${res.project.id}`, { replace: true })
      watchJob(res.job, () => {
        api.getProject(res.project.id).then(setProject).catch(() => { })
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const handleTranscribe = async () => {
    if (!project) return
    setError(null)
    try {
      const j = await api.startTranscription(project.id)
      watchJob(j, () => {
        loadProjectExtras(project.id)
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start transcription')
    }
  }

  const handleDetectHighlights = async () => {
    if (!project) return
    setError(null)
    try {
      const j = await api.detectHighlights(project.id, minClipSec, maxClipSec, selectedModel)
      watchJob(j, () => {
        loadProjectExtras(project.id)
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start highlight detection')
    }
  }

  const handleAddManualClip = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!project) return
    setError(null)
    try {
      const created = await api.createManualClip(project.id, {
        title: manualTitle || 'Manual Clip',
        start_time: manualStart,
        end_time: manualEnd,
        category: project.category,
      })
      setClips((prev) => [...prev, created])
      setManualTitle('')
      setShowManualForm(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add manual clip')
    }
  }

  const handleClipStatus = async (clipId: number, status: 'approved' | 'rejected') => {
    const updated = await api.updateClip(clipId, { status })
    setClips((prev) => prev.map((c) => (c.id === clipId ? updated : c)))
  }

  const handleDeleteClip = async (clipId: number) => {
    await api.deleteClip(clipId)
    if (editingClip?.id === clipId) setEditingClip(null)
    setClips((prev) => prev.filter((c) => c.id !== clipId))
  }

  const handleCancelJob = async () => {
    if (!job) return
    const updated = await api.cancelJob(job.id)
    setJob(updated)
  }

  const openEditor = (clip: ClipSuggestion) => {
    setEditingClip(clip)
    setEditorTab('trim')
    setEditStart(clip.start_time)
    setEditEnd(clip.end_time)
    window.setTimeout(() => seekTo(clip.start_time, false), 50)
  }

  const handleSaveTrim = async () => {
    if (!editingClip) return
    const updated = await api.updateClip(editingClip.id, {
      start_time: editStart,
      end_time: editEnd,
    })
    setEditingClip(updated)
    setClips((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
  }

  const handleExportClip = async () => {
    if (!editingClip) return
    setError(null)
    try {
      await handleSaveTrim()
      const res = await api.exportClip(editingClip.id, {
        aspect_ratio: aspectRatio,
        subtitle_style: subtitleStyle,
        font_size: fontSize,
        caption_color: captionColor,
        caption_position: captionPosition,
        enable_subtitles: enableSubtitles,
        preview: previewRender,
      })
      watchJob(res.job, () => {
        navigate('/exports')
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start export')
    }
  }

  const resetStudio = (targetPath: string) => {
    setEditingClip(null)
    setProject(null)
    setJob(null)
    setTranscript(null)
    setClips([])
    setSelectedFile(null)
    setProjectName('')
    window.localStorage.removeItem('clipmagic_last_project_id')
    navigate(targetPath)
  }

  // STAGE 1: IMPORT VIDEO
  if (!project) {
    return (
      <div className="mx-auto max-w-4xl space-y-8 p-10">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-100">
            Turn long videos into viral shorts
          </h1>
          <p className="mt-2 text-base text-zinc-400">
            Drop a local video file to transcribe, find standout moments, and export 9:16 clips.
          </p>
        </div>

        {error && (
          <div className="flex items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3.5 text-sm text-red-300">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="rounded-2xl border border-zinc-800 bg-[#111113] p-8 space-y-6">
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragActive(true)
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragActive(false)
              handleFilePick(e.dataTransfer.files?.[0])
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed py-16 px-6 text-center transition-colors ${dragActive
              ? 'border-zinc-100 bg-zinc-100/5'
              : 'border-zinc-700 bg-[#09090b] hover:border-zinc-500'
              }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".mp4,.mov,.mkv,.webm"
              className="hidden"
              onChange={(e) => handleFilePick(e.target.files?.[0])}
            />
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-zinc-800/80 text-zinc-200">
              <Upload className="h-7 w-7" />
            </div>
            <h2 className="mt-4 text-lg font-medium text-zinc-100">
              {selectedFile ? selectedFile.name : 'Drop your video here, or click to browse'}
            </h2>
            <p className="mt-1.5 text-sm text-zinc-400">
              {selectedFile
                ? `${formatBytes(selectedFile.size)} · Ready to import`
                : 'MP4, MOV, MKV, WEBM · 100% private & local'}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-zinc-300">Project Name</label>
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="e.g. Podcast Episode 42"
                className="mt-2 w-full rounded-xl border border-zinc-700 bg-[#09090b] px-4 py-3 text-base text-zinc-100 placeholder:text-zinc-600"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300">Content Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="mt-2 w-full rounded-xl border border-zinc-700 bg-[#09090b] px-4 py-3 text-base text-zinc-100"
              >
                {CONTENT_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            type="button"
            disabled={!selectedFile || uploading}
            onClick={handleUpload}
            className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-zinc-50 px-6 py-3.5 text-base font-semibold text-zinc-950 hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {uploading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Uploading Video...
              </>
            ) : (
              <>
                <Film className="h-5 w-5" />
                Import & Continue
              </>
            )}
          </button>
        </div>
      </div>
    )
  }

  // STAGE 3: 3-COLUMN OPUSCLIP / KLAP CLIP EDITOR
  if (editingClip) {
    const previewContainerClass =
      aspectRatio === '9:16'
        ? 'aspect-[9/16] max-h-[540px]'
        : aspectRatio === '1:1'
          ? 'aspect-square max-h-[480px]'
          : 'aspect-video w-full max-w-xl'

    const captionPosClass =
      captionPosition === 'top'
        ? 'top-8'
        : captionPosition === 'middle'
          ? 'top-1/2 -translate-y-1/2'
          : 'bottom-14'

    return (
      <div className="flex h-full flex-col bg-[#09090b]">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800 bg-[#111113] px-6 py-3.5">
          <div className="flex items-center gap-4 min-w-0">
            <button
              type="button"
              onClick={() => setEditingClip(null)}
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3.5 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-800"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Clips
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold text-zinc-100">{editingClip.title}</h1>
              <div className="text-xs text-zinc-400">
                {formatDuration(editStart)} – {formatDuration(editEnd)} ({Math.max(0, Math.round(editEnd - editStart))}s)
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSaveTrim}
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-800"
            >
              Save Trim
            </button>
            <button
              type="button"
              onClick={handleExportClip}
              className="inline-flex items-center gap-2 rounded-lg bg-zinc-50 px-5 py-2 text-sm font-semibold text-zinc-950 hover:bg-zinc-200"
            >
              <Download className="h-4 w-4" />
              Export MP4
            </button>
          </div>
        </header>

        {job && job.status !== 'completed' && (
          <div className="border-b border-zinc-800 bg-[#111113] px-6 py-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-zinc-200">{job.message ?? 'Rendering...'}</span>
              <span className="font-mono text-zinc-200">{Math.round(job.progress)}%</span>
            </div>
          </div>
        )}

        <div className="grid flex-1 grid-cols-1 overflow-hidden lg:grid-cols-12">
          {/* Left Panel: Tabbed Toolset */}
          <div className="flex flex-col border-r border-zinc-800 bg-[#111113] lg:col-span-3">
            <div className="grid grid-cols-4 border-b border-zinc-800">
              {[
                { id: 'trim', label: 'Trim', icon: Scissors },
                { id: 'ratio', label: 'Ratio', icon: Crop },
                { id: 'captions', label: 'Captions', icon: Captions },
                { id: 'export', label: 'Export', icon: Download },
              ].map((t) => {
                const Icon = t.icon
                const active = editorTab === t.id
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setEditorTab(t.id as EditorTab)}
                    className={`flex flex-col items-center gap-1 py-3.5 text-xs font-medium border-b-2 transition-colors ${active
                      ? 'border-zinc-100 text-zinc-200 bg-zinc-900/60'
                      : 'border-transparent text-zinc-400 hover:text-zinc-200'
                      }`}
                  >
                    <Icon className="h-4 w-4" />
                    {t.label}
                  </button>
                )
              })}
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {editorTab === 'trim' && (
                <div className="space-y-4">
                  <h2 className="text-sm font-semibold text-zinc-200">Clip Boundaries</h2>
                  <div>
                    <label className="block text-sm text-zinc-400">Start Time (seconds)</label>
                    <input
                      type="number"
                      step="0.5"
                      min={0}
                      value={editStart}
                      onChange={(e) => setEditStart(Number(e.target.value))}
                      className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-[#09090b] px-3.5 py-2.5 text-base text-zinc-100"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-zinc-400">End Time (seconds)</label>
                    <input
                      type="number"
                      step="0.5"
                      min={1}
                      value={editEnd}
                      onChange={(e) => setEditEnd(Number(e.target.value))}
                      className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-[#09090b] px-3.5 py-2.5 text-base text-zinc-100"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => seekTo(editStart, true)}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 py-2.5 text-sm font-medium text-zinc-100 hover:bg-zinc-800"
                  >
                    <Play className="h-4 w-4" />
                    Preview from Start
                  </button>
                </div>
              )}

              {editorTab === 'ratio' && (
                <div className="space-y-3">
                  <h2 className="text-sm font-semibold text-zinc-200">Output Aspect Ratio</h2>
                  {[
                    { value: '9:16', label: '9:16 Vertical', desc: '1080×1920 · Shorts, Reels, TikTok' },
                    { value: '1:1', label: '1:1 Square', desc: '1080×1080 · LinkedIn, Instagram Feed' },
                    { value: '16:9', label: '16:9 Landscape', desc: '1920×1080 · YouTube Standard' },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setAspectRatio(opt.value)}
                      className={`w-full rounded-xl border p-3.5 text-left transition-colors ${aspectRatio === opt.value
                        ? 'border-zinc-100 bg-zinc-100/10'
                        : 'border-zinc-800 bg-[#09090b] hover:border-zinc-700'
                        }`}
                    >
                      <div className="text-sm font-semibold text-zinc-100">{opt.label}</div>
                      <div className="mt-0.5 text-xs text-zinc-400">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              )}

              {editorTab === 'captions' && (
                <div className="space-y-4">
                  <label className="flex items-center justify-between rounded-lg border border-zinc-800 bg-[#09090b] p-3.5 text-sm font-medium text-zinc-200">
                    <span>Enable Subtitles</span>
                    <input
                      type="checkbox"
                      checked={enableSubtitles}
                      onChange={(e) => setEnableSubtitles(e.target.checked)}
                      className="h-4 w-4 accent-zinc-100"
                    />
                  </label>

                  <div>
                    <label className="block text-sm text-zinc-400">Caption Style</label>
                    <select
                      value={subtitleStyle}
                      onChange={(e) => setSubtitleStyle(e.target.value)}
                      className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-[#09090b] px-3.5 py-2.5 text-sm text-zinc-100"
                    >
                      <option value="clean">Clean White</option>
                      <option value="bold_keywords">Bold Keywords</option>
                      <option value="karaoke">Karaoke Word Highlight</option>
                      <option value="minimal">Minimal</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm text-zinc-400">Position</label>
                    <select
                      value={captionPosition}
                      onChange={(e) => setCaptionPosition(e.target.value)}
                      className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-[#09090b] px-3.5 py-2.5 text-sm text-zinc-100"
                    >
                      <option value="bottom">Bottom</option>
                      <option value="middle">Middle</option>
                      <option value="top">Top</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm text-zinc-400">Font Size</label>
                      <input
                        type="number"
                        min={24}
                        max={96}
                        value={fontSize}
                        onChange={(e) => setFontSize(Number(e.target.value))}
                        className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-[#09090b] px-3 py-2 text-sm text-zinc-100"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-zinc-400">Colour</label>
                      <input
                        type="color"
                        value={captionColor}
                        onChange={(e) => setCaptionColor(e.target.value)}
                        className="mt-1.5 h-10 w-full cursor-pointer rounded-lg border border-zinc-700 bg-[#09090b] p-1"
                      />
                    </div>
                  </div>
                </div>
              )}

              {editorTab === 'export' && (
                <div className="space-y-4">
                  <h2 className="text-sm font-semibold text-zinc-200">Render Options</h2>
                  <label className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-[#09090b] p-3.5 text-sm text-zinc-200">
                    <input
                      type="checkbox"
                      checked={previewRender}
                      onChange={(e) => setPreviewRender(e.target.checked)}
                      className="h-4 w-4 accent-zinc-100"
                    />
                    <span>Fast 50% preview render</span>
                  </label>
                  <button
                    type="button"
                    onClick={handleExportClip}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-100 py-3 text-sm font-semibold text-zinc-950 hover:bg-white"
                  >
                    <Download className="h-4 w-4" />
                    Render & Export MP4
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Center Panel: Live 9:16 / 1:1 / 16:9 Canvas */}
          <div className="flex flex-col items-center justify-center bg-[#09090b] p-6 lg:col-span-5">
            <div className={`relative overflow-hidden rounded-2xl border border-zinc-800 bg-black shadow-2xl ${previewContainerClass}`}>
              <video
                ref={videoRef}
                key={project.id}
                src={`/api/projects/${project.id}/video`}
                controls
                onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                className="h-full w-full object-cover"
              />
              {enableSubtitles && activeCaption && (
                <div
                  className={`pointer-events-none absolute inset-x-4 text-center px-3 py-1.5 font-bold drop-shadow-[0_2px_4px_rgba(0,0,0,0.95)] ${captionPosClass}`}
                  style={{ color: captionColor, fontSize: `${Math.max(14, Math.round(fontSize * 0.34))}px` }}
                >
                  {activeCaption}
                </div>
              )}
            </div>
            <div className="mt-3 text-xs text-zinc-500">
              Previewing {aspectRatio} · Centre-cropped on export
            </div>
          </div>

          {/* Right Panel: Interactive Transcript */}
          <div className="flex flex-col border-l border-zinc-800 bg-[#111113] lg:col-span-4">
            <div className="border-b border-zinc-800 px-5 py-4">
              <h2 className="text-base font-semibold text-zinc-100">Transcript</h2>
              <p className="text-xs text-zinc-400">Click any line to jump the playhead</p>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-1.5">
              {segments.length === 0 ? (
                <div className="py-10 text-center text-sm text-zinc-500">No transcript yet.</div>
              ) : (
                segments.map((seg) => {
                  const inClip = seg.end >= editStart && seg.start <= editEnd
                  return (
                    <button
                      key={seg.id}
                      type="button"
                      onClick={() => seekTo(seg.start)}
                      className={`flex w-full items-start gap-3 rounded-lg p-3 text-left text-[15px] transition-colors ${inClip ? 'bg-zinc-100/10 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-800/50'
                        }`}
                    >
                      <span className="shrink-0 font-mono text-xs text-zinc-200 pt-1">
                        {formatDuration(seg.start)}
                      </span>
                      <span className="leading-relaxed">{seg.text}</span>
                    </button>
                  )
                })
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // STAGE 2: RANKED CLIPS FEED (KLAP / OPUSCLIP RESULTS VIEW)
  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800 bg-[#111113] px-8 py-4">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold text-zinc-100">{project.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-zinc-400">
            <span>{project.category}</span>
            <span>·</span>
            <span>{formatDuration(project.duration)}</span>
            <span>·</span>
            <span>{project.resolution ?? 'Detecting...'}</span>
            <span>·</span>
            <span>{formatBytes(project.file_size)}</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => resetStudio('/projects')}
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-800"
          >
            Save & Exit
          </button>
          <button
            type="button"
            onClick={() => resetStudio('/projects')}
            className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-300 hover:bg-red-500/20"
          >
            Discard & Exit
          </button>
          <button
            type="button"
            onClick={() => resetStudio('/create')}
            className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-700"
          >
            New Video
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-8 space-y-6">
        {error && (
          <div className="flex items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3.5 text-sm text-red-300">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {job && showJobBanner && (
          <div className="rounded-xl border border-zinc-800 bg-[#111113] p-4 transition-opacity duration-300">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2.5">
                {job.status === 'failed' || job.status === 'cancelled' ? (
                  <XCircle className="h-5 w-5 text-red-400" />
                ) : job.status === 'completed' ? (
                  <CheckCircle2 className="h-5 w-5 text-zinc-100" />
                ) : (
                  <Loader2 className="h-5 w-5 animate-spin text-zinc-200" />
                )}
                <span className="font-medium text-zinc-100">
                  {job.status === 'completed' && job.job_type === 'transcribe'
                    ? 'Transcription complete'
                    : (job.message ?? 'Processing...')}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-zinc-300">
                  {job.status === 'completed' ? '100%' : `${Math.round(job.progress)}%`}
                </span>
                {(job.status === 'queued' || job.status === 'processing') && (
                  <button
                    type="button"
                    onClick={handleCancelJob}
                    className="rounded-md border border-zinc-700 px-3 py-1 text-xs font-medium text-zinc-300 hover:bg-zinc-800"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-zinc-800">
              <div
                className={`h-full transition-all ${job.status === 'failed' ? 'bg-red-500' : 'bg-zinc-100'}`}
                style={{ width: `${job.status === 'completed' ? 100 : Math.min(100, Math.max(0, job.progress))}%` }}
              />
            </div>
            {job.error_message && <p className="mt-2 text-sm text-red-400">{job.error_message}</p>}
          </div>
        )}

        {/* Action Strip */}
        <div className="flex flex-wrap items-end justify-between gap-4 rounded-xl border border-zinc-800 bg-[#111113] p-5">
          <div className="flex flex-wrap items-end gap-4">
            <button
              type="button"
              disabled={isTranscribing}
              onClick={handleTranscribe}
              className={`h-9 px-3.5 rounded-md border text-sm font-medium inline-flex items-center gap-2 transition ${
                isTranscribing
                  ? 'cursor-not-allowed bg-zinc-900 text-zinc-500 border-zinc-800'
                  : 'bg-zinc-800 hover:bg-zinc-700/80 border-zinc-700 text-zinc-100'
              }`}
            >
              {isTranscribing ? (
                <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />
              ) : (
                <MessageSquareText className="h-4 w-4 text-zinc-200" />
              )}
              {isTranscribing ? 'Transcribing...' : hasTranscript ? 'Re-transcribe' : '1. Transcribe'}
            </button>

            <div>
              <label className="block text-xs font-medium text-zinc-400">AI Model</label>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="mt-1 rounded-lg border border-zinc-700 bg-[#09090b] px-3 py-2 text-sm text-zinc-100"
              >
                {ollamaModels.length === 0 ? (
                  <option value={selectedModel || 'qwen3.5:4b'}>{selectedModel || 'qwen3.5:4b'}</option>
                ) : (
                  ollamaModels.map((m) => (
                    <option key={m.name} value={m.name}>
                      {m.name} {m.is_cloud ? '(cloud)' : '(local)'}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div className="flex items-end gap-2">
              <div>
                <label className="block text-xs font-medium text-zinc-400">Min (s)</label>
                <input
                  type="number"
                  min={5}
                  max={120}
                  value={minClipSec}
                  onChange={(e) => setMinClipSec(Number(e.target.value))}
                  className="mt-1 w-20 rounded-lg border border-zinc-700 bg-[#09090b] px-3 py-2 text-sm text-zinc-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-400">Max (s)</label>
                <input
                  type="number"
                  min={10}
                  max={180}
                  value={maxClipSec}
                  onChange={(e) => setMaxClipSec(Number(e.target.value))}
                  className="mt-1 w-20 rounded-lg border border-zinc-700 bg-[#09090b] px-3 py-2 text-sm text-zinc-100"
                />
              </div>
            </div>

            <button
              type="button"
              disabled={!hasTranscript || isGeneratingClips}
              onClick={handleDetectHighlights}
              className={`h-9 px-4 rounded-md text-sm inline-flex items-center gap-2 transition ${
                !hasTranscript || isGeneratingClips
                  ? 'bg-zinc-900 border border-zinc-800 text-zinc-500 cursor-not-allowed font-medium'
                  : 'bg-zinc-100 hover:bg-white text-zinc-950 font-medium shadow-sm'
              }`}
            >
              {isGeneratingClips ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Scissors className="h-4 w-4" />
              )}
              {isGeneratingClips ? 'Generating...' : 'Get Clips'}
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowManualForm((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3.5 py-2.5 text-sm font-medium text-zinc-300 hover:bg-zinc-800"
          >
            <Plus className="h-4 w-4" />
            Manual Clip
          </button>
        </div>

        {showManualForm && (
          <form
            onSubmit={handleAddManualClip}
            className="grid grid-cols-1 gap-3 rounded-xl border border-zinc-800 bg-[#111113] p-5 sm:grid-cols-12 sm:items-end"
          >
            <div className="sm:col-span-6">
              <label className="block text-xs font-medium text-zinc-400">Clip Title</label>
              <input
                type="text"
                placeholder="e.g. Key takeaway"
                value={manualTitle}
                onChange={(e) => setManualTitle(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-[#09090b] px-3.5 py-2 text-sm text-zinc-100"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-zinc-400">Start (s)</label>
              <input
                type="number"
                step="0.5"
                min={0}
                value={manualStart}
                onChange={(e) => setManualStart(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-[#09090b] px-3 py-2 text-sm text-zinc-100"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-zinc-400">End (s)</label>
              <input
                type="number"
                step="0.5"
                min={1}
                value={manualEnd}
                onChange={(e) => setManualEnd(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-[#09090b] px-3 py-2 text-sm text-zinc-100"
              />
            </div>
            <button
              type="submit"
              className="sm:col-span-2 rounded-lg bg-zinc-50 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-zinc-200"
            >
              Add Clip
            </button>
          </form>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Ranked Clips Feed */}
          <div className="space-y-4 lg:col-span-7">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-zinc-100">
                Generated Clips ({sortedClips.length})
              </h2>
            </div>

            {sortedClips.length === 0 ? (
              <div className="rounded-xl border border-zinc-800 bg-[#111113] p-12 text-center text-sm text-zinc-400">
                {isTranscribing
                  ? 'Transcribing audio... You can generate clips once transcription finishes.'
                  : hasTranscript
                    ? 'Transcript ready. Set your min/max duration and click "Get Clips" above.'
                    : 'Click "1. Transcribe" above to transcribe your video first.'}
              </div>
            ) : (
              sortedClips.map((clip) => (
                <div
                  key={clip.id}
                  className="rounded-xl border border-zinc-800 bg-[#111113] p-5 space-y-3"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2.5">
                        <span className="rounded-md bg-zinc-100/15 px-2.5 py-0.5 text-xs font-semibold text-zinc-200">
                          Score {Math.round(clip.score)}
                        </span>
                        <span className="text-sm font-mono text-zinc-400">
                          {formatDuration(clip.start_time)} – {formatDuration(clip.end_time)} (
                          {Math.round(clip.end_time - clip.start_time)}s)
                        </span>
                      </div>
                      <h3 className="mt-2 text-lg font-semibold text-zinc-100">{clip.title}</h3>
                    </div>
                    <span
                      className={`rounded-md px-2.5 py-1 text-xs font-medium ${clip.status === 'approved'
                        ? 'bg-zinc-800 text-zinc-100'
                        : clip.status === 'rejected'
                          ? 'bg-red-500/15 text-red-400'
                          : 'bg-zinc-800 text-zinc-400'
                        }`}
                    >
                      {clip.status}
                    </span>
                  </div>

                  <p className="text-sm text-zinc-300 leading-relaxed">{clip.reason}</p>

                  <div className="flex flex-wrap items-center gap-2.5 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setRightTab('player')
                        seekTo(clip.start_time)
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3.5 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-800"
                    >
                      <Play className="h-4 w-4" />
                      Preview
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditor(clip)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-50 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-zinc-200"
                    >
                      Open Editor
                    </button>
                    <button
                      type="button"
                      onClick={() => handleClipStatus(clip.id, 'approved')}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-400/30 px-3 py-2 text-sm text-zinc-100 hover:bg-zinc-800/70"
                    >
                      <Check className="h-4 w-4" />
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => handleClipStatus(clip.id, 'rejected')}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-800"
                    >
                      <X className="h-4 w-4" />
                      Reject
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteClip(clip.id)}
                      className="ml-auto rounded-lg p-2 text-zinc-500 hover:text-red-400"
                      title="Delete clip"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Sticky Right Monitor / Transcript Switcher */}
          <div className="lg:col-span-5">
            <div className="sticky top-6 overflow-hidden rounded-xl border border-zinc-800 bg-[#111113]">
              <div className="grid grid-cols-2 border-b border-zinc-800">
                <button
                  type="button"
                  onClick={() => setRightTab('player')}
                  className={`py-3 text-sm font-medium border-b-2 ${rightTab === 'player'
                    ? 'border-zinc-100 text-zinc-200 bg-zinc-900/50'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                    }`}
                >
                  Source Video
                </button>
                <button
                  type="button"
                  onClick={() => setRightTab('transcript')}
                  className={`py-3 text-sm font-medium border-b-2 ${rightTab === 'transcript'
                    ? 'border-zinc-100 text-zinc-200 bg-zinc-900/50'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                    }`}
                >
                  Transcript ({segments.length})
                </button>
              </div>

              {rightTab === 'player' ? (
                <div className="bg-black">
                  <video
                    ref={videoRef}
                    key={project.id}
                    src={`/api/projects/${project.id}/video`}
                    controls
                    className="aspect-video max-h-[460px] w-full"
                  />
                </div>
              ) : (
                <div className="max-h-[460px] overflow-y-auto p-4 space-y-1.5">
                  {segments.length === 0 ? (
                    <div className="py-12 text-center text-sm text-zinc-500">
                      No transcript generated yet.
                    </div>
                  ) : (
                    segments.map((seg) => (
                      <button
                        key={seg.id}
                        type="button"
                        onClick={() => {
                          setRightTab('player')
                          seekTo(seg.start)
                        }}
                        className="flex w-full items-start gap-3 rounded-lg p-2.5 text-left text-[15px] hover:bg-zinc-800/60"
                      >
                        <span className="shrink-0 font-mono text-xs text-zinc-200 pt-1">
                          {formatDuration(seg.start)}
                        </span>
                        <span className="text-zinc-200 leading-relaxed">{seg.text}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {toast && (
        <div
          key={toast.id}
          className="fixed bottom-5 right-5 z-50 bg-zinc-900 border border-zinc-800 text-zinc-100 rounded-lg px-4 py-3 shadow-lg flex items-center gap-3 text-sm"
        >
          <CheckCircle2 className="h-5 w-5 shrink-0 text-zinc-100" />
          <div className="min-w-0">
            <div className="font-medium text-zinc-100">{toast.title}</div>
            <div className="text-zinc-400 text-xs">{toast.subtitle}</div>
          </div>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="ml-2 rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
            aria-label="Close notification"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  )
}
