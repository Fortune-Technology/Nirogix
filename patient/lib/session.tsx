"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useIdleSignOut } from "@hms/client";
import { toast } from "@hms/ui";
import type { PatientSession } from "@hms/types";
import * as api from "./api";

/**
 * The patient session (ADR-052, F-8).
 *
 * Deliberately **not** the shared `AuthProvider` from `@hms/client`. That one is built
 * for staff: organization code, email and password, then an effective permission set
 * from `/rbac/permissions`. A patient has none of those. Bending the shared provider to
 * cover both would put the difference between two principals inside a component that is
 * about neither.
 *
 * **The session now survives a reload.** The access token stays in memory — never
 * `localStorage`, which is the right default for a surface carrying medical records —
 * and on mount the portal exchanges an httpOnly, path-scoped refresh cookie for a new
 * one. The cookie is scoped to `/api/v1/patient/auth`, so it is not even sent to a staff
 * endpoint.
 */

type Status = "loading" | "signed-in" | "signed-out";

interface SessionContextValue {
  status: Status;
  identity: PatientSession["identity"] | null;
  signedIn: boolean;
  signIn: (session: PatientSession) => void;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [identity, setIdentity] = useState<PatientSession["identity"] | null>(null);
  const bootstrapped = useRef(false);

  // Re-establish an existing session once on load. No cookie is the ordinary first-visit
  // case, so it resolves to signed-out rather than surfacing an error.
  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    void (async () => {
      const session = await api.restoreSession();
      if (session) {
        api.setAccessToken(session.accessToken);
        setIdentity(session.identity);
        setStatus("signed-in");
      } else {
        setStatus("signed-out");
      }
    })();
  }, []);

  const signIn = useCallback((session: PatientSession) => {
    api.setAccessToken(session.accessToken);
    setIdentity(session.identity);
    setStatus("signed-in");
  }, []);

  const signOut = useCallback(async () => {
    // Revokes the session server-side, so the refresh token is dead rather than dropped.
    await api.signOut();
    setIdentity(null);
    setStatus("signed-out");
  }, []);

  /**
   * Idle sign-out (ADR-082, SECURITY-AUDIT.md L-5). The same policy the staff apps use —
   * this portal shows a patient their own records, and it is opened on borrowed phones and
   * hospital kiosks as often as on a personal device. The hook is shared with `@hms/client`
   * rather than written twice; only the sign-out call differs, because a patient session is
   * its own principal (ADR-052).
   */
  useIdleSignOut({
    active: status === "signed-in",
    onIdle: async () => {
      await signOut();
      toast.info({
        title: "Signed out",
        description: "You were signed out after a period of inactivity.",
        dedupeKey: "session-idle",
      });
    },
  });

  const value = useMemo<SessionContextValue>(
    () => ({ status, identity, signedIn: status === "signed-in", signIn, signOut }),
    [status, identity, signIn, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within <SessionProvider>");
  return ctx;
}
