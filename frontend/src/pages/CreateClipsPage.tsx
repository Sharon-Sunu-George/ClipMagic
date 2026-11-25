import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeft,
  Captions,
  Check,
  CheckCircle2,
  Copy,
  Crop,
  Download,
  Film,
  Loader2,
  MessageSquareText,
  Pause,
  Play,
  Plus,
  Repeat,
  Scissors,
  Trash2,
  Upload,
  Volume2,
  VolumeX,
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
  const [ratioPreset, setRatioPreset] = useState<'9:16' | '16:9' | '1:1' | '4:5' | 'custom'>('9:16')
  const [ratioW, setRatioW] = useState(9)
  const [ratioH, setRatioH] = useState(16)
  const [zoom, setZoom] = useState(1.0)
  const [panX, setPanX] = useState(0)
  const [panY, setPanY] = useState(0)
  const [bgMode, setBgMode] = useState<'black' | 'blur'>('black')
  const [subtitleStyle, setSubtitleStyle] = useState('clean')
  const [fontSize, setFontSize] = useState(58)
  const [captionColor, setCaptionColor] = useState('#FFFFFF')
  const [captionPosition, setCaptionPosition] = useState('bottom')
  const [captionX, setCaptionX] = useState(50)
  const [captionY, setCaptionY] = useState(82)
  const [enableSubtitles, setEnableSubtitles] = useState(true)
  const [previewRender, setPreviewRender] = useState(false)
  const [exportResolutionP, setExportResolutionP] = useState(1080)
  const [exportFps, setExportFps] = useState<number | null>(null)
  const [loopClip, setLoopClip] = useState(true)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [previewingClip, setPreviewingClip] = useState<ClipSuggestion | null>(null)
  const [batchProgress, setBatchProgress] = useState<string | null>(null)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [draggingHandle, setDraggingHandle] = useState<'start' | 'end' | null>(null)
  const trimTrackRef = useRef<HTMLDivElement>(null)
  const frameBoxRef = useRef<HTMLDivElement>(null)
  const blurVideoRef = useRef<HTMLVideoElement>(null)
  const dragFramingRef = useRef<{
    startX: number
    startY: number
    origPanX: number
    origPanY: number
  } | null>(null)
  const dragCaptionRef = useRef<{
    startX: number
    startY: number
    origCapX: number
    origCapY: number
  } | null>(null)

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

  const approvedClips = useMemo(
    () => sortedClips.filter((c) => c.status === 'approved'),
    [sortedClips],
  )

  const activeBounds = useMemo(() => {
    if (editingClip) return { start: editStart, end: editEnd }
    if (previewingClip) return { start: previewingClip.start_time, end: previewingClip.end_time }
    return null
  }, [editingClip, editStart, editEnd, previewingClip])

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

  const handleVideoTimeUpdate = (time: number) => {
    setCurrentTime(time)
    if (!activeBounds) return
    const v = videoRef.current
    if (!v) return
    if (time >= activeBounds.end) {
      if (loopClip) {
        v.currentTime = activeBounds.start
        if (v.paused) {
          v.play().catch(() => { })
        }
      } else if (!v.paused) {
        v.pause()
      }
    }
  }

  useEffect(() => {
    if (!activeBounds) return
    let rafId = 0
    const tick = () => {
      const v = videoRef.current
      if (v && !v.paused && !v.ended) {
        setCurrentTime(v.currentTime)
        if (v.currentTime >= activeBounds.end) {
          if (loopClip) {
            v.currentTime = activeBounds.start
          } else {
            v.pause()
          }
        }
      }
      rafId = window.requestAnimationFrame(tick)
    }
    rafId = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(rafId)
  }, [activeBounds, loopClip])

  const projectDuration = project?.duration && project.duration > 0 ? project.duration : Math.max(editEnd, 60)

  const updateEditStart = (next: number) => {
    const clamped = Math.max(0, Math.min(next, editEnd - 1))
    setEditStart(Number(clamped.toFixed(1)))
  }

  const updateEditEnd = (next: number) => {
    const clamped = Math.min(projectDuration, Math.max(next, editStart + 1))
    setEditEnd(Number(clamped.toFixed(1)))
  }

  useEffect(() => {
    if (!draggingHandle) return
    const onMove = (e: MouseEvent) => {
      const track = trimTrackRef.current
      if (!track) return
      const rect = track.getBoundingClientRect()
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
      const t = ratio * projectDuration
      if (draggingHandle === 'start') {
        updateEditStart(t)
      } else {
        updateEditEnd(t)
      }
    }
    const onUp = () => setDraggingHandle(null)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [draggingHandle, projectDuration, editStart, editEnd])

  const handleCopyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedKey(key)
      window.setTimeout(() => {
        setCopiedKey((prev) => (prev === key ? null : prev))
      }, 2000)
    } catch {
      // ignore clipboard errors
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

  const applyRecommendedFraming = () => {
    setRatioPreset('9:16')
    setRatioW(9)
    setRatioH(16)
    const isLandscape = (project?.width ?? 16) > (project?.height ?? 9)
    if (isLandscape) {
      setBgMode('blur')
      setZoom(1.35)
    } else {
      setBgMode('black')
      setZoom(1.0)
    }
    setPanX(0)
    setPanY(0)
  }

  const openEditor = (clip: ClipSuggestion) => {
    setEditingClip(clip)
    setEditorTab('trim')
    setEditStart(clip.start_time)
    setEditEnd(clip.end_time)
    setIsPlaying(false)
    applyRecommendedFraming()
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
        aspect_ratio: ratioPreset === 'custom' ? `${ratioW}:${ratioH}` : ratioPreset,
        ratio_w: ratioW,
        ratio_h: ratioH,
        zoom,
        pan_x: panX,
        pan_y: panY,
        bg_mode: bgMode,
        resolution_p: exportResolutionP,
        fps: exportFps,
        subtitle_style: subtitleStyle,
        font_size: fontSize,
        caption_color: captionColor,
        caption_position: captionPosition,
        caption_x: captionX,
        caption_y: captionY,
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

  const waitForJobCompletion = (jobId: number): Promise<JobItem> =>
    new Promise((resolve, reject) => {
      api.subscribeToJob(
        jobId,
        (updated) => {
          setJob(updated)
          if (updated.status === 'completed') resolve(updated)
          else if (updated.status === 'failed' || updated.status === 'cancelled') {
            reject(new Error(updated.error_message || `Job ${updated.status}`))
          }
        },
        () => reject(new Error('Lost connection to export stream')),
      )
    })

  const handleBatchExport = async () => {
    if (approvedClips.length === 0 || batchProgress) return
    setError(null)
    let exportedCount = 0
    try {
      for (let i = 0; i < approvedClips.length; i += 1) {
        const clip = approvedClips[i]
        setBatchProgress(`Exporting ${i + 1}/${approvedClips.length}...`)
        const res = await api.exportClip(clip.id, {
          aspect_ratio: ratioPreset === 'custom' ? `${ratioW}:${ratioH}` : ratioPreset,
          ratio_w: ratioW,
          ratio_h: ratioH,
          zoom,
          pan_x: panX,
          pan_y: panY,
          bg_mode: bgMode,
          resolution_p: exportResolutionP,
          fps: exportFps,
          subtitle_style: subtitleStyle,
          font_size: fontSize,
          caption_color: captionColor,
          caption_position: captionPosition,
          caption_x: captionX,
          caption_y: captionY,
          enable_subtitles: enableSubtitles,
          preview: previewRender,
        })
        setJob(res.job)
        await waitForJobCompletion(res.job.id)
        exportedCount += 1
      }
      showToast('Batch export complete', `${exportedCount} approved clip(s) rendered to Exports.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Batch export failed')
    } finally {
      setBatchProgress(null)
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
    const selectRatioPreset = (preset: '9:16' | '16:9' | '1:1' | '4:5' | 'custom') => {
      setRatioPreset(preset)
      if (preset === '9:16') {
        setRatioW(9)
        setRatioH(16)
      } else if (preset === '16:9') {
        setRatioW(16)
        setRatioH(9)
      } else if (preset === '1:1') {
        setRatioW(1)
        setRatioH(1)
      } else if (preset === '4:5') {
        setRatioW(4)
        setRatioH(5)
      }
    }

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

        <div className="grid flex-1 min-h-0 grid-cols-1 overflow-hidden lg:grid-cols-12">
          {/* Left Panel: Tabbed Toolset */}
          <div className="flex min-h-0 flex-col border-r border-zinc-800 bg-[#111113] lg:col-span-3">
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
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-zinc-200">Clip Boundaries</h2>
                    <label className="inline-flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={loopClip}
                        onChange={(e) => setLoopClip(e.target.checked)}
                        className="h-3.5 w-3.5 accent-zinc-100"
                      />
                      <Repeat className="h-3.5 w-3.5 text-zinc-400" />
                      Loop Clip
                    </label>
                  </div>

                  {/* Dual-Thumb Visual Trim Scrubber */}
                  <div className="space-y-2">
                    <div
                      ref={trimTrackRef}
                      onClick={(e) => {
                        if (draggingHandle) return
                        const rect = e.currentTarget.getBoundingClientRect()
                        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
                        seekTo(ratio * projectDuration, false)
                      }}
                      className="relative h-9 cursor-pointer select-none rounded-md border border-zinc-800 bg-zinc-900"
                    >
                      {/* Selected Window */}
                      <div
                        className="absolute inset-y-0 border-y border-zinc-200/70 bg-zinc-100/15"
                        style={{
                          left: `${(editStart / projectDuration) * 100}%`,
                          width: `${Math.max(1, ((editEnd - editStart) / projectDuration) * 100)}%`,
                        }}
                      />
                      {/* Playhead Marker */}
                      <div
                        className="pointer-events-none absolute inset-y-0 w-0.5 bg-zinc-50"
                        style={{
                          left: `${Math.max(0, Math.min(100, (currentTime / projectDuration) * 100))}%`,
                        }}
                      />
                      {/* Left Handle */}
                      <button
                        type="button"
                        aria-label="Trim start handle"
                        onMouseDown={(e) => {
                          e.stopPropagation()
                          setDraggingHandle('start')
                        }}
                        className="absolute top-1/2 h-6 w-2.5 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize rounded-sm bg-zinc-100 shadow hover:bg-white"
                        style={{ left: `${(editStart / projectDuration) * 100}%` }}
                      />
                      {/* Right Handle */}
                      <button
                        type="button"
                        aria-label="Trim end handle"
                        onMouseDown={(e) => {
                          e.stopPropagation()
                          setDraggingHandle('end')
                        }}
                        className="absolute top-1/2 h-6 w-2.5 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize rounded-sm bg-zinc-100 shadow hover:bg-white"
                        style={{ left: `${(editEnd / projectDuration) * 100}%` }}
                      />
                    </div>
                    <div className="flex justify-between font-mono text-[11px] text-zinc-500">
                      <span>0:00</span>
                      <span>Playhead {formatDuration(currentTime)}</span>
                      <span>{formatDuration(projectDuration)}</span>
                    </div>
                  </div>

                  {/* Start Time + Nudge + Set In */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-sm text-zinc-400">Start (s)</label>
                      <button
                        type="button"
                        onClick={() => updateEditStart(videoRef.current?.currentTime ?? currentTime)}
                        className="rounded border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-xs font-medium text-zinc-100 hover:bg-zinc-700"
                      >
                        Set In
                      </button>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => updateEditStart(editStart - 0.5)}
                        className="rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-2 text-xs font-mono text-zinc-200 hover:bg-zinc-800"
                      >
                        -0.5s
                      </button>
                      <input
                        type="number"
                        step="0.5"
                        min={0}
                        value={editStart}
                        onChange={(e) => updateEditStart(Number(e.target.value))}
                        className="w-full rounded-md border border-zinc-700 bg-[#09090b] px-3 py-2 text-sm text-zinc-100"
                      />
                      <button
                        type="button"
                        onClick={() => updateEditStart(editStart + 0.5)}
                        className="rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-2 text-xs font-mono text-zinc-200 hover:bg-zinc-800"
                      >
                        +0.5s
                      </button>
                    </div>
                  </div>

                  {/* End Time + Nudge + Set Out */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-sm text-zinc-400">End (s)</label>
                      <button
                        type="button"
                        onClick={() => updateEditEnd(videoRef.current?.currentTime ?? currentTime)}
                        className="rounded border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-xs font-medium text-zinc-100 hover:bg-zinc-700"
                      >
                        Set Out
                      </button>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => updateEditEnd(editEnd - 0.5)}
                        className="rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-2 text-xs font-mono text-zinc-200 hover:bg-zinc-800"
                      >
                        -0.5s
                      </button>
                      <input
                        type="number"
                        step="0.5"
                        min={1}
                        value={editEnd}
                        onChange={(e) => updateEditEnd(Number(e.target.value))}
                        className="w-full rounded-md border border-zinc-700 bg-[#09090b] px-3 py-2 text-sm text-zinc-100"
                      />
                      <button
                        type="button"
                        onClick={() => updateEditEnd(editEnd + 0.5)}
                        className="rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-2 text-xs font-mono text-zinc-200 hover:bg-zinc-800"
                      >
                        +0.5s
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => seekTo(editStart, true)}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 py-2.5 text-sm font-medium text-zinc-100 hover:bg-zinc-800"
                  >
                    <Play className="h-4 w-4" />
                    Preview Clip Window
                  </button>
                </div>
              )}

              {editorTab === 'ratio' && (
                <div className="space-y-5">
                  <div className="space-y-2.5">
                    <h2 className="text-sm font-semibold text-zinc-200">Aspect Ratio</h2>
                    <div className="grid grid-cols-3 gap-2">
                      {(['9:16', '16:9', '1:1', '4:5', 'custom'] as const).map((preset) => {
                        const active = ratioPreset === preset
                        return (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => selectRatioPreset(preset)}
                            className={`rounded-md border px-2.5 py-2 text-xs font-medium capitalize transition ${
                              active
                                ? 'border-zinc-100 bg-zinc-100 text-zinc-950'
                                : 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-700'
                            }`}
                          >
                            {preset}
                          </button>
                        )
                      })}
                    </div>

                    {ratioPreset === 'custom' && (
                      <div className="grid grid-cols-2 gap-2.5 pt-1">
                        <div>
                          <label className="block text-xs text-zinc-400">Width (W)</label>
                          <input
                            type="number"
                            min={1}
                            max={64}
                            value={ratioW}
                            onChange={(e) => {
                              const w = Math.max(1, Number(e.target.value) || 1)
                              setRatioW(w)
                            }}
                            className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-zinc-400">Height (H)</label>
                          <input
                            type="number"
                            min={1}
                            max={64}
                            value={ratioH}
                            onChange={(e) => {
                              const h = Math.max(1, Number(e.target.value) || 1)
                              setRatioH(h)
                            }}
                            className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <h2 className="text-sm font-semibold text-zinc-200">Background Fill</h2>
                    <div className="grid grid-cols-2 gap-2">
                      {(['black', 'blur'] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setBgMode(mode)}
                          className={`rounded-md border px-3 py-2 text-xs font-medium capitalize transition ${
                            bgMode === mode
                              ? 'border-zinc-100 bg-zinc-100 text-zinc-950'
                              : 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-700'
                          }`}
                        >
                          {mode === 'black' ? 'Solid Black' : 'Blurred Video'}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-semibold text-zinc-200">Zoom</span>
                      <span className="font-mono text-xs text-zinc-400">{Math.round(zoom * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min={0.5}
                      max={3.0}
                      step={0.05}
                      value={zoom}
                      onChange={(e) => setZoom(Number(e.target.value))}
                      className="w-full accent-zinc-100"
                    />
                    <div className="flex items-center justify-between text-xs text-zinc-500">
                      <span>Pan X: {panX.toFixed(0)}%</span>
                      <span>Pan Y: {panY.toFixed(0)}%</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setZoom(1.0)
                        setPanX(0)
                        setPanY(0)
                      }}
                      className="w-full rounded-md border border-zinc-800 bg-zinc-900 py-2 text-xs font-medium text-zinc-200 hover:bg-zinc-800"
                    >
                      Reset Framing
                    </button>
                  </div>
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
                    <label className="block text-sm text-zinc-400">Position Preset</label>
                    <div className="mt-1.5 grid grid-cols-3 gap-2">
                      {[
                        { id: 'top', label: 'Top', y: 15 },
                        { id: 'middle', label: 'Middle', y: 50 },
                        { id: 'bottom', label: 'Bottom', y: 82 },
                      ].map((pos) => (
                        <button
                          key={pos.id}
                          type="button"
                          onClick={() => {
                            setCaptionPosition(pos.id)
                            setCaptionX(50)
                            setCaptionY(pos.y)
                          }}
                          className={`rounded-md border py-2 text-xs font-medium transition ${
                            captionPosition === pos.id
                              ? 'border-zinc-100 bg-zinc-100 text-zinc-950'
                              : 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-700'
                          }`}
                        >
                          {pos.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-xs text-zinc-400">
                      <span>Horizontal (X)</span>
                      <span className="font-mono">{captionX.toFixed(0)}%</span>
                    </div>
                    <input
                      type="range"
                      min={10}
                      max={90}
                      value={captionX}
                      onChange={(e) => setCaptionX(Number(e.target.value))}
                      className="w-full accent-zinc-100"
                    />
                    <div className="flex justify-between text-xs text-zinc-400">
                      <span>Vertical (Y)</span>
                      <span className="font-mono">{captionY.toFixed(0)}%</span>
                    </div>
                    <input
                      type="range"
                      min={10}
                      max={90}
                      value={captionY}
                      onChange={(e) => setCaptionY(Number(e.target.value))}
                      className="w-full accent-zinc-100"
                    />
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

                  <div>
                    <label className="block text-sm text-zinc-400">Resolution</label>
                    <select
                      value={exportResolutionP}
                      onChange={(e) => setExportResolutionP(Number(e.target.value))}
                      className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-[#09090b] px-3.5 py-2.5 text-sm text-zinc-100"
                    >
                      <option value={480}>480p (SD)</option>
                      <option value={720}>720p (HD)</option>
                      <option value={1080}>1080p (Full HD)</option>
                      <option value={1440}>1440p (2K)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm text-zinc-400">Frame Rate (FPS)</label>
                    <select
                      value={exportFps ?? ''}
                      onChange={(e) => setExportFps(e.target.value ? Number(e.target.value) : null)}
                      className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-[#09090b] px-3.5 py-2.5 text-sm text-zinc-100"
                    >
                      <option value="">Source FPS ({project.fps ? `${project.fps} fps` : 'Auto'})</option>
                      <option value={24}>24 fps (Cinema)</option>
                      <option value={30}>30 fps (Standard)</option>
                      <option value={60}>60 fps (Smooth)</option>
                    </select>
                  </div>

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

          {/* Center Panel: Live Framing & Aspect Ratio Canvas */}
          <div className="flex min-h-0 flex-col items-center justify-center overflow-hidden bg-[#09090b] p-4 lg:col-span-5">
            <div
              ref={frameBoxRef}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId)
                dragFramingRef.current = {
                  startX: e.clientX,
                  startY: e.clientY,
                  origPanX: panX,
                  origPanY: panY,
                }
              }}
              onPointerMove={(e) => {
                if (dragCaptionRef.current && frameBoxRef.current) {
                  const rect = frameBoxRef.current.getBoundingClientRect()
                  const dxPct = ((e.clientX - dragCaptionRef.current.startX) / rect.width) * 100
                  const dyPct = ((e.clientY - dragCaptionRef.current.startY) / rect.height) * 100
                  setCaptionX(Math.max(10, Math.min(90, Number((dragCaptionRef.current.origCapX + dxPct).toFixed(1)))))
                  setCaptionY(Math.max(10, Math.min(90, Number((dragCaptionRef.current.origCapY + dyPct).toFixed(1)))))
                  return
                }
                if (!dragFramingRef.current || !frameBoxRef.current) return
                const rect = frameBoxRef.current.getBoundingClientRect()
                const dxPct = ((e.clientX - dragFramingRef.current.startX) / rect.width) * 100
                const dyPct = ((e.clientY - dragFramingRef.current.startY) / rect.height) * 100
                setPanX(Math.max(-100, Math.min(100, Number((dragFramingRef.current.origPanX + dxPct).toFixed(1)))))
                setPanY(Math.max(-100, Math.min(100, Number((dragFramingRef.current.origPanY + dyPct).toFixed(1)))))
              }}
              onPointerUp={() => {
                dragFramingRef.current = null
                dragCaptionRef.current = null
              }}
              onWheel={(e) => {
                e.preventDefault()
                const delta = e.deltaY < 0 ? 0.08 : -0.08
                setZoom((z) => Math.max(0.5, Math.min(3.0, Number((z + delta).toFixed(2)))))
              }}
              style={{ aspectRatio: `${ratioW} / ${ratioH}` }}
              className="relative h-full max-h-[calc(100vh-210px)] max-w-full cursor-grab active:cursor-grabbing overflow-hidden rounded-2xl border border-zinc-800 bg-black shadow-2xl select-none"
            >
              {bgMode === 'blur' && (
                <video
                  ref={blurVideoRef}
                  src={`/api/projects/${project.id}/video`}
                  muted
                  playsInline
                  className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover opacity-75 blur-2xl"
                />
              )}
              <video
                ref={videoRef}
                key={`editor-${project.id}-${editingClip.id}`}
                src={`/api/projects/${project.id}/video`}
                muted={isMuted}
                playsInline
                preload="auto"
                onLoadedMetadata={(e) => {
                  e.currentTarget.currentTime = editStart
                  if (blurVideoRef.current) blurVideoRef.current.currentTime = editStart
                }}
                onPlay={() => {
                  setIsPlaying(true)
                  blurVideoRef.current?.play().catch(() => { })
                }}
                onPause={() => {
                  setIsPlaying(false)
                  blurVideoRef.current?.pause()
                }}
                onSeeked={(e) => {
                  if (blurVideoRef.current) blurVideoRef.current.currentTime = e.currentTarget.currentTime
                }}
                onTimeUpdate={(e) => handleVideoTimeUpdate(e.currentTarget.currentTime)}
                style={{ transform: `translate(${panX}%, ${panY}%) scale(${zoom})` }}
                className="relative z-10 h-full w-full object-contain transition-transform duration-75 pointer-events-none"
              />
              {enableSubtitles && activeCaption && (
                <div
                  onPointerDown={(e) => {
                    e.stopPropagation()
                    frameBoxRef.current?.setPointerCapture(e.pointerId)
                    dragCaptionRef.current = {
                      startX: e.clientX,
                      startY: e.clientY,
                      origCapX: captionX,
                      origCapY: captionY,
                    }
                  }}
                  title="Drag to move caption"
                  className="absolute z-20 max-w-[88%] -translate-x-1/2 -translate-y-1/2 cursor-move select-none px-2 py-1 text-center font-bold drop-shadow-[0_2px_4px_rgba(0,0,0,0.95)] hover:ring-1 hover:ring-zinc-400/60 rounded"
                  style={{
                    left: `${captionX}%`,
                    top: `${captionY}%`,
                    color: captionColor,
                    fontSize: `${Math.max(10, Math.round(((frameBoxRef.current?.clientHeight ?? 480) * fontSize) / 1920))}px`,
                  }}
                >
                  {activeCaption}
                </div>
              )}
            </div>

            {/* Fixed Transport Controls Bar (never moves with video pan/zoom) */}
            <div className="mt-3 flex w-full max-w-md items-center gap-3 rounded-lg border border-zinc-800 bg-[#111113] px-3.5 py-2">
              <button
                type="button"
                onClick={() => {
                  const v = videoRef.current
                  if (!v) return
                  if (v.paused) {
                    if (v.currentTime < editStart || v.currentTime >= editEnd) {
                      v.currentTime = editStart
                    }
                    v.play().catch(() => { })
                  } else {
                    v.pause()
                  }
                }}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-zinc-100 text-zinc-950 hover:bg-white"
                aria-label={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              </button>

              <span className="shrink-0 font-mono text-xs text-zinc-300">
                {formatDuration(currentTime)}
              </span>

              <input
                type="range"
                min={editStart}
                max={Math.max(editStart + 0.5, editEnd)}
                step={0.1}
                value={Math.max(editStart, Math.min(editEnd, currentTime))}
                onChange={(e) => seekTo(Number(e.target.value), false)}
                className="w-full accent-zinc-100 cursor-pointer"
              />

              <span className="shrink-0 font-mono text-xs text-zinc-500">
                {formatDuration(editEnd)}
              </span>

              <button
                type="button"
                onClick={() => setIsMuted((m) => !m)}
                className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                aria-label={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </button>
            </div>

            <div className="mt-2 text-xs text-zinc-500">
              {ratioW}:{ratioH} · Drag video to reframe · Scroll or slide to zoom ({Math.round(zoom * 100)}%)
            </div>
          </div>

          {/* Right Panel: Interactive Transcript */}
          <div className="flex min-h-0 flex-col border-l border-zinc-800 bg-[#111113] lg:col-span-4">
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

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={approvedClips.length === 0 || Boolean(batchProgress)}
            onClick={handleBatchExport}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
              approvedClips.length > 0 && !batchProgress
                ? 'bg-zinc-100 text-zinc-950 hover:bg-white'
                : 'border border-zinc-800 bg-zinc-900 text-zinc-500 cursor-not-allowed'
            }`}
          >
            {batchProgress ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {batchProgress}
              </>
            ) : (
              <>
                <Download className="h-4 w-4" />
                Export All Approved ({approvedClips.length})
              </>
            )}
          </button>
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

                  {(clip.hook || clip.caption) && (
                    <div className="space-y-2 rounded-lg border border-zinc-800 bg-[#09090b] p-3 text-xs">
                      {clip.hook && (
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <span className="font-medium text-zinc-400">Hook: </span>
                            <span className="text-zinc-200">{clip.hook}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleCopyText(`hook-${clip.id}`, clip.hook!)}
                            className="inline-flex shrink-0 items-center gap-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[11px] text-zinc-200 hover:bg-zinc-800"
                          >
                            {copiedKey === `hook-${clip.id}` ? (
                              <>
                                <Check className="h-3 w-3" />
                                Copied
                              </>
                            ) : (
                              <>
                                <Copy className="h-3 w-3" />
                                Copy
                              </>
                            )}
                          </button>
                        </div>
                      )}
                      {clip.caption && (
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <span className="font-medium text-zinc-400">Caption: </span>
                            <span className="text-zinc-200">{clip.caption}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleCopyText(`cap-${clip.id}`, clip.caption!)}
                            className="inline-flex shrink-0 items-center gap-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[11px] text-zinc-200 hover:bg-zinc-800"
                          >
                            {copiedKey === `cap-${clip.id}` ? (
                              <>
                                <Check className="h-3 w-3" />
                                Copied
                              </>
                            ) : (
                              <>
                                <Copy className="h-3 w-3" />
                                Copy
                              </>
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2.5 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setRightTab('player')
                        setPreviewingClip(clip)
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
                <div>
                  <div className="bg-black">
                    <video
                      ref={videoRef}
                      key={project.id}
                      src={`/api/projects/${project.id}/video`}
                      controls
                      onTimeUpdate={(e) => handleVideoTimeUpdate(e.currentTarget.currentTime)}
                      className="aspect-video max-h-[460px] w-full"
                    />
                  </div>
                  {previewingClip && (
                    <div className="flex items-center justify-between border-t border-zinc-800 px-4 py-2.5 text-xs text-zinc-400">
                      <span className="truncate">
                        Previewing: <span className="text-zinc-200">{previewingClip.title}</span> (
                        {formatDuration(previewingClip.start_time)} –{' '}
                        {formatDuration(previewingClip.end_time)})
                      </span>
                      <div className="flex items-center gap-3 shrink-0">
                        <label className="inline-flex items-center gap-1.5 cursor-pointer text-zinc-300">
                          <input
                            type="checkbox"
                            checked={loopClip}
                            onChange={(e) => setLoopClip(e.target.checked)}
                            className="h-3.5 w-3.5 accent-zinc-100"
                          />
                          Loop
                        </label>
                        <button
                          type="button"
                          onClick={() => setPreviewingClip(null)}
                          className="text-zinc-400 hover:text-zinc-100"
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                  )}
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
