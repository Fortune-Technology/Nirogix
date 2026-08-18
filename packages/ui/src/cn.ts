// Tiny classname joiner (avoids a clsx dependency for a one-liner). Falsy values drop out.
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
