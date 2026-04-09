"use client"

import { useState, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { BarChart3, Plus } from "lucide-react"

export interface ActivityCategory {
  id: string
  name: string
  color: string
}

export const DEFAULT_CATEGORIES: ActivityCategory[] = [
  { id: "email", name: "メールチェック", color: "#3B82F6" },
  { id: "entertainment", name: "娯楽", color: "#EF4444" },
  { id: "chat", name: "チャット", color: "#8B5CF6" },
  { id: "research", name: "リサーチ", color: "#10B981" },
  { id: "meeting", name: "ミーティング", color: "#F59E0B" },
  { id: "sns", name: "業務以外のSNS", color: "#EC4899" },
  { id: "other", name: "未分類", color: "#6B7280" },
]

const COLOR_OPTIONS = [
  "#3B82F6", "#EF4444", "#8B5CF6", "#10B981", "#F59E0B",
  "#EC4899", "#6B7280", "#14B8A6", "#F97316", "#84CC16",
]

interface WorkLogEntry {
  id: string
  work_category?: string
  timestamp: string
  report_type?: string
}

interface ActivityBreakdownProps {
  workLogs: WorkLogEntry[]
  categories: ActivityCategory[]
  captureInterval: number
  onCategoriesChange: (categories: ActivityCategory[]) => void
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}秒`
  if (seconds < 3600) return `${Math.round(seconds / 60)}分`
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  return m > 0 ? `${h}時間${m}分` : `${h}時間`
}

export function ActivityBreakdown({
  workLogs,
  categories,
  captureInterval,
  onCategoriesChange,
}: ActivityBreakdownProps) {
  const [showCategoryEditor, setShowCategoryEditor] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState("")
  const [newCategoryColor, setNewCategoryColor] = useState(COLOR_OPTIONS[0])

  const regularLogs = useMemo(
    () => workLogs.filter((log) => !log.report_type),
    [workLogs],
  )

  const breakdown = useMemo(() => {
    const map: Record<string, number> = {}
    categories.forEach((c) => {
      map[c.name] = 0
    })
    if (!("未分類" in map)) {
      map["未分類"] = 0
    }

    regularLogs.forEach((log) => {
      const key = log.work_category || "未分類"
      if (key in map) {
        map[key] += captureInterval
      } else {
        map["未分類"] += captureInterval
      }
    })

    const totalSeconds = regularLogs.length * captureInterval
    if (totalSeconds === 0) return []

    return Object.entries(map)
      .filter(([, seconds]) => seconds > 0)
      .map(([name, seconds]) => {
        const cat = categories.find((c) => c.name === name)
        return {
          name,
          seconds,
          percentage: Math.round((seconds / totalSeconds) * 100),
          color: cat?.color || "#9CA3AF",
        }
      })
      .sort((a, b) => b.seconds - a.seconds)
  }, [regularLogs, categories, captureInterval])

  const totalSeconds = regularLogs.length * captureInterval

  const handleAddCategory = () => {
    if (!newCategoryName.trim()) return
    const newCat: ActivityCategory = {
      id: Date.now().toString(),
      name: newCategoryName.trim(),
      color: newCategoryColor,
    }
    onCategoriesChange([...categories, newCat])
    setNewCategoryName("")
  }

  const handleRemoveCategory = (id: string) => {
    onCategoriesChange(categories.filter((c) => c.id !== id))
  }

  return (
    <Card className="shadow-lg border-0 bg-white/90 backdrop-blur-sm">
      <CardHeader className="pb-3 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-t-lg border-b border-gray-100">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-gray-800">
            <BarChart3 className="h-5 w-5 text-indigo-600" />
            作業種類の内訳
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowCategoryEditor(!showCategoryEditor)}
            className="text-xs"
          >
            カテゴリ編集
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        {showCategoryEditor && (
          <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg space-y-3">
            <div className="text-sm font-medium text-gray-700">カテゴリ管理</div>
            <div className="flex flex-wrap gap-2">
              {categories.map((cat) => (
                <div
                  key={cat.id}
                  className="flex items-center gap-1 bg-white border rounded-full px-2 py-1 text-xs"
                >
                  <div
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: cat.color }}
                  />
                  <span>{cat.name}</span>
                  <button
                    onClick={() => handleRemoveCategory(cat.id)}
                    className="text-gray-400 hover:text-red-500 ml-1 leading-none"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-1 flex-wrap">
              {COLOR_OPTIONS.map((color) => (
                <button
                  key={color}
                  onClick={() => setNewCategoryColor(color)}
                  className="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110"
                  style={{
                    backgroundColor: color,
                    borderColor: newCategoryColor === color ? "#1F2937" : "transparent",
                  }}
                />
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="新しいカテゴリ名"
                className="h-8 text-sm"
                onKeyDown={(e) => e.key === "Enter" && handleAddCategory()}
              />
              <Button size="sm" onClick={handleAddCategory} className="h-8 gap-1 flex-shrink-0">
                <Plus className="h-3 w-3" />
                追加
              </Button>
            </div>
          </div>
        )}

        {totalSeconds === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">
            解析ログがありません。
            <br />
            解析を開始するとここに作業内訳が表示されます。
          </div>
        ) : (
          <>
            {/* iOS風セグメントバー */}
            <div className="space-y-1">
              <div className="flex h-8 rounded-full overflow-hidden gap-px">
                {breakdown.map((item, i) => (
                  <div
                    key={item.name}
                    style={{
                      width: `${item.percentage}%`,
                      backgroundColor: item.color,
                      minWidth: item.percentage > 0 ? "4px" : "0",
                    }}
                    title={`${item.name}: ${item.percentage}% (${formatDuration(item.seconds)})`}
                    className={`transition-all duration-500 ${i === 0 ? "rounded-l-full" : ""} ${
                      i === breakdown.length - 1 ? "rounded-r-full" : ""
                    }`}
                  />
                ))}
              </div>
              <div className="text-xs text-right text-gray-400">
                合計記録時間: {formatDuration(totalSeconds)}
              </div>
            </div>

            {/* 凡例 */}
            <div className="space-y-2">
              {breakdown.map((item) => (
                <div key={item.name} className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-sm flex-shrink-0"
                    style={{ backgroundColor: item.color }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-700 truncate">{item.name}</span>
                      <span className="text-gray-500 text-xs ml-2 flex-shrink-0">
                        {formatDuration(item.seconds)}（{item.percentage}%）
                      </span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full mt-0.5 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${item.percentage}%`, backgroundColor: item.color }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
