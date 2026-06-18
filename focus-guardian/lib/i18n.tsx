'use client'

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
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
    if (saved === 'ja' || saved === 'en') setLanguageState(saved)
  }, [])

  const setLanguage = (lang: Language) => {
    setLanguageState(lang)
    localStorage.setItem('flownudge_language', lang)
  }

  const t = (key: TranslationKey, vars?: Record<string, string | number>): string => {
    let str = translations[language][key] ?? translations.ja[key] ?? key
    if (vars) {
      Object.entries(vars).forEach(([k, v]) => {
        str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
      })
    }
    return str
  }

  return <I18nContext.Provider value={{ language, setLanguage, t }}>{children}</I18nContext.Provider>
}

export const useTranslation = () => useContext(I18nContext)
