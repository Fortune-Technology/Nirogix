import { NextResponse, type NextRequest } from "next/server";
import { buildContentSecurityPolicy, originOf, SECURITY_HEADERS } from "@hms/utils";

/**
 * Content-Security-Policy and the platform's static security headers for the public site
 * (ADR-082, SECURITY-AUDIT.md M-1).
 *
 * Unlike the four authenticated apps, this one carries NO nonce. Its pages are statically
 * rendered and cached, which is what keeps the marketing site fast and indexable, and a
 * per-request nonce would force every page to render per request. Scripts therefore fall
 * back to `'unsafe-inline'` while every other directive stays strict — see the note in
 * `@hms/utils/security` for why that trade is acceptable HERE and nowhere else: this site
 * renders no user input, holds no session, and reaches no PHI.
 *
 * Adding an authenticated surface or a form that echoes input to this app changes that
 * calculation — move it to nonce mode at that point, not after.
 */
export default function proxy(request: NextRequest): NextResponse {
  const csp = buildContentSecurityPolicy({
    connectSrc: [originOf(process.env.NEXT_PUBLIC_API_BASE_URL) ?? "http://localhost:4000"],
    development: process.env.NODE_ENV === "development",
  });

  const response = NextResponse.next({ request });
  response.headers.set("content-security-policy", csp);
  for (const { key, value } of SECURITY_HEADERS) response.headers.set(key, value);
  return response;
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|icon.svg|animations|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico|json|xml|txt)$).*)",
  ],
};
