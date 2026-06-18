"use client";

import { create } from "zustand";
import { api } from "@/lib/api";
import type { Project } from "@/lib/types";

interface ProjectState {
  projects: Project[];
  activeProjectId: string | null;
  loading: boolean;
  fetchProjects: () => Promise<Project[]>;
  createProject: (name: string) => Promise<Project>;
  setActiveProject: (id: string | null) => void;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  activeProjectId: null,
  loading: false,

  fetchProjects: async () => {
    set({ loading: true });
    const projects = await api.get<Project[]>("/projects");
    set({ projects, loading: false });
    if (!get().activeProjectId && projects.length > 0) {
      set({ activeProjectId: projects[0].id });
    }
    return projects;
  },

  createProject: async (name) => {
    const project = await api.post<Project>("/projects", { project_name: name });
    set({ projects: [project, ...get().projects], activeProjectId: project.id });
    return project;
  },

  setActiveProject: (id) => set({ activeProjectId: id }),
}));
