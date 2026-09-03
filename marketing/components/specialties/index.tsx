import Link from 'next/link';
import { ArrowRight, Check } from 'lucide-react';
import { Container, SectionHeading } from '../ui/primitives';
import { Reveal } from '../ui/Reveal';
import type { Specialty } from '../../lib/specialties';

/**
 * The reusable specialization system (ADR-034): one set of components, many
 * specialty configurations. No specialty gets a bespoke page design — a new
 * specialty is a data entry in `lib/specialties.ts`, not a new layout.
 */

export function SpecializationCard({ specialty }: { specialty: Specialty }) {
  const Icon = specialty.icon;
  const inner = (
    <>
      <span className="grid h-11 w-11 place-items-center rounded-lg bg-surface-2 text-ink transition-colors group-hover:bg-accent-subtle group-hover:text-accent">
        <Icon size={20} strokeWidth={1.75} aria-hidden />
      </span>
      <div className="mt-4 flex-1">
        <h3 className="text-[1.0625rem] font-medium tracking-tight text-ink">{specialty.name}</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-subtle">{specialty.summary}</p>
      </div>
      {specialty.featured ? (
        <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-accent">
          How it works <ArrowRight size={15} strokeWidth={2} aria-hidden />
        </span>
      ) : null}
    </>
  );

  const className =
    'group flex h-full flex-col rounded-xl border border-hairline bg-surface p-5 transition-colors hover:border-accent-border';

  return specialty.featured ? (
    <Link href={`/specialties/${specialty.slug}`} className={className}>
      {inner}
    </Link>
  ) : (
    <div className={className}>{inner}</div>
  );
}

export function SpecializationGrid({ specialties }: { specialties: Specialty[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {specialties.map((s, i) => (
        <Reveal key={s.slug} delay={Math.min(i, 6) * 40}>
          <SpecializationCard specialty={s} />
        </Reveal>
      ))}
    </div>
  );
}

export function SpecializationFeatureList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h2 className="mk-heading text-ink">{title}</h2>
      <ul className="mt-5 flex flex-col gap-3">
        {items.map((item) => (
          <li key={item} className="flex gap-3">
            <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent-subtle text-accent">
              <Check size={13} strokeWidth={2.5} aria-hidden />
            </span>
            <span className="text-[0.975rem] leading-relaxed text-ink-muted">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SpecializationWorkflow({ steps }: { steps: string[] }) {
  return (
    <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {steps.map((step, i) => (
        <li key={step} className="rounded-xl border border-hairline bg-surface p-5">
          <span className="font-mono text-xs text-accent">{String(i + 1).padStart(2, '0')}</span>
          <p className="mt-2 text-[0.975rem] leading-relaxed text-ink">{step}</p>
        </li>
      ))}
    </ol>
  );
}

export function SpecializationModules({ modules }: { modules: string[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {modules.map((m) => (
        <span
          key={m}
          className="rounded-full border border-hairline bg-surface px-3 py-1.5 text-sm text-ink-muted"
        >
          {m}
        </span>
      ))}
    </div>
  );
}

export function SpecializationSection({
  title,
  lede,
  specialties,
  id,
}: {
  title: string;
  lede?: string;
  specialties: Specialty[];
  id?: string;
}) {
  return (
    <section id={id} className="bg-canvas">
      <Container className="py-20 sm:py-24">
        <SectionHeading eyebrow="By specialty" title={title} lede={lede} />
        <div className="mt-10">
          <SpecializationGrid specialties={specialties} />
        </div>
      </Container>
    </section>
  );
}
