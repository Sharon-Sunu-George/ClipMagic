export interface HealthComponent {
  available: boolean
  detail: string | null
}

export interface HealthResponse {
  status: string
  app_name: string
  version: string
  database: HealthComponent
  ffmpeg: HealthComponent
  ffprobe: HealthComponent
  gpu: HealthComponent
  ollama: HealthComponent
}

export interface Project {
  id: number
  name: string
  category: string
  thumbnail_path: string | null
  duration: number | null
  resolution: string | null
  width: number | null
  height: number | null
  fps: number | null
  file_size: number | null
  created_at: string
  updated_at: string
}

export interface ExportItem {
  id: number
  project_id: number
  clip_id: number | null
  output_path: string
  aspect_ratio: string
  preset: string
  subtitle_style: string
  file_size: number | null
  duration: number | null
  status: string
  created_at: string
}

export interface JobItem {
  id: number
  project_id: number | null
  job_type: string
  status: string
  progress: number
  message: string | null
  error_message: string | null
  created_at: string
  updated_at: string
}

export interface DashboardStats {
  total_projects: number
  total_videos_processed: number
  total_clips_generated: number
  total_exports: number
  recent_projects: Project[]
  recent_exports: ExportItem[]
  active_jobs: JobItem[]
}

export interface AppSettings {
  whisper_model: string
  whisper_device: string
  ollama_model: string
  default_clip_min_seconds: number
  default_clip_max_seconds: number
  default_aspect_ratio: string
  default_subtitle_style: string
  prefer_hw_encoding: boolean
}

export interface OllamaModelInfo {
  name: string
  size: number | null
  is_cloud: boolean
}

export interface OllamaModelsResponse {
  available: boolean
  models: OllamaModelInfo[]
  error?: string
}

export interface UploadResponse {
  project: Project
  job: JobItem
}

export interface TranscriptSegment {
  id: number
  start: number
  end: number
  text: string
}

export interface TranscriptOut {
  id: number
  project_id: number
  language: string
  model_size: string
  transcript_data: string
  created_at: string
}

export interface ClipSuggestion {
  id: number
  project_id: number
  title: string
  hook: string | null
  start_time: number
  end_time: number
  reason: string
  category: string
  score: number
  caption: string | null
  status: 'pending' | 'approved' | 'rejected'
}

export interface ClipExportPayload {
  aspect_ratio: string
  subtitle_style: string
  font_size: number
  caption_color: string
  caption_position: string
  enable_subtitles: boolean
  preview: boolean
}

export interface ExportJobResponse {
  export: ExportItem
  job: JobItem
}


