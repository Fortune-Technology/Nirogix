import { pgTable, uuid, varchar, integer, boolean, timestamp, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenants } from './tenants';
import { branches } from './branches';
import { providers } from './providers';
import { departments } from './departments';

/**
 * The consultation fee schedule (ADR-117).
 *
 * Before this, the fee was one column — `providers.consultation_fee_paise` — so a hospital charging
 * differently for a follow-up, or for cardiology, or for a senior consultant seen in the same
 * department as a junior, had exactly one way to express that: type the number by hand at every
 * check-in. Which is not a pricing policy. It is a policy held in the receptionist's head, applied
 * inconsistently, and invisible to anyone auditing what the hospital actually charges.
 *
 * A rule matches on any combination of **doctor**, **department**, **consultation type**, **case
 * type** and **how the patient arrived**. A NULL means "any" — so one row can say "every follow-up
 * is ₹200" and another "Dr Sharma, first visit, ₹800", and both are legitimate rules about
 * different things.
 *
 * **The most specific matching rule wins**, and specificity is a number rather than a judgement:
 * doctor (16) beats department (8) beats case type (4) beats consultation type (2) beats arrival
 * type (1). That ordering is the one a hospital means. A named consultant's own fee overrides
 * their department's. And a case type outranks a consultation type because it describes the
 * *arrangement* the hospital is treating under — a corporate or camp tariff is agreed in a
 * contract, and it is meant to survive whatever kind of consultation happens inside it.
 *
 * The weights are powers of two, so the ordering is total: no two distinct combinations can score
 * the same, there is never a tie to break arbitrarily, and the unique index stops the same
 * combination existing twice.
 *
 * Nothing matching falls back to the doctor's own configured fee, and then to zero — which is
 * exactly what the product did before this table existed. A hospital that never opens the screen
 * sees no change.
 */
export const consultationFeeRules = pgTable(
  'consultation_fee_rules',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    /** NULL = every hospital in the organization. A branch row wins over an organization one. */
    branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'restrict' }),

    /** All three NULL-able. NULL means "any", which is what makes one table express every policy. */
    providerId: uuid('provider_id').references(() => providers.id, { onDelete: 'restrict' }),
    departmentId: uuid('department_id').references(() => departments.id, { onDelete: 'restrict' }),
    /** `walk_in` | `appointment` | `follow_up` — the ADR-115 vocabulary, unchanged. */
    arrivalType: varchar('arrival_type', { length: 20 }),
    /**
     * What kind of consultation, in the hospital's own vocabulary (ADR-121). Validated on write
     * against `hospital_workflow_config.consultation_types` for this rule's scope, so a rule can
     * never price a type the hospital does not offer.
     */
    consultationType: varchar('consultation_type', { length: 40 }),
    /** What kind of episode, from the same config's `case_types` (ADR-121). */
    caseType: varchar('case_type', { length: 40 }),

    feePaise: integer('fee_paise').notNull(),

    /**
     * Retired rather than deleted. A rule that priced a consultation last month is part of the
     * explanation for an invoice raised last month, and deleting it erases that explanation.
     */
    isActive: boolean('is_active').notNull().default(true),

    /** Free text, for the hospital's own benefit: "Senior consultant rate", "Camp pricing". */
    label: varchar('label', { length: 200 }),

    createdBy: uuid('created_by'),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Every check-in asks this table one question, filtered to the tenant and the active rules.
    index('consultation_fee_rules_tenant_idx').on(t.tenantId, t.isActive),
  ],
);

export type ConsultationFeeRuleRow = typeof consultationFeeRules.$inferSelect;
