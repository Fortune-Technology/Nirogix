import { pgTable, uuid, varchar, integer, timestamp, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenants } from './tenants';
import { fileMetadata } from './files';

/**
 * A person's signature image, kept as an append-only series of versions (ADR-137).
 *
 * **This is an electronic signature — an image the user uploaded, rendered onto a document.**
 * It is not a cryptographic digital signature: nothing here signs a hash, nothing verifies
 * tamper-evidence, and no certificate authority is involved. The distinction is written into
 * the schema comment because it is the thing that must never be overstated to a hospital.
 *
 * **Versions, not edits.** A new upload inserts a new row and marks the previous one
 * `superseded`; a row is never updated to point at different bytes. That is the whole mechanism
 * behind the rule that matters: a document records WHICH version signed it, so a doctor changing
 * their signature next year cannot change what a prescription printed last year shows.
 *
 * The image itself lives in object storage like every other upload (ADR-007); this table holds
 * the version, the owner, and the pointer.
 */
export const userSignatures = pgTable(
  'user_signatures',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    // Whose signature it is. No FK to `users` on purpose: the row outlives the account, because a
    // document signed years ago still has to render the signature that signed it.
    userId: uuid('user_id').notNull(),
    fileId: uuid('file_id')
      .notNull()
      .references(() => fileMetadata.id, { onDelete: 'restrict' }),
    /** 1, 2, 3 … per user. The number a document's audit trail can name. */
    version: integer('version').notNull(),
    // active | superseded | removed. `removed` is a user withdrawing their signature from FUTURE
    // documents; the row stays so past documents still resolve (invariant #6).
    status: varchar('status', { length: 20 }).notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    retiredAt: timestamp('retired_at', { withTimezone: true }),
  },
  (t) => [
    // The hot read: "this user's current signature".
    index('user_signatures_user_idx').on(t.tenantId, t.userId, t.status),
  ],
);

export type UserSignature = typeof userSignatures.$inferSelect;
