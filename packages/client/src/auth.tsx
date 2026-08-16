"use client";

// The session + capabilities context every Nirogix frontend shares (ADR-054).
//
// On mount it re-establishes the session from the httpOnly refresh cookie, then loads
// the user and their *effective* permission set from the backend. Menu and route
// visibility derive from this set — but visibility is never security: every backend
// endpoint independently re-checks auth → module → permission. The client mirror is
// UX only (`resources/memory.md`, invariant #2).
//
// It is parameterised over the app's own `ApiClient`, so each frontend keeps its own
// narrow endpoint surface (ADR-051) while the session logic — bootstrap, refresh,
// expiry, permission resolution — has exactly one implementation.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { AuthUser, LoginRequest } from "@hms/types";
import type { ApiClient } from "./http";
import { describeError } from "./feedback";

type Status = "loading" | "authenticated" | "anonymous";

interface Capabilities {
  wildcard: boolean;
  permissions: Set<string>;
}

export interface AuthContextValue {
  status: Status;
  user: AuthUser | null;
  can: (permission: string) => boolean;
  login: (payload: LoginRequest) => Promise<{ ok: true } | { ok: false; error: string; mfa?: boolean }>;
  logout: () => Promise<void>;
  /** Re-reads the session after the user changes their own profile. */
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const EMPTY_CAPS: Capabilities = { wildcard: false, permissions: new Set() };

export function AuthProvider({ api, children }: { api: ApiClient; children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [caps, setCaps] = useState<Capabilities>(EMPTY_CAPS);
  const bootstrapped = useRef(false);

  const loadSession = useCallback(async () => {
    const [meRes, permRes] = await Promise.all([api.me(), api.myPermissions()]);
    setUser(meRes.user);
    setCaps({ wildcard: permRes.wildcard, permissions: new Set(permRes.permissions) });
    setStatus("authenticated");
  }, [api]);

  const clearSession = useCallback(() => {
    setUser(null);
    setCaps(EMPTY_CAPS);
    setStatus("anonymous");
  }, []);

  // Re-establish an existing session (refresh cookie) once on load.
  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    api.setOnSessionExpired(() => clearSession());
    (async () => {
      const refreshed = await api.tryRefresh();
      if (!refreshed) {
        clearSession();
        return;
      }
      try {
        await loadSession();
      } catch {
        clearSession();
      }
    })();
    return () => api.setOnSessionExpired(null);
  }, [api, clearSession, loadSession]);

  const login = useCallback<AuthContextValue["login"]>(
    async (payload) => {
      try {
        const res = await api.login(payload);
        if ("mfaRequired" in res) {
          return { ok: false, error: "This account requires MFA, which isn't supported yet.", mfa: true };
        }
        api.setAccessToken(res.accessToken);
        setUser(res.user);
        // Load the effective permission set so the shell renders correctly.
        const perms = await api.myPermissions();
        setCaps({ wildcard: perms.wildcard, permissions: new Set(perms.permissions) });
        setStatus("authenticated");
        return { ok: true };
      } catch (err) {
        // Sign-in renders its failure inline (login opts out of the toast), but the
        // copy comes from the same shared classifier every other call uses.
        return { ok: false, error: describeError(err).description };
      }
    },
    [api],
  );

  const logout = useCallback(async () => {
    await api.logout();
    clearSession();
  }, [api, clearSession]);

  const can = useCallback(
    (permission: string) => caps.wildcard || caps.permissions.has(permission),
    [caps],
  );

  const refresh = useCallback(async () => {
    try {
      await loadSession();
    } catch {
      /* reported by the shared API-feedback layer */
    }
  }, [loadSession]);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, can, login, logout, refresh }),
    [status, user, can, login, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}

/** Convenience hook: does the current user hold this permission key? */
export function useCan(permission: string): boolean {
  return useAuth().can(permission);
}
