/*
 * Availability — the one place the site decides what may be described as
 * existing today and what is described as planned scope.
 *
 * Binding rule (resources/rules.md → Marketing Content & Claim Accuracy): every
 * claim traces to the PRD / architecture / development plan / a defined phase, and
 * a capability planned for a later phase is never presented as currently
 * available. Statuses here are the trace:
 *
 *   built   → implemented in the product (Phase 0 + MVP 0/1, resources/phases.md),
 *             verified locally ahead of the first release.
 *   planned → specified in resources/projectrequirementdoc.md and scheduled in
 *             resources/phases.md (Phase 2-4 / add-ons). Not built.
 *
 * A module moves to `built` in the same change that ships it — never ahead of it.
 */

export type Availability = 'built' | 'planned';

export const AVAILABILITY: Record<Availability, { label: string; note: string }> = {
  built: {
    label: 'Built',
    note: 'Implemented in the product and in verification ahead of the first release.',
  },
  planned: {
    label: 'Planned',
    note: 'Specified in our product plan and scheduled for a later phase. Not built yet.',
  },
};

/**
 * Where the product actually is. Shown wherever the catalogue is presented, so
 * breadth is never mistaken for availability.
 */
export const RELEASE_NOTE =
  'The clinic-core modules are built and in verification ahead of our first release. Everything marked Planned is scheduled scope from our product plan, not something you can use today.';
