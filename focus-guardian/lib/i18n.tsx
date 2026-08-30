'use client'

import { createContext, useContext, useState, useEffect, useMemo, useCallback, type ReactNode } from 'react'
import { ja, type TranslationKey } from './translations/ja'
import { en } from './translations/en'

export type Language = 'ja' | 'en'

const translations: Record<Language, Record<TranslationKey, string>> = { ja, en }

interface I18nContextType {
  language: Language
  setLanguage: (lang: Language) => void
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string
}

const I18nContext = createContext<I18nContextType>({
  language: 'ja',
  setLanguage: () => {},
  t: (key) => ja[key],
})

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>('ja')

  useEffect(() => {
    const saved = localStorage.getItem('flownudge_language') as Language
    if (saved === 'ja' || saved === 'en') {
      setLanguageState(saved)
      return
    }
    // 未設定ならブラウザの言語設定に合わせる（日本語以外は英語）。
    // 設定画面で切り替えた値は localStorage に保存され、以後はそちらが優先される
    const browserLang = typeof navigator !== 'undefined' ? navigator.language || '' : ''
    setLanguageState(browserLang.toLowerCase().startsWith('ja') ? 'ja' : 'en')
  }, [])

  const setLanguage = (lang: Language) => {
    setLanguageState(lang)
    localStorage.setItem('flownudge_language', lang)
  }

  // t を useCallback で安定化する（毎レンダー再生成されると、依存配列に
  // 入れた useCallback/useEffect が全て言語切替以外でも作り直され、
  // 逆に依存から外すと旧言語で固まる、という二択を強いていた）
  const t = useCallback(
    (key: TranslationKey, vars?: Record<string, string | number>): string => {
      let str = translations[language][key] ?? translations.ja[key] ?? key
      if (vars) {
        Object.entries(vars).forEach(([k, v]) => {
          // 置換値は関数で渡す（文字列だと "$&" などの特殊パターンが展開され、
          // 作業名に $ を含むと通知文が壊れる）
          str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), () => String(v))
        })
      }
      return str
    },
    [language],
  )

  const value = useMemo(() => ({ language, setLanguage, t }), [language, t])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export const useTranslation = () => useContext(I18nContext)
