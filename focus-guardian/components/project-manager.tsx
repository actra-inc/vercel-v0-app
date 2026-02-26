"use client"

import type React from "react"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Plus, Edit2, Trash2, Folder } from "lucide-react"

interface Project {
  id: string
  name: string
  color: string
  client?: string
}

interface ProjectManagerProps {
  projects: Project[]
  onProjectsChange: (projects: Project[]) => void
  addProject: (project: any) => Promise<any>
  editProject: (id: string, updates: any) => Promise<any>
  removeProject: (id: string) => Promise<any>
}

const PROJECT_COLORS = [
  "#3b82f6", // blue
  "#10b981", // green
  "#f59e0b", // yellow
  "#ef4444", // red
  "#8b5cf6", // purple
  "#06b6d4", // cyan
  "#f97316", // orange
  "#84cc16", // lime
  "#ec4899", // pink
  "#6b7280", // gray
]

export function ProjectManager({
  projects,
  onProjectsChange,
  addProject,
  editProject,
  removeProject,
}: ProjectManagerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [formData, setFormData] = useState({
    name: "",
    color: PROJECT_COLORS[0],
    client: "",
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (editingProject) {
      await editProject(editingProject.id, {
        name: formData.name,
        color: formData.color,
        client: formData.client,
      })
    } else {
      await addProject({
        name: formData.name,
        color: formData.color,
        client: formData.client,
      })
    }

    setFormData({ name: "", color: PROJECT_COLORS[0], client: "" })
    setEditingProject(null)
    setIsOpen(false)
  }

  const handleEdit = (project: Project) => {
    setEditingProject(project)
    setFormData({
      name: project.name,
      color: project.color,
      client: project.client || "",
    })
    setIsOpen(true)
  }

  const handleDelete = async (projectId: string) => {
    if (projects.length <= 1) {
      alert("最低1つのプロジェクトが必要です")
      return
    }

    if (confirm("このプロジェクトを削除しますか？")) {
      await removeProject(projectId)
    }
  }

  const openNewProject = () => {
    setEditingProject(null)
    setFormData({ name: "", color: PROJECT_COLORS[0], client: "" })
    setIsOpen(true)
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Folder className="h-5 w-5" />
            プロジェクト管理
          </CardTitle>
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={openNewProject} className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                新規
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingProject ? "プロジェクト編集" : "新しいプロジェクト"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">プロジェクト名</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="例: ウェブサイト開発"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="client">クライアント（任意）</Label>
                  <Input
                    id="client"
                    value={formData.client}
                    onChange={(e) => setFormData({ ...formData, client: e.target.value })}
                    placeholder="例: 株式会社サンプル"
                  />
                </div>

                <div className="space-y-2">
                  <Label>カラー</Label>
                  <div className="flex gap-2 flex-wrap">
                    {PROJECT_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        className={`w-8 h-8 rounded-full border-2 ${
                          formData.color === color ? "border-gray-800" : "border-gray-300"
                        }`}
                        style={{ backgroundColor: color }}
                        onClick={() => setFormData({ ...formData, color })}
                      />
                    ))}
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button type="submit" className="flex-1">
                    {editingProject ? "更新" : "作成"}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
                    キャンセル
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {projects.map((project) => (
            <div key={project.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 rounded-full" style={{ backgroundColor: project.color }} />
                <div>
                  <div className="font-medium">{project.name}</div>
                  {project.client && <div className="text-sm text-gray-600">{project.client}</div>}
                </div>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => handleEdit(project)} className="h-8 w-8 p-0">
                  <Edit2 className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(project.id)}
                  className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
