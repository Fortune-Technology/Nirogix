// The Portal's typed API failures.
//
// Kept in their own module so the API client (lib/api.ts) and the feedback layer
// (lib/feedback.ts) can both use them without an import cycle. `ApiRequestError`
// carries the backend's canonical `{ error: { code, message, details? } }`;
// `details` is for logs and never rendered to a user.

export class ApiRequestError extends Error {
  code: string;
  status: number;
  details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
  get isForbidden(): boolean {
    return this.status === 403;
  }
  get isUnauthorized(): boolean {
    return this.status === 401;
  }
}

/** The request never reached the server (offline, DNS, CORS, connection reset). */
export class NetworkError extends Error {
  cause?: unknown;
  constructor(message = "Network request failed", cause?: unknown) {
    super(message);
    this.name = "NetworkError";
    this.cause = cause;
  }
}

/** The request exceeded the client-side timeout. */
export class TimeoutError extends Error {
  constructor(message = "Request timed out") {
    super(message);
    this.name = "TimeoutError";
  }
}
