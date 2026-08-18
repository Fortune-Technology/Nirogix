import { Info } from "lucide-react";
import { PageHeader } from "./PageHeader";
import { Container } from "../ui/primitives";

export type LegalSection = { heading: string; body: string[] };

/**
 * Shared layout for legal pages. Carries an explicit, honest notice that the copy
 * is a plain-language summary and the binding document is finalised with counsel
 * before general availability. Content here is not legal advice.
 */
export function LegalPage({
  eyebrow,
  title,
  intro,
  sections,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  sections: LegalSection[];
}) {
  return (
    <>
      <PageHeader eyebrow={eyebrow} title={title} lede={intro} />
      <section className="bg-canvas">
        <Container className="py-14 sm:py-16">
          <div className="mx-auto max-w-3xl">
            <div className="flex items-start gap-3 rounded-xl border border-hairline bg-surface p-5">
              <Info size={19} strokeWidth={1.75} className="mt-0.5 shrink-0 text-accent" />
              <p className="text-sm leading-relaxed text-ink-muted">
                This is a plain-language summary provided for transparency. The binding document is
                finalised and reviewed by legal counsel before general availability. It is not legal
                advice.
              </p>
            </div>

            <div className="mt-10 flex flex-col gap-9">
              {sections.map((s) => (
                <div key={s.heading}>
                  <h2 className="text-xl font-medium tracking-tight text-ink">{s.heading}</h2>
                  {s.body.map((p, i) => (
                    <p key={i} className="mt-3 text-[0.975rem] leading-relaxed text-ink-muted">
                      {p}
                    </p>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
