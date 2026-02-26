export const debugLog = (message: string, data?: any) => {
  if (typeof window !== "undefined") {
    console.log(`🔍 [DEBUG] ${message}`, data || "")
  }
}

export const debugError = (message: string, error?: any) => {
  if (typeof window !== "undefined") {
    console.error(`❌ [ERROR] ${message}`, error || "")
  }
}

export const debugWarn = (message: string, data?: any) => {
  if (typeof window !== "undefined") {
    console.warn(`⚠️ [WARN] ${message}`, data || "")
  }
}

export const getEnvironmentInfo = () => {
  const info = {
    nextAuthUrl: process.env.NEXTAUTH_URL,
    nextAuthSecret: process.env.NEXTAUTH_SECRET ? "***SET***" : "NOT SET",
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? "***SET***" : "NOT SET",
    nodeEnv: process.env.NODE_ENV,
    vercelUrl: process.env.VERCEL_URL,
    vercelEnv: process.env.VERCEL_ENV,
    currentUrl: typeof window !== "undefined" ? window.location.origin : "server-side",
  }

  debugLog("Environment Info", info)
  return info
}

export const clearAllStorage = () => {
  if (typeof window !== "undefined") {
    try {
      localStorage.clear()
      sessionStorage.clear()
      debugLog("Storage cleared successfully")
      return true
    } catch (error) {
      debugError("Failed to clear storage", error)
      return false
    }
  }
  return false
}

export const testSupabaseConnection = async () => {
  try {
    const response = await fetch("/api/debug/supabase-test")
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    const result = await response.json()
    debugLog("Supabase Test Result", result)
    return result
  } catch (error) {
    debugError("Supabase Test Error", error)
    return { error: error.message }
  }
}

export const validateUrls = () => {
  const issues = []
  const info = getEnvironmentInfo()

  if (!process.env.NEXTAUTH_URL) {
    issues.push("NEXTAUTH_URL が設定されていません")
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    issues.push("NEXT_PUBLIC_SUPABASE_URL が設定されていません")
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    issues.push("NEXT_PUBLIC_SUPABASE_ANON_KEY が設定されていません")
  }

  return {
    isValid: issues.length === 0,
    issues,
    info,
  }
}

export const generateCorrectUrls = (currentUrl: string) => {
  const baseUrl = currentUrl.replace(/\/debug.*$/, "")

  return {
    nextAuthUrl: baseUrl,
    supabaseSiteUrl: baseUrl,
    supabaseRedirectUrl: `${baseUrl}/auth/callback`,
    googleRedirectUri: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/callback`,
  }
}
