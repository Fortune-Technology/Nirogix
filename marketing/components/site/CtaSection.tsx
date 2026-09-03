import Link from 'next/link';
import { Button } from '../ui/Button';
import { Container } from '../ui/primitives';

/**
 * Reusable closing CTA — inverted charcoal banner. Primary intent is always
 * "Book a demo" (single CTA intent across the whole site); the secondary link
 * varies per page.
 */
export function CtaSection({
  title = 'See it running with your own workflows.',
  body = 'Book a walkthrough and we will map your clinic or hospital onto the platform, module by module.',
  secondaryLabel = 'Explore the platform',
  secondaryHref = '/platform',
}: {
  title?: string;
  body?: string;
  secondaryLabel?: string;
  secondaryHref?: string;
}) {
  return (
    <section className="bg-canvas">
      <Container className="py-20 sm:py-24">
        <div className="overflow-hidden rounded-2xl bg-surface-ink px-8 py-14 text-center sm:px-14 sm:py-16">
          <h2 className="mk-heading mx-auto max-w-2xl text-3xl text-ink-inverse sm:text-4xl">
            {title}
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-white/70">{body}</p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button href="/contact" variant="accent" size="lg">
              Book a demo
            </Button>
            <Link
              href={secondaryHref}
              className="rounded-md px-5 py-3 text-base font-medium text-white/85 transition-colors hover:text-white"
            >
              {secondaryLabel}
            </Link>
          </div>
        </div>
      </Container>
    </section>
  );
}
