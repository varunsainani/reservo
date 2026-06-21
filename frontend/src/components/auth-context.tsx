"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import * as apiClient from "@/lib/api";
import {
  getToken,
  getCachedUser,
  clearAuth,
} from "@/lib/session";
import type { Role, User } from "@/lib/api-types";

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (payload: {
    name: string;
    email: string;
    password: string;
    role: "CUSTOMER" | "PROVIDER";
  }) => Promise<User>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

/** Default landing route per role after auth. */
export function homeForRole(role: Role): string {
  switch (role) {
    case "PROVIDER":
      return "/dashboard";
    case "ADMIN":
      return "/admin";
    default:
      return "/my-bookings";
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  // Seed from the cached user so the navbar renders correct links instantly.
  const [user, setUser] = useState<User | null>(() => getCachedUser());
  const [loading, setLoading] = useState(true);

  // On mount, if there's a token, confirm the session against the backend.
  useEffect(() => {
    let active = true;
    (async () => {
      if (!getToken()) {
        if (active) setLoading(false);
        return;
      }
      try {
        const me = await apiClient.getMe();
        if (active) setUser(me);
      } catch {
        // Session invalid/expired and refresh failed: drop it silently.
        clearAuth();
        if (active) setUser(null);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await apiClient.login(email, password);
    setUser(data.user);
    return data.user;
  }, []);

  const register = useCallback(
    async (payload: { name: string; email: string; password: string; role: "CUSTOMER" | "PROVIDER" }) => {
      const data = await apiClient.register(payload);
      setUser(data.user);
      return data.user;
    },
    [],
  );

  const logout = useCallback(async () => {
    await apiClient.logout();
    setUser(null);
    router.push("/login");
  }, [router]);

  const refreshUser = useCallback(async () => {
    try {
      const me = await apiClient.getMe();
      setUser(me);
    } catch {
      setUser(null);
    }
  }, []);

  const value = useMemo<AuthState>(
    () => ({ user, loading, login, register, logout, refreshUser }),
    [user, loading, login, register, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
