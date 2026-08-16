// The HTTP core every Nirogix frontend shares (ADR-054).
//
// Before this existed, the Portal and the admin console each carried their own copy
// of the same ~140 lines: token handling, the single in-flight refresh, the 401
// retry, error unwrapping, and the one-notification-per-call rule. Two copies was
// tolerable; five would guarantee they drift — and the thing most likely to drift
// is the security-relevant half (when a session is treated as expired, whether a
// failure is announced, whether a message is safe to render).
//
// What stays per app: the DOMAIN functions. Each frontend builds its own client and
// exposes only the endpoints its audience may call, which is what keeps clinical
// calls out of the admin console and platform-administration calls out of the Portal
// (ADR-051).

import type { ApiError, LoginRequest, LoginResponse, MeResponse, MyPermissionsResponse } from "@hms/types";
import { ApiRequestError, NetworkError, TimeoutError } from "./errors";
import { notifyError, notifySuccess, successMessage } from "./feedback";

/** Requests that outlive this are aborted and reported as a timeout, never left hanging. */
const REQUEST_TIMEOUT_MS = 30_000;

export interface RequestOptions {
  method?: string;
  body?: unknown;
  /** Internal: prevents infinite refresh recursion. */
  _retry?: boolean;
  /** When false, a 401 is returned as an error without attempting a refresh. */
  refreshOn401?: boolean;
  /**
   * Notification control (ADR-026). Default: failures always notify; state-changing
   * methods also notify on success. `false` silences both (the screen is the
   * feedback); `{ success: "…" }` sets the fallback copy used when the API returns
   * no `message` of its own; `{ success: false }` keeps only the failure toast.
   */
  feedback?: false | { success?: string | false | ((payload: never) => string); error?: false };
}

export interface ApiClient {
  /** JSON request with auth, refresh-on-401 and the shared feedback rules applied. */
  request: <T>(path: string, opts?: RequestOptions) => Promise<T>;
  /** Raw fetch against the API base — for multipart uploads and streamed downloads. */
  send: (path: string, init: RequestInit) => Promise<Response>;
  /** Turns a failed `Response` into the canonical typed error. */
  parseError: (res: Response) => Promise<ApiRequestError>;
  /** Exchange the refresh cookie for a new access token. Returns true on success. */
  tryRefresh: () => Promise<boolean>;
  setAccessToken: (token: string | null) => void;
  getAccessToken: () => string | null;
  setOnSessionExpired: (cb: (() => void) | null) => void;
  /** Session endpoints every frontend needs to render its shell. */
  login: (payload: LoginRequest) => Promise<LoginResponse>;
  logout: () => Promise<void>;
  me: () => Promise<MeResponse>;
  myPermissions: () => Promise<MyPermissionsResponse>;
}

export interface ApiClientOptions {
  /** e.g. `http://localhost:4000/api/v1`. Never hard-coded in an app — read from config. */
  baseUrl: string;
}

export function createApiClient({ baseUrl }: ApiClientOptions): ApiClient {
  // Access token in memory only — never localStorage. On a full reload the session
  // is re-established from the httpOnly refresh cookie.
  let accessToken: string | null = null;
  let onSessionExpired: (() => void) | null = null;

  async function parseError(res: Response): Promise<ApiRequestError> {
    let code = "ERROR";
    let message = res.statusText || "Request failed";
    let details: unknown;
    try {
      const body = (await res.json()) as ApiError;
      if (body?.error) {
        code = body.error.code ?? code;
        message = body.error.message ?? message;
        details = body.error.details;
      }
    } catch {
      /* non-JSON body — keep the status text */
    }
    return new ApiRequestError(res.status, code, message, details);
  }

  /** Runs the fetch, converting a dead connection or a stalled request into typed errors. */
  async function send(path: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      return await fetch(`${baseUrl}${path}`, { ...init, signal: controller.signal });
    } catch (err) {
      if (controller.signal.aborted) throw new TimeoutError();
      throw new NetworkError("Network request failed", err);
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * The one in-flight refresh. A dashboard fires several requests at once, so an
   * expired access token used to produce one `POST /auth/refresh` **per request** —
   * each rotating the same `sessions` row in its own transaction, serialising on
   * that row lock and draining the connection pool until every request timed out.
   * Callers share a single refresh: the first starts it, the rest await it.
   */
  let inFlightRefresh: Promise<boolean> | null = null;

  async function tryRefresh(): Promise<boolean> {
    if (inFlightRefresh) return inFlightRefresh;
    inFlightRefresh = (async () => {
      try {
        const res = await fetch(`${baseUrl}/auth/refresh`, { method: "POST", credentials: "include" });
        if (!res.ok) {
          accessToken = null;
          return false;
        }
        const data = (await res.json()) as { accessToken: string };
        accessToken = data.accessToken;
        return true;
      } catch {
        accessToken = null;
        return false;
      } finally {
        inFlightRefresh = null;
      }
    })();
    return inFlightRefresh;
  }

  async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    const { method = "GET", body, _retry = false, refreshOn401 = true, feedback } = opts;
    const mutating = method !== "GET" && method !== "HEAD";

    const headers: Record<string, string> = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

    let res: Response;
    try {
      res = await send(path, {
        method,
        headers,
        credentials: "include",
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      if (feedback !== false && feedback?.error !== false) notifyError(err);
      throw err;
    }

    if (res.status === 401 && refreshOn401 && !_retry) {
      const refreshed = await tryRefresh();
      if (refreshed) return request<T>(path, { ...opts, _retry: true });
      if (onSessionExpired) onSessionExpired();
      const expired = await parseError(res);
      if (feedback !== false && feedback?.error !== false) notifyError(expired);
      throw expired;
    }

    if (!res.ok) {
      const failure = await parseError(res);
      if (feedback !== false && feedback?.error !== false) notifyError(failure);
      throw failure;
    }

    const payload = res.status === 204 ? (undefined as T) : ((await res.json()) as T);

    if (mutating && feedback !== false && feedback?.success !== false) {
      notifySuccess(successMessage(payload, feedback?.success, method));
    }

    return payload;
  }

  return {
    request,
    send,
    parseError,
    tryRefresh,
    setAccessToken: (token) => {
      accessToken = token;
    },
    getAccessToken: () => accessToken,
    setOnSessionExpired: (cb) => {
      onSessionExpired = cb;
    },
    // Sign-in renders its failure inline and navigates on success, so it opts out of
    // the toast — the screen itself is the feedback.
    login: (payload) =>
      request<LoginResponse>("/auth/login", { method: "POST", body: payload, refreshOn401: false, feedback: false }),
    logout: async () => {
      try {
        await request<void>("/auth/logout", { method: "POST", feedback: false });
      } finally {
        accessToken = null;
      }
    },
    me: () => request<MeResponse>("/auth/me"),
    myPermissions: () => request<MyPermissionsResponse>("/rbac/permissions"),
  };
}
