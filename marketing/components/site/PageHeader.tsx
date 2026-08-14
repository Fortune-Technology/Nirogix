import type { ReactNode } from "react";
import { Container, Eyebrow } from "../ui/primitives";

/**
 * Standard inner-page header: eyebrow + display title + lede, on the cream canvas.
 * Vertical stack only (never the split headline / floating-paragraph pattern).
 */
export function PageHeader({
  eyebrow,
  title,
  lede,
  actions,
}: {
  eyebrow?: string;
  title: ReactNode;
  lede?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="border-b border-hairline bg-canvas">
      <Container className="pt-14 pb-14 sm:pt-16 sm:pb-16">
        <div className="max-w-3xl">
          {eyebrow && <Eyebrow className="mb-4">{eyebrow}</Eyebrow>}
          <h1 className="mk-display text-[2.25rem] text-ink sm:text-5xl">{title}</h1>
          {lede && (
            <p className="mk-lede mt-5 max-w-2xl text-lg leading-relaxed sm:text-xl">{lede}</p>
          )}
          {actions && <div className="mt-8 flex flex-wrap items-center gap-3">{actions}</div>}
        </div>
      </Container>
    </section>
  );
}
