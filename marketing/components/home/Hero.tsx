import { CalendarCheck, ArrowRight } from 'lucide-react';
import { LottiePlayer } from '@hms/ui';
import { Button } from '../ui/Button';
import { Container, Pill } from '../ui/primitives';
import { Reveal } from '../ui/Reveal';
import { SITE } from '../../lib/site';
import { PORTAL_LOGIN_URL } from '../../lib/portal';

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <Container className="pt-14 pb-16 sm:pt-20 sm:pb-20">
        <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
          {/* copy */}
          <div className="max-w-xl">
            <Pill icon={<CalendarCheck size={15} strokeWidth={1.75} className="text-accent" />}>
              For hospitals and clinics in India
            </Pill>
            <h1 className="mk-display mt-5 text-[2.5rem] text-ink sm:text-[3.25rem] lg:text-[3.5rem]">
              The modular hospital platform for Indian healthcare.
            </h1>
            <p className="mk-lede mt-5 text-lg leading-relaxed sm:text-xl">
              Patients, appointments, EMR, pharmacy, lab, and billing in one system. Turn on only
              the modules each hospital needs.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button href={SITE.primaryCta.href} size="lg">
                {SITE.primaryCta.label}
                <ArrowRight size={18} strokeWidth={1.75} />
              </Button>
              <Button href={PORTAL_LOGIN_URL} variant="secondary" size="lg">
                Go to the Portal
              </Button>
            </div>
            <p className="mt-4 text-sm text-ink-faint">
              Onboarding is guided by our team. No credit card, no self-serve setup.
            </p>
          </div>

          {/* doctor animation — the hero's product-brand visual (autoplay + loop).
              A soft light stage sits behind it (invisible in light, a subtle medallion in
              dark) so the illustration's dark line-art stays legible on the dark canvas. */}
          <Reveal delay={120} className="min-w-0">
            <div className="relative mx-auto w-full max-w-[440px] lg:max-w-[520px]">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-[7%] rounded-[3rem]"
                style={{ background: 'var(--mk-illustration-stage)' }}
              />
              <LottiePlayer
                src="/animations/doctor.json"
                tintCssVar="--mk-accent"
                className="relative w-full"
                ariaLabel="Illustration of a doctor caring for a patient"
              />
            </div>
          </Reveal>
        </div>
      </Container>
    </section>
  );
}
