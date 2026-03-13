export interface User {
  id: number
  name: string
  email: string
  role: 'lawyer' | 'admin'
  created_at: string
}

export interface Client {
  id: number
  name: string
  code: string
  is_active: boolean
  created_at: string
}

export interface Matter {
  id: number
  client_id: number
  name: string
  matter_number: string
  description?: string
  is_active: boolean
  created_at: string
  client_name?: string // from join
}

export interface Capture {
  id: number
  user_id: number
  timestamp: string
  app_name: string
  window_title: string
  screenshot_path?: string
  ocr_text?: string
  ocr_status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED'
  matter_id?: number
  ai_confidence?: number
  created_at: string
}

export interface TimeEntry {
  id: number
  user_id: number
  matter_id: number
  date: string
  duration_minutes: number
  description?: string
  status: 'DRAFT' | 'REVIEWED' | 'APPROVED'
  created_at: string
  updated_at: string
  matter_name?: string
  matter_number?: string
  client_name?: string
}

export interface Settings {
  capture_interval_seconds: number
  screenshot_retention_hours: number
  ocr_enabled: boolean
  categorization_confidence_threshold: number
}
