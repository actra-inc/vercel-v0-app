"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

interface WorkLogEntry {
  id: string
  timestamp: string // Changed from Date to string
  activity: string
  category: "productive" | "distracted" | "neutral"
  details: string
}

interface FloatingLogWindowProps {
  workLogs: WorkLogEntry[]
}

export function FloatingLogWindow({ workLogs }: FloatingLogWindowProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [position, setPosition] = useState({ x: window.innerWidth - 280, y: 20 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true)
    setDragOffset({
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    })
  }

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        setPosition({
          x: e.clientX - dragOffset.x,
          y: e.clientY - dragOffset.y,
        })
      }
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove)
      document.addEventListener("mouseup", handleMouseUp)
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
    }
  }, [isDragging, dragOffset])

  const getCategoryColor = (category: WorkLogEntry["category"]) => {
    switch (category) {
      case "productive":
        return "bg-green-100 text-green-800"
      case "distracted":
        return "bg-red-100 text-red-800"
      case "neutral":
        return "bg-gray-100 text-gray-800"
    }
  }

  const formatTime = (timestamp: string) => {
    try {
      const date = new Date(timestamp)
      return date.toLocaleTimeString("ja-JP", {
        hour: "2-digit",
        minute: "2-digit",
      })
    } catch (error) {
      console.error("Error formatting time:", error, timestamp)
      return "Invalid time"
    }
  }

  if (!isVisible) return null

  return (
    <div className="fixed z-50 w-72 shadow-2xl" style={{ left: position.x, top: position.y }}>
      <Card className="border-2 bg-white/95 backdrop-blur-sm">
        <CardHeader className="pb-2 cursor-move" onMouseDown={handleMouseDown}>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">作業ログ</CardTitle>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" onClick={() => setIsVisible(false)} className="h-6 w-6 p-0">
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0 max-h-80 overflow-y-auto">
          <div className="space-y-3">
            {workLogs.slice(0, 5).map((log) => (
              <div key={log.id} className="text-xs">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-gray-900">{log.activity}</span>
                  <Badge variant="outline" className={cn("text-xs px-1 py-0", getCategoryColor(log.category))}>
                    {log.category === "productive" ? "集中" : log.category === "distracted" ? "脱線" : "中立"}
                  </Badge>
                </div>
                <div className="text-gray-500 mb-1">{formatTime(log.timestamp)}</div>
                <div className="text-gray-600 text-xs leading-relaxed">
                  {log.details.length > 60 ? `${log.details.slice(0, 60)}...` : log.details}
                </div>
              </div>
            ))}
          </div>

          {workLogs.length === 0 && <div className="text-xs text-gray-500 text-center py-4">まだログがありません</div>}
        </CardContent>
      </Card>
    </div>
  )
}
