import { NextResponse, type NextRequest } from "next/server";
import { buildContentSecurityPolicy, originOf, SECURITY_HEADERS } from "@hms/utils";

/**
 * Content-Security-Policy with a per-request nonce, plus the platform's static security
 * headers (ADR-082, SECURITY-AUDIT.md M-1).
 *
 * Next reads the CSP off the REQUEST headers and stamps the nonce onto every script it
 * emits, so the policy and the markup can never disagree. The root layout reads the same
 * nonce from `x-nonce` for the one inline script the app owns (the no-flash theme script).
 *
 * The matcher deliberately skips static assets: they carry no script, and running this on
 * them would only cost latency. Prefetch requests are skipped too — Next reuses the
 * prefetched payload, so a nonce minted for a prefetch would be stale by the time the page
 * renders.
 */
export default function proxy(request: NextRequest): NextResponse {
  const nonce = crypto.randomUUID();
  const csp = buildContentSecurityPolicy({
    nonce,
    connectSrc: [originOf(process.env.NEXT_PUBLIC_API_BASE_URL) ?? "http://localhost:4000"],
    development: process.env.NODE_ENV === "development",
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("content-security-policy", csp);
  for (const { key, value } of SECURITY_HEADERS) response.headers.set(key, value);
  return response;
}

export const config = {
  matcher: [
    {
      source:
        "/((?!api|_next/static|_next/image|favicon.ico|icon.svg|animations|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|json)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
