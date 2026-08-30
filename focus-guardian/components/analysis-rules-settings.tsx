"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { ListChecks, Pencil, Trash2, Check, X } from "lucide-react"
import { useTranslation } from "@/lib/i18n"
import { MAX_ANALYSIS_RULES, MAX_ANALYSIS_RULE_LENGTH } from "@/lib/config"
import type { AnalysisRule } from "@/lib/supabase"

interface AnalysisRulesSettingsProps {
  rules: AnalysisRule[]
  onChange: (rules: AnalysisRule[]) => void | Promise<void>
}

// 「これは仕事です」フィードバックから作られた判定ルールの管理画面。
// 一覧・インライン編集・削除・有効/無効の切替ができる
export function AnalysisRulesSettings({ rules, onChange }: AnalysisRulesSettingsProps) {
  const { t } = useTranslation()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState("")
  const [error, setError] = useState<string | null>(null)

  const apply = async (next: AnalysisRule[]) => {
    setError(null)
    try {
      await onChange(next)
    } catch (e) {
      console.warn("Failed to save analysis rules:", e)
      setError(t('fb_saveFailed'))
    }
  }

  const startEdit = (rule: AnalysisRule) => {
    setEditingId(rule.id)
    setEditText(rule.text)
    setError(null)
  }

  const saveEdit = async () => {
    const text = editText.trim()
    if (!text) {
      setError(t('fb_empty'))
      return
    }
    if (text.length > MAX_ANALYSIS_RULE_LENGTH) {
      setError(t('fb_tooLong'))
      return
    }
    await apply(rules.map((r) => (r.id === editingId ? { ...r, text } : r)))
    setEditingId(null)
  }

  return (
    <Card className="mt-6">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ListChecks className="h-5 w-5 text-orange-600" />
          {t('ar_title')}
          <span className="ml-auto text-xs font-normal text-gray-500">
            {t('ar_count', { n: rules.length, max: MAX_ANALYSIS_RULES })}
          </span>
        </CardTitle>
        <CardDescription className="text-xs">{t('ar_desc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {rules.length === 0 && <p className="text-sm text-gray-400 py-2">{t('ar_empty')}</p>}

        {rules.map((rule) => (
          <div
            key={rule.id}
            className="flex items-start gap-2 rounded-lg border border-gray-200 p-2.5"
          >
            <Switch
              checked={rule.enabled}
              onCheckedChange={(checked) =>
                apply(rules.map((r) => (r.id === rule.id ? { ...r, enabled: checked } : r)))
              }
              className="mt-0.5"
              aria-label={t('ar_toggleAria')}
            />
            {editingId === rule.id ? (
              <div className="flex-1 space-y-1.5">
                <Textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  rows={2}
                  className="text-sm"
                />
                <div className="flex items-center gap-1.5">
                  <Button size="sm" className="h-7 text-xs gap-1" onClick={saveEdit}>
                    <Check className="h-3.5 w-3.5" />
                    {t('common_save')}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs gap-1"
                    onClick={() => setEditingId(null)}
                  >
                    <X className="h-3.5 w-3.5" />
                    {t('common_cancel')}
                  </Button>
                  <span
                    className={`ml-auto text-xs ${editText.trim().length > MAX_ANALYSIS_RULE_LENGTH ? "text-red-600" : "text-gray-400"}`}
                  >
                    {t('fb_charCount', { n: editText.trim().length, max: MAX_ANALYSIS_RULE_LENGTH })}
                  </span>
                </div>
              </div>
            ) : (
              <>
                <p
                  className={`flex-1 text-sm leading-snug ${rule.enabled ? "text-gray-700" : "text-gray-400 line-through"}`}
                >
                  {rule.text}
                </p>
                <div className="flex shrink-0 gap-0.5">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0"
                    onClick={() => startEdit(rule)}
                    aria-label={t('ar_editAria')}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-red-500 hover:text-red-600"
                    onClick={() => apply(rules.filter((r) => r.id !== rule.id))}
                    aria-label={t('ar_deleteAria')}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </>
            )}
          </div>
        ))}

        {error && <p className="text-xs text-red-600">{error}</p>}
      </CardContent>
    </Card>
  )
}
