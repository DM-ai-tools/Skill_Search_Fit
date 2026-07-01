"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { api } from "@/lib/api";
import { formatApiError } from "@/lib/format-api-error";
import type { Project } from "@/lib/types";

interface ProjectState {
  projects: Project[];
  activeProjectId: string | null;
  loading: boolean;
  error: string | null;
  fetchProjects: () => Promise<Project[]>;
  createProject: (name: string) => Promise<Project>;
  setActiveProject: (id: string | null) => void;
  clearError: () => void;
}

export const useProjectStore = create<ProjectState>()(
  persist(
    (set, get) => ({
      projects: [],
      activeProjectId: null,
      loading: false,
      error: null,

      fetchProjects: async () => {
        set({ loading: true, error: null });
        try {
          const projects = await api.get<Project[]>("/projects");
          set({ projects, loading: false });
          const active = get().activeProjectId;
          if (active && projects.some((p) => p.id === active)) {
            return projects;
          }
          if (projects.length > 0) {
            set({ activeProjectId: projects[0].id });
          } else {
            set({ activeProjectId: null });
          }
          return projects;
        } catch (err) {
          set({
            loading: false,
            error: formatApiError(err, "Failed to load projects"),
          });
          return [];
        }
      },

      createProject: async (name) => {
        const project = await api.post<Project>("/projects", { project_name: name });
        set({ projects: [project, ...get().projects], activeProjectId: project.id, error: null });
        return project;
      },

      setActiveProject: (id) => set({ activeProjectId: id }),

      clearError: () => set({ error: null }),
    }),
    {
      name: "project-store",
      partialize: (state) => ({ activeProjectId: state.activeProjectId }),
    },
  ),
);
