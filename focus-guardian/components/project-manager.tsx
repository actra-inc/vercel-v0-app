"use client"
import { useTranslation } from "@/lib/i18n"

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
  "#f97316", // orange
  "#f59e0b", // amber
  "#10b981", // green
  "#ef4444", // red
  "#eab308", // yellow
  "#06b6d4", // cyan
  "#84cc16", // lime
  "#ec4899", // pink
  "#6b7280", // gray
  "#a16207", // dark amber
]

export function ProjectManager({
  projects,
  onProjectsChange,
  addProject,
  editProject,
  removeProject,
}: ProjectManagerProps) {
  const { t } = useTranslation()
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
      alert(t('pm_minRequired'))
      return
    }

    if (confirm(t('pm_confirmDelete'))) {
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
            {t('pm_title')}
          </CardTitle>
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={openNewProject} className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                {t('pm_new')}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingProject ? t('pm_editTitle') : t('pm_createTitle')}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">{t('pm_name')}</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder={t('pm_namePlaceholder')}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="client">{t('pm_client')}</Label>
                  <Input
                    id="client"
                    value={formData.client}
                    onChange={(e) => setFormData({ ...formData, client: e.target.value })}
                    placeholder={t('pm_clientPlaceholder')}
                  />
                </div>

                <div className="space-y-2">
                  <Label>{t('pm_color')}</Label>
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
                    {editingProject ? t('common_update') : t('common_create')}
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
