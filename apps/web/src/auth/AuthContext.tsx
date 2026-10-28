import { createContext, useContext, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, authApi, type AuthUser, type LoginInput } from "../lib/api";

interface AuthValue {
  user: AuthUser | null;
  cargando: boolean;
  login: (input: LoginInput) => Promise<AuthUser>;
  logout: () => Promise<void>;
}

const ME_KEY = ["auth", "me"] as const;
const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();

  const { data, isPending } = useQuery({
    queryKey: ME_KEY,
    queryFn: async () => {
      try {
        return await authApi.me();
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const login = async (input: LoginInput) => {
    const usuario = await authApi.login(input);
    qc.setQueryData(ME_KEY, usuario);
    return usuario;
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } finally {
      qc.clear();
      qc.setQueryData(ME_KEY, null);
    }
  };

  return (
    <AuthContext.Provider value={{ user: data ?? null, cargando: isPending, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return ctx;
}
