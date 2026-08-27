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
import { toast } from "@hms/ui";
import type { AuthUser, LoginRequest } from "@hms/types";
import type { ApiClient } from "./http";
import { describeError } from "./feedback";
import { clearStoredActivity, DEFAULT_IDLE_TIMEOUT_MS, useIdleSignOut } from "./idle";

type Status = "loading" | "authenticated" | "anonymous";

interface Capabilities {
  wildcard: boolean;
  permissions: Set<string>;
  /** Tenant-enabled module keys (ADR-085). Empty until the session loads. */
  modules: Set<string>;
  /** Tenant-enabled capability keys of those modules (ADR-085). */
  capabilities: Set<string>;
}

export interface AuthContextValue {
  status: Status;
  user: AuthUser | null;
  can: (permission: string) => boolean;
  /**
   * Is this module enabled for the tenant (ADR-085)? Visibility only — the backend
   * re-checks with requireModule on every call, so hiding is never the boundary.
   */
  hasModule: (moduleKey: string) => boolean;
  /** Is this capability enabled for the tenant (ADR-085)? Visibility only. */
  hasCapability: (capabilityKey: string) => boolean;
  /** The tenant's enabled module keys. */
  modules: ReadonlySet<string>;
  /** The tenant's enabled capability keys. */
  capabilities: ReadonlySet<string>;
  login: (payload: LoginRequest) => Promise<{ ok: true } | { ok: false; error: string; mfa?: boolean }>;
  logout: () => Promise<void>;
  /** Re-reads the session after the user changes their own profile. */
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const EMPTY_CAPS: Capabilities = {
  wildcard: false,
  permissions: new Set(),
  modules: new Set(),
  capabilities: new Set(),
};

export function AuthProvider({
  api,
  children,
  /**
   * Idle window before the session ends (ADR-082, SECURITY-AUDIT.md L-5). Pass 0 to
   * disable — appropriate only for a surface with nothing worth protecting on screen.
   */
  idleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS,
}: {
  api: ApiClient;
  children: ReactNode;
  idleTimeoutMs?: number;
}) {
  const [status, setStatus] = useState<Status>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [caps, setCaps] = useState<Capabilities>(EMPTY_CAPS);
  const bootstrapped = useRef(false);

  const loadSession = useCallback(async () => {
    // Entitlements ride alongside permissions so the UI reflects the SAME boundary the backend
    // enforces (module → capability → permission). A failure here must not sign the user out:
    // fall back to empty, which hides module-gated items rather than showing what the API refuses.
    const [meRes, permRes, entRes] = await Promise.all([
      api.me(),
      api.myPermissions(),
      api.myEntitlements().catch(() => ({ modules: [], capabilities: [] })),
    ]);
    setUser(meRes.user);
    setCaps({
      wildcard: permRes.wildcard,
      permissions: new Set(permRes.permissions),
      modules: new Set(entRes.modules),
      capabilities: new Set(entRes.capabilities),
    });
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
        // Hydrate from /auth/me (not the login response, which omits `roles`) so the
        // session carries the user's roles and the shell shows them immediately — the
        // same source the on-reload bootstrap uses. `loadSession` fetches the user and
        // the effective permission set in parallel, so this costs no extra latency over
        // the previous permissions-only await.
        await loadSession();
        return { ok: true };
      } catch (err) {
        // Sign-in renders its failure inline (login opts out of the toast), but the
        // copy comes from the same shared classifier every other call uses.
        return { ok: false, error: describeError(err).description };
      }
    },
    [api, loadSession],
  );

  const logout = useCallback(async () => {
    await api.logout();
    clearStoredActivity();
    clearSession();
  }, [api, clearSession]);

  /**
   * Idle sign-out (ADR-082, SECURITY-AUDIT.md L-5). Runs only while a session exists, and
   * revokes it server-side rather than merely forgetting it in memory. Interaction in ANY
   * tab of this origin counts, so a second tab never signs the user out from under the one
   * they are working in.
   */
  useIdleSignOut({
    active: status === "authenticated",
    timeoutMs: idleTimeoutMs,
    onIdle: async () => {
      await api.logout();
      clearSession();
      // Says what happened, so a returning user is not left wondering why the screen
      // emptied. The shared toast — never a page-specific one (ADR-057).
      toast.info({
        title: "Signed out",
        description: `You were signed out after ${Math.round(idleTimeoutMs / 60_000)} minutes of inactivity.`,
        dedupeKey: "session-idle",
      });
    },
  });

  const can = useCallback(
    (permission: string) => caps.wildcard || caps.permissions.has(permission),
    [caps],
  );

  // A module/capability check MIRRORS the server's entitlement; it is never the boundary.
  // WILDCARD deliberately does not bypass it — a platform operator still cannot use a module
  // the tenant has not bought. Entitlement is the tenant's, permission is the user's (ADR-085).
  const hasModule = useCallback((moduleKey: string) => caps.modules.has(moduleKey), [caps]);
  const hasCapability = useCallback(
    (capabilityKey: string) => caps.capabilities.has(capabilityKey),
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
    () => ({
      status,
      user,
      can,
      hasModule,
      hasCapability,
      modules: caps.modules,
      capabilities: caps.capabilities,
      login,
      logout,
      refresh,
    }),
    [status, user, can, hasModule, hasCapability, caps, login, logout, refresh],
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

/** Is the tenant entitled to this module (ADR-085)? Visibility only, never the boundary. */
export function useModule(moduleKey: string): boolean {
  return useAuth().hasModule(moduleKey);
}

/** Is this capability enabled for the tenant (ADR-085)? Visibility only. */
export function useCapability(capabilityKey: string): boolean {
  return useAuth().hasCapability(capabilityKey);
}

/** The tenant's enabled module keys. */
export function useEnabledModules(): ReadonlySet<string> {
  return useAuth().modules;
}

/** The tenant's enabled capability keys. */
export function useEnabledCapabilities(): ReadonlySet<string> {
  return useAuth().capabilities;
}
