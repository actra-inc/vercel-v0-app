"use client"

import { createContext, useContext, useEffect, useState, useRef, type ReactNode } from "react"
import { supabase, signInWithGoogle, signOut as supabaseSignOut, createOrUpdateUser } from "@/lib/supabase"

interface User {
  id: string
  email: string
  name?: string
  avatar_url?: string
}

interface AuthContextType {
  user: User | null
  loading: boolean
  signIn: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  // 初期化が完了したかを追跡するRef（再レンダリングを生まないため）
  const initialized = useRef(false)

  useEffect(() => {
    // マウント状態の追跡
    let mounted = true

    const initializeAuth = async () => {
      // 既に初期化済みなら何もしない
      if (initialized.current) return

      try {
        console.log("Initializing auth...")

        const {
          data: { session },
          error,
        } = await supabase.auth.getSession()

        if (!mounted) return

        if (error) {
          console.error("Session error:", error)
          // エラーでも一旦nullとして扱う
          setUser(null)
        } else if (session?.user) {
          console.log("Found existing session:", session.user.email)
          setUser({
            id: session.user.id,
            email: session.user.email || "",
            name: session.user.user_metadata?.full_name || session.user.email,
            avatar_url: session.user.user_metadata?.avatar_url,
          })
          
          // バックグラウンドでDB同期（エラーは無視して続行）
          createOrUpdateUser(session.user).catch((err) => 
            console.error("Background user sync error:", err)
          )
        } else {
          setUser(null)
        }
      } catch (error) {
        console.error("Auth initialization error:", error)
        if (mounted) setUser(null)
      } finally {
        if (mounted) {
          setLoading(false)
          initialized.current = true
        }
      }
    }

    // 初回実行
    initializeAuth()

    // 認証状態の監視リスナー
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return

      console.log(`Auth state changed: ${event}`, session?.user?.email)

      // ▼▼▼ ここが修正の重要ポイント ▼▼▼
      
      // 1. タブ切り替えなどで発生する "SIGNED_IN" は、ユーザーが変わっていなければ無視する
      if (event === "SIGNED_IN" && session?.user) {
        setUser((prevUser) => {
          // すでに同じIDのユーザーがいるなら、ステート更新（再レンダリング）をしない
          if (prevUser?.id === session.user.id) {
            return prevUser
          }
          // 違うユーザーなら更新する
          return {
            id: session.user.id,
            email: session.user.email || "",
            name: session.user.user_metadata?.full_name || session.user.email,
            avatar_url: session.user.user_metadata?.avatar_url,
          }
        })
      } 
      // 2. ログアウト時だけは確実に消す
      else if (event === "SIGNED_OUT") {
        setUser(null)
        setLoading(false)
      }
      // 3. "TOKEN_REFRESHED" など、画面リロードが不要なイベントは何もしない

      // ▲▲▲ 修正ポイントここまで ▲▲▲
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, []) // 依存配列を空にする（これで勝手な再実行を防ぐ）

  const signIn = async () => {
    try {
      setLoading(true)
      const { error } = await signInWithGoogle()
      if (error) throw error
    } catch (error) {
      console.error("Sign in failed:", error)
      setLoading(false)
      throw error
    }
  }

  const signOut = async () => {
    try {
      setLoading(true)
      await supabaseSignOut()
      setUser(null)
    } catch (error) {
      console.error("Sign out failed:", error)
      throw error
    } finally {
      setLoading(false)
    }
  }

  const value = {
    user,
    loading,
    signIn,
    signOut,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
