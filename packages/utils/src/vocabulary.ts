/**
 * Small closed vocabularies the product asks for on more than one screen.
 *
 * These are **domain lists, not design-system data** — which is why they live here rather than in
 * `@hms/ui`: `ui` depends on `utils`, so the other direction would invert the graph, and a blood
 * group is not a UI concern in any case. The shape is `{ value, label }` because that is what
 * every dropdown in the product consumes; it is structurally a `SelectOption` without this package
 * having to know that type exists.
 *
 * A list belongs here once a **second** screen needs it (ADR-029). Gender and blood group had each
 * been written out four times, in four slightly different orders, with four different words for
 * "not recorded" — which is precisely how two screens come to disagree about what the same column
 * means. Anything a *hospital* defines for itself (consultation types, case types, departments)
 * does **not** belong here: those come from that tenant's own configuration.
 */

export interface VocabularyOption {
  value: string;
  label: string;
  /** A second line where the code alone does not say what it means. */
  description?: string;
}

/**
 * Administrative gender, matching what the backend stores and what ABDM returns.
 *
 * "Not specified" is a real answer and the empty value carries it — a patient registered at a
 * counter from a phone call may genuinely not have been asked, and forcing a guess writes a wrong
 * value rather than an absent one.
 */
export const GENDER_OPTIONS: readonly VocabularyOption[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
];

/**
 * The eight ABO/Rh groups. Ordered as a lab reports them, not alphabetically.
 *
 * Label and value are **the same string**, hyphen and all. A typographic minus (`A−`) reads
 * better in isolation and is wrong here: the stored value is `A-`, and every other surface —
 * the patient chart's blood-group alert, a print document, an export — renders that stored
 * value directly. A picker that spelled it differently from the chart beside it would look
 * like two different answers to the same question.
 */
export const BLOOD_GROUP_OPTIONS: readonly VocabularyOption[] = [
  { value: 'A+', label: 'A+' },
  { value: 'A-', label: 'A-' },
  { value: 'B+', label: 'B+' },
  { value: 'B-', label: 'B-' },
  { value: 'AB+', label: 'AB+' },
  { value: 'AB-', label: 'AB-' },
  { value: 'O+', label: 'O+' },
  { value: 'O-', label: 'O-' },
];

/**
 * Whether a record is in use or put away. Archived is never deleted (invariant #6), so the word
 * on screen has to be "archived" rather than anything that sounds like removal.
 */
export const RECORD_STATUS_OPTIONS: readonly VocabularyOption[] = [
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived', description: 'Kept, but out of the working list' },
];
