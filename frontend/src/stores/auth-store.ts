"use client";

import { create } from "zustand";
import { api } from "@/lib/api";
import type { User } from "@/lib/types";

interface AuthState {
  user: User | null;
  loading: boolean;
  fetchUser: () => Promise<User | null>;
  login: (email: string, password: string, admin?: boolean, remember?: boolean) => Promise<User>;
  signup: (name: string, email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  setUser: (user: User | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: false,

  fetchUser: async () => {
    set({ loading: true });
    try {
      const user = await api.get<User>("/auth/me");
      set({ user, loading: false });
      return user;
    } catch {
      set({ user: null, loading: false });
      return null;
    }
  },

  login: async (email, password, admin = false, remember = false) => {
    const path = admin ? "/auth/admin/login" : "/auth/login";
    const user = await api.post<User>(path, { email, password, remember }, false);
    set({ user });
    return user;
  },

  signup: async (name, email, password) => {
    const user = await api.post<User>("/auth/signup", { name, email, password }, false);
    set({ user });
    return user;
  },

  logout: async () => {
    try {
      await api.post("/auth/logout");
    } finally {
      set({ user: null });
    }
  },

  setUser: (user) => set({ user }),
}));
