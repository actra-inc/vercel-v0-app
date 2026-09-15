"use client"

import { useCallback, useEffect, useState } from "react"
import {
  ensureLocalAiReady,
  getLocalAiState,
  refreshLocalAiAvailability,
  subscribeLocalAi,
  type LocalAiState,
} from "@/lib/local-ai"

// 端末内 AI の利用可否・ダウンロード進捗を購読する。
// 状態は lib/local-ai.ts のモジュールスコープに1つだけあり、
// 作業ログパネルと設定画面の両方が同じ値を見る
export function useLocalAi(lang: "ja" | "en") {
  const [state, setState] = useState<LocalAiState>(() => getLocalAiState())

  useEffect(() => {
    const unsubscribe = subscribeLocalAi(setState)
    void refreshLocalAiAvailability(lang)
    return unsubscribe
  }, [lang])

  const refresh = useCallback(() => refreshLocalAiAvailability(lang), [lang])
  const download = useCallback(() => ensureLocalAiReady(lang), [lang])

  return {
    ...state,
    isReady: state.availability === "available",
    refresh,
    download,
  }
}
