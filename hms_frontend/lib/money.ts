// Money is integer paise on the wire (see billing schema). Format for display, and convert
// rupee input back to paise for requests.

export function formatPaise(paise: number, currency = "INR"): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 2 }).format(
    paise / 100,
  );
}

export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}
