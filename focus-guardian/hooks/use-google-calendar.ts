"use client"

import { useState, useCallback } from "react"
import { supabase } from "@/lib/supabase"

export interface CalendarEvent {
  id: string
  summary: string
  start: { dateTime?: string; date?: string }
  end: { dateTime?: string; date?: string }
  description?: string
  colorId?: string
}

// Google Calendar の colorId → 色マッピング
export const CALENDAR_COLORS: Record<string, string> = {
  "1": "#D50000",  // トマト
  "2": "#E91E63",  // フラミンゴ
  "3": "#F4511E",  // タンジェリン
  "4": "#F6BF26",  // バナナ
  "5": "#33B679",  // セージ
  "6": "#0B8043",  // バジル
  "7": "#039BE5",  // ピーコック
  "8": "#3F51B5",  // ブルーベリー
  "9": "#7986CB",  // ラベンダー
  "10": "#8E24AA", // グレープ
  "11": "#616161", // グラファイト
}

export const getEventColor = (colorId?: string): string => {
  return colorId ? (CALENDAR_COLORS[colorId] || "#039BE5") : "#039BE5"
}

export function useGoogleCalendar() {
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [needsReauth, setNeedsReauth] = useState(false)

  const fetchTodayEvents = useCallback(async () => {
    setLoading(true)
    setError(null)
    setNeedsReauth(false)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const providerToken = session?.provider_token

      if (!providerToken) {
        setNeedsReauth(true)
        setError("カレンダーへのアクセス権限がありません。再ログインが必要です。")
        return
      }

      const now = new Date()
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
      const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString()

      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${startOfDay}&timeMax=${endOfDay}&singleEvents=true&orderBy=startTime&maxResults=20`,
        {
          headers: { Authorization: `Bearer ${providerToken}` },
        },
      )

      if (response.status === 401) {
        setNeedsReauth(true)
        setError("アクセストークンが期限切れです。再ログインしてください。")
        return
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => null)
        throw new Error(errorData?.error?.message || `Calendar API error: ${response.status}`)
      }

      const data = await response.json()
      setEvents(data.items || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "カレンダーの取得に失敗しました")
    } finally {
      setLoading(false)
    }
  }, [])

  const formatEventTime = (event: CalendarEvent): string => {
    const start = event.start.dateTime || event.start.date
    if (!start) return ""

    if (event.start.date && !event.start.dateTime) {
      return "終日"
    }

    const startDate = new Date(start)
    const endDate = event.end.dateTime ? new Date(event.end.dateTime) : null

    const timeStr = startDate.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })
    if (endDate) {
      const endStr = endDate.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })
      return `${timeStr}〜${endStr}`
    }
    return timeStr
  }

  const isEventNow = (event: CalendarEvent): boolean => {
    const now = new Date()
    const start = event.start.dateTime ? new Date(event.start.dateTime) : null
    const end = event.end.dateTime ? new Date(event.end.dateTime) : null
    if (!start || !end) return false
    return now >= start && now <= end
  }

  return { events, loading, error, needsReauth, fetchTodayEvents, formatEventTime, isEventNow }
}
