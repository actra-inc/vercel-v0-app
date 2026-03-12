"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import {
  getCurrentUser,
  getUserSettings,
  updateUserSettings,
  getProjects,
  createProject,
  updateProject,
  deleteProject,
  getTimeEntries,
  createTimeEntry,
  updateTimeEntry,
  deleteTimeEntry,
  getWorkLogs,
  createWorkLog,
  deleteAllWorkLogs,
  type User,
  type Project,
  type TimeEntry,
  type WorkLog,
  type UserSettings,
} from "@/lib/supabase"

export function useSupabaseData() {
  const [user, setUser] = useState<User | null>(null)
  const [userSettings, setUserSettings] = useState<UserSettings | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([])
  const [workLogs, setWorkLogs] = useState<WorkLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const hasLoadedRef = useRef(false)

  // useCallbackでloadUserDataをメモ化して、依存関係の問題を解決
  const loadUserData = useCallback(async () => {
    try {
      // 初回のみローディング表示（再フェッチ時はコンテンツを維持して画面共有を継続）
      if (!hasLoadedRef.current) {
        setLoading(true)
      }
      setError(null)

      const { user: currentUser, error: userError } = await getCurrentUser()

      if (userError || !currentUser) {
        console.log("User not authenticated")
        setLoading(false)
        return
      }

      setUser({
        id: currentUser.id,
        email: currentUser.email || "",
        name: currentUser.user_metadata?.full_name || currentUser.email || "",
        avatar_url: currentUser.user_metadata?.avatar_url,
        created_at: currentUser.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })

      // Load user settings
      try {
        const { data: settings, error: settingsError } = await getUserSettings(currentUser.id)

        if (settingsError && !settingsError.includes("No rows")) {
          console.error("Error loading settings:", settingsError)
        }

        if (settings) {
          setUserSettings(settings)
        } else {
          // Create default settings if none exist
          const defaultSettings = {
            gemini_model: "gemini-2.5-flash-lite",
            capture_interval: 180,
            auto_sync_toggl: false,
          }
          const { data: newSettings } = await updateUserSettings(currentUser.id, defaultSettings)
          if (newSettings) {
            setUserSettings(newSettings)
          }
        }
      } catch (err) {
        console.error("Settings error:", err)
      }

      // Load projects
      try {
        const { data: projectsData, error: projectsError } = await getProjects(currentUser.id)
        if (projectsError) {
          console.error("Error loading projects:", projectsError)
        } else if (projectsData) {
          setProjects(projectsData)
        }
      } catch (err) {
        console.error("Projects error:", err)
      }

      // Load time entries
      try {
        const { data: entriesData, error: entriesError } = await getTimeEntries(currentUser.id)
        if (entriesError) {
          console.error("Error loading time entries:", entriesError)
        } else if (entriesData) {
          setTimeEntries(entriesData)
        }
      } catch (err) {
        console.error("Time entries error:", err)
      }

      // Load work logs
      try {
        const { data: logsData, error: logsError } = await getWorkLogs(currentUser.id)
        if (logsError) {
          console.error("Error loading work logs:", logsError)
        } else if (logsData) {
          setWorkLogs(logsData)
        }
      } catch (err) {
        console.error("Work logs error:", err)
      }

      hasLoadedRef.current = true
      setLoading(false)
    } catch (err) {
      console.error("Error loading user data:", err)
      setError(err instanceof Error ? err.message : "Failed to load user data")
      hasLoadedRef.current = true
      setLoading(false)
    }
  }, []) // 空の依存配列

  // Load initial data
  useEffect(() => {
    loadUserData()
  }, [loadUserData])

  // Update settings
  const updateSettings = async (settings: Partial<UserSettings>) => {
    if (!user) {
      throw new Error("User not authenticated")
    }

    console.log("🔄 updateSettings called with:", settings)

    try {
      const { data, error } = await updateUserSettings(user.id, settings)

      if (error) {
        console.error("❌ Error updating settings:", error)
        throw new Error(error)
      }

      console.log("✅ Settings updated successfully:", data)

      if (data) {
        setUserSettings(data)
      }

      return data
    } catch (error) {
      console.error("❌ Exception in updateSettings:", error)
      throw error
    }
  }

  // Project operations
  const addProject = async (project: Omit<Project, "id" | "created_at" | "updated_at">) => {
    const { data, error } = await createProject(project)
    if (error) throw new Error(error.message || "Failed to create project")
    if (data) {
      setProjects([...projects, data])
    }
    return data
  }

  const editProject = async (id: string, updates: Partial<Project>) => {
    const { data, error } = await updateProject(id, updates)
    if (error) throw new Error(error.message || "Failed to update project")
    if (data) {
      setProjects(projects.map((p) => (p.id === id ? data : p)))
    }
    return data
  }

  const removeProject = async (id: string) => {
    const { error } = await deleteProject(id)
    if (error) throw new Error(error.message || "Failed to delete project")
    setProjects(projects.filter((p) => p.id !== id))
  }

  // Time entry operations
  const addTimeEntry = async (entry: Omit<TimeEntry, "id" | "created_at" | "updated_at">) => {
    const { data, error } = await createTimeEntry(entry)
    if (error) throw new Error(error.message || "Failed to create time entry")
    if (data) {
      setTimeEntries([data, ...timeEntries])
    }
    return data
  }

  const editTimeEntry = async (id: string, updates: Partial<TimeEntry>) => {
    const { data, error } = await updateTimeEntry(id, updates)
    if (error) throw new Error(error.message || "Failed to update time entry")
    if (data) {
      setTimeEntries(timeEntries.map((e) => (e.id === id ? data : e)))
    }
    return data
  }

  const removeTimeEntry = async (id: string) => {
    const { error } = await deleteTimeEntry(id)
    if (error) throw new Error(error.message || "Failed to delete time entry")
    setTimeEntries(timeEntries.filter((e) => e.id !== id))
  }

  // Work log operations
  const addWorkLog = async (log: Omit<WorkLog, "id" | "created_at">) => {
    if (!user) {
      throw new Error("User not authenticated")
    }

    const { data, error } = await createWorkLog({ ...log, user_id: user.id })
    if (error) throw new Error(error.message || "Failed to create work log")
    if (data) {
      setWorkLogs([data, ...workLogs])
    }
    return data
  }

  const clearWorkLogs = async () => {
    if (!user) {
      throw new Error("User not authenticated")
    }

    const { error } = await deleteAllWorkLogs(user.id)
    if (error) throw new Error(error.message || "Failed to clear work logs")
    setWorkLogs([])
  }

  return {
    user,
    userSettings,
    projects,
    timeEntries,
    workLogs,
    loading,
    error,
    updateSettings,
    addProject,
    editProject,
    removeProject,
    addTimeEntry,
    editTimeEntry,
    removeTimeEntry,
    addWorkLog,
    clearWorkLogs,
    refreshData: loadUserData,
  }
}
