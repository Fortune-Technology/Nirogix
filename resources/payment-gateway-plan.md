# Payment Gateway — Implementation Plan (Nirogix)

> **Status:** Planning / not yet built. This is the engineering execution plan for the **Online Payment Gateway** capability (`billing.payment_gateway`, currently `AVAILABLE` in the module registry — declared, no code). It is written **against the existing codebase**, reuses what already runs, and must not break the counter-payment flow that ships today.
>
> **Read first:** `CLAUDE.md` (invariants + binding rules), `resources/architecture.md` (§ Billing & Payments), `resources/rules.md`, and the source files this plan cites. On any conflict the four upstream docs win over this plan.
>
> When implementation starts: append an **ADR** to `DECISIONS.md` (the tenant/branch payment-account model + provider abstraction), add a **`BACKLOG.md`** entry for anything deferred, and update `testcases.md`, `docs/manual-testing-guide.md`, `marketing/lib/availability.ts` and `resources/marketing-product-capability-reference.html` **in the same change that ships each piece** (ADR-038).

---

## 0. What this builds, and what it defers

**Builds now (against your Paytm _staging MID + test key_):**

- A first-class **Payment Account** entity (merchant/settlement identity), owned by a **tenant** (org-wide default) or scoped to a **branch** (override).
- A **provider abstraction** (`PaymentProviderAdapter`) with a **Paytm adapter** + a **mock** adapter, mirroring the ABDM `gateway`/`mock` pattern.
- **Central resolution** (`resolvePaymentAccount`) used by every module — never duplicated.
- **Online payment** initiation → hosted checkout → **signed webhook** (source of truth) → **reconciliation** job (safety net).
- **Refunds** (full + partial), **shareable payment link / QR** for patients who are not logged in (ADR-056).
- Admin screens to connect / test / replace credentials, all **encrypted at rest** (ADR-084) and never returned to the browser.

**Deferred on purpose (schema-ready, not built):**

- **Sub-merchant / connected-account / split settlement** (Stripe-Connect-style, and Paytm/Razorpay/Cashfree marketplace products). The `connection_type` column exists from day one so this is additive later — but it needs a **partner/aggregator agreement** and per-facility KYC, which the test key does not grant. Until then every account is `OWN_CREDENTIALS` (bring-your-own).
- A platform-level **"organization group" that owns multiple tenants** — see §3.1. Not needed if a group = one tenant + many branches (recommended).
- `facility_payment_accounts` junction (many providers / fallback per branch) — the `tenant_id + nullable branch_id` model covers every scenario today; add the junction only when a real multi-provider-per-branch need appears (clean-code rule: no unused table).

---

## 1. Grounding — the code this plan builds on

| Concern                          | Where it lives today                                                                                                                                                 | How the plan uses it                                                                               |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Tenancy boundary                 | `hms_backend/src/db/schema/tenants.ts` — _"tenant = a hospital/clinic organization"_                                                                                 | A Payment Account's **tenant-level** owner = the "org default"                                     |
| Facility / location              | `hms_backend/src/db/schema/branches.ts` (`tenant_id` + RLS)                                                                                                          | A Payment Account's **branch** scope = the facility override                                       |
| Money ledger (FTI, invariant #8) | `hms_backend/src/db/schema/billing.ts` — `invoices`, `invoice_line_items`, `payments`                                                                                | **Extend** `payments`, never fork it; money stays integer **paise** in `bigint`                    |
| Payment recording                | `hms_backend/src/modules/billing/billing.service.ts` → `recordPayment()` (idempotent, emits `payment.received`)                                                      | Webhook success calls a shared `applyGatewayPayment()` that mirrors it                             |
| Encryption at rest               | `hms_backend/src/security/encryption.ts` — `encryptSecret` / `decryptSecret` / `safeEqual` / `assertEncryptionReady` (AES-256-GCM, `ENCRYPTION_KEY`, ADR-084)        | Store credentials; verify webhook signatures with `safeEqual`                                      |
| Provider pattern                 | `hms_backend/src/modules/abdm/providers/types.ts` — one interface, `gateway` + `mock`, typed `AbdmGatewayError`                                                      | Copy for `PaymentProviderAdapter` + `PaytmAdapter` + `MockPaymentProvider` + `PaymentGatewayError` |
| Service abstraction              | `hms_backend/src/modules/notification/communication.service.ts` (the one door to a provider)                                                                         | `PaymentGatewayService` is the one door to a payment provider                                      |
| Module + capability gate         | `hms_backend/src/http/{requireModule,requireCapability,requirePermission}.ts`; registry in `packages/permissions/src/index.ts`                                       | Gate every route; flip `billing.payment_gateway` to `BUILT`                                        |
| Public / unauthenticated writes  | `hms_backend/src/modules/organization/{selfCheckin,registration,booking}.service.ts` + `organization.routes.ts` (ADR-056: opaque token, tenant resolved server-side) | QR / payment link + webhook follow this exact pattern                                              |
| Domain events                    | `hms_backend/src/events/eventBus.ts` (`publish`/`subscribe`), subscribers in `src/events/subscribers.ts`                                                             | Webhook success re-emits `payment.received` — nothing downstream changes                           |
| Background jobs                  | `hms_backend/src/jobs/{runner,processors,bullmqRunner}.ts` (`registerProcessor`)                                                                                     | Reconciliation is a `payment.reconcile` processor                                                  |

**Non-negotiables that shape every decision below:** invariant #1 (tenant isolation via RLS — a payment account is tenant-scoped), invariant #8 (one Financial Transaction Infrastructure), ADR-056 (one careful public write path), ADR-057 (one shared toast; a handled failure opts out), ADR-084 (credential encryption), ADR-085 (module→capability→permission chain), ADR-130 (a test double no kinder than the real sandbox).

---

## 2. Core model decisions (the corrections that make the plan fit)

1. **Hierarchy is `tenant → branch`, not `organization → facility`.** There is **no** table where one organization owns several tenants. Map: _Organization ⇒ Tenant_, _Facility (Hospital/Clinic) ⇒ Branch_. "Org-default account" = tenant-level (`branch_id NULL`); "facility override" = branch-level (`branch_id` set). This is the established `branch_id nullable (NULL = org-wide)` pattern (see `invoices.branchId`, `tenant_capability_entitlements.branchId`).
2. **No polymorphic `owner_type/owner_id`.** A Payment Account carries `tenant_id` (always → RLS) + `branch_id` (nullable). Real FKs, RLS-clean, simpler.
3. **Extend the live `payments` table; do not create a second one.** Add nullable `payment_account_id`, `provider`, `payment_transaction_id`. An online payment is a normal `payments` row with `method` = the instrument the patient chose (`upi`/`card`/`netbanking`) and a non-null `payment_account_id`.
4. **Nirogix owns the payment identity.** The provider's transaction id is a _reference_ on our row, never the primary key.
5. **The provider vocabulary is translated once**, in the adapter, into our normalized status model. No Paytm/Razorpay status string leaks past the adapter.

### 2.1 The RLS decision to confirm before coding (owner input)

"A corporate group sharing one settlement account across its hospitals" is trivial **when those hospitals are branches of one tenant** (a tenant-level account). If a customer instead wants each hospital as a **separate tenant** _and_ one shared merchant account, that **crosses the tenant boundary** and cannot be a shared row without violating invariant #1 — it is a different, larger feature (a platform "organization group") with real GST/settlement/RBI consequences. **Recommendation: define a group as one tenant + many branches.** Flag any cross-tenant sharing to the owner as out of scope for this plan.

---

## 3. Data model

All new tables are **tenant-scoped** (`tenant_id` + RLS policy from `src/db/rls.ts`). All money is **integer paise** in `bigint`. Migrations are **additive and reversible**; no backfill is required (new tables start empty, new `payments` columns are nullable).

### 3.1 `payment_accounts` — the merchant / settlement identity

| Column                                     | Type                    | Notes                                                                                          |
| ------------------------------------------ | ----------------------- | ---------------------------------------------------------------------------------------------- |
| `id`                                       | uuid pk                 |                                                                                                |
| `tenant_id`                                | uuid not null → tenants | RLS scope                                                                                      |
| `branch_id`                                | uuid null → branches    | **NULL = tenant-wide default**; set = branch override                                          |
| `provider`                                 | varchar(20)             | `paytm` \| `razorpay` \| `cashfree` \| `mock` (extensible; never hard-coded in business logic) |
| `display_name`                             | varchar(120)            | e.g. "Paytm — main settlement"                                                                 |
| `merchant_id`                              | varchar(120)            | the MID; **masked** in every API response                                                      |
| `credentials_encrypted`                    | text                    | `encryptSecret(JSON.stringify({ merchantKey, … }))` — never plaintext, never logged            |
| `environment`                              | varchar(12)             | `test` \| `production` (keeps staging + prod keys separate per tenant)                         |
| `connection_type`                          | varchar(20)             | default `OWN_CREDENTIALS`; future `CONNECTED_ACCOUNT` \| `SUB_MERCHANT` \| `PLATFORM_MANAGED`  |
| `settlement_entity_name`                   | varchar(200)            | who the money settles to (informational)                                                       |
| `status`                                   | varchar(20)             | `NOT_CONFIGURED` \| `PENDING` \| `CONNECTED` \| `ACTIVE` \| `FAILED` \| `DISABLED`             |
| `is_default`                               | boolean                 | the tenant default when `branch_id IS NULL`                                                    |
| `version`                                  | int                     | optimistic lock (concurrently-edited record)                                                   |
| `created_by` / `created_at` / `updated_at` |                         |                                                                                                |

Constraints: partial unique index — **at most one active default per (tenant, branch)** (and one tenant-wide default per tenant). Never physically deleted (invariant #6) — retire by `status = DISABLED`.

### 3.2 `payments` (EXTEND the existing table — additive nullable columns)

Add: `payment_account_id uuid null`, `provider varchar(20) null`, `payment_transaction_id uuid null`. Keep everything else (`method`, `reference`, `status` = `captured|refunded|failed`, `idempotency_key` unique per tenant). A counter cash payment leaves the new columns NULL; a gateway payment fills them.

### 3.3 `payment_transactions` — every provider interaction (NEW)

| Column                      | Type                             | Notes                                                                       |
| --------------------------- | -------------------------------- | --------------------------------------------------------------------------- |
| `id`                        | uuid pk                          | Nirogix's own id                                                            |
| `tenant_id`                 | uuid not null                    | RLS                                                                         |
| `invoice_id`                | uuid not null → invoices         |                                                                             |
| `payment_account_id`        | uuid not null → payment_accounts | which merchant identity                                                     |
| `payment_id`                | uuid null → payments             | set when a SUCCESS capture writes the money-ledger row                      |
| `type`                      | varchar(20)                      | `PAYMENT` \| `AUTHORIZE` \| `CAPTURE` \| `REFUND` \| `VOID` \| `ADJUSTMENT` |
| `provider`                  | varchar(20)                      |                                                                             |
| `status`                    | varchar(20)                      | **normalized** — see §6.3                                                   |
| `amount_paise`              | bigint                           |                                                                             |
| `provider_order_id`         | varchar(120)                     | our order handed to the provider                                            |
| `provider_transaction_id`   | varchar(120)                     | the provider's txn id (a reference)                                         |
| `idempotency_key`           | varchar(200)                     | unique per tenant                                                           |
| `gateway_response_safe`     | jsonb                            | **filtered** provider response — no secrets/PAN/full instrument             |
| `created_at` / `updated_at` |                                  |                                                                             |

### 3.4 `payment_links` — shareable / QR (NEW, ADR-056)

`id`, `tenant_id`, `invoice_id`, `token varchar(64)` (opaque, **unique platform-wide + indexed** — the public lookup key, never the tenant/invoice id), `status` (`active|paid|expired|cancelled`), `expires_at`, `created_by`, `created_at`. The public endpoint resolves tenant + invoice **from the token, server-side**. Regenerable (retires a photographed QR).

### 3.5 `payment_webhook_events` — inbound event log + idempotency (NEW)

`id`, `tenant_id null` (resolved from the account), `provider`, `provider_event_id varchar(160)`, `payment_transaction_id null`, `signature_valid boolean`, `payload_safe jsonb`, `status` (`received|processed|ignored|failed`), `received_at`, `processed_at`. **Unique `(provider, provider_event_id)`** — this is the idempotency backstop for duplicate deliveries.

### 3.6 Migration safety

- One additive, reversible Drizzle migration: 4 new tables + 3 nullable columns on `payments` + RLS policies for the 4 tenant-scoped tables + the partial-unique index.
- **No data backfill.** Existing invoices/payments are untouched; counter payments keep working with the new columns NULL.
- Enabling the capability (deny-by-exception, on once `BUILT` + module entitled) does **not** change behaviour for a tenant with no configured account — `resolvePaymentAccount` throws `PAYMENT_ACCOUNT_NOT_CONFIGURED` and only the _online_ option is unavailable; cash/counter is unaffected.

---

## 4. Permissions & capability registry (`packages/permissions/src/index.ts`)

1. **New permission keys** (dot-hierarchy; add to `PERMISSIONS` + labels), following the ADR-129 view/manage pair:
   - `BILLING_PAYMENT_GATEWAY_VIEW = 'billing.payment_gateway.view'` — _"View payment-gateway status / take an online payment"_ → held by **cashier + reception** (so they can launch an online collection and read masked account status).
   - `BILLING_PAYMENT_GATEWAY_MANAGE = 'billing.payment_gateway.manage'` — _"Connect and manage payment accounts"_ → **administrator only**. Because `org_admin` is **derived** (ADR-125/126: every permission except the operator/clinician-only lists), do **not** add this to `OPERATOR_ONLY_PERMISSIONS` / `CLINICIAN_ONLY_PERMISSIONS` and the admin gets it automatically.
   - `BILLING_REFUND = 'billing.payment.refund'` — _"Refund a payment"_ → administrator / billing-manager; **not** the plain cashier.
2. **Capability constant:** add `BILLING_PAYMENT_GATEWAY: 'billing.payment_gateway'` to the `CAPABILITIES` map (next to `BILLING_SERVICES`).
3. **Flip the registry entry to BUILT** (currently `cap('billing', 'payment_gateway', 'Online Payment Gateway')`, default `AVAILABLE`):
   ```
   cap('billing', 'payment_gateway', 'Online Payment Gateway', 'BUILT', {
     permissions: [P.BILLING_PAYMENT_GATEWAY_VIEW, P.BILLING_PAYMENT_GATEWAY_MANAGE, P.BILLING_REFUND],
   }),
   ```
   Do this **only in the change that ships working code** (ADR-038 honesty rule).
4. **Route gate everywhere:** `requireAuth → requireModule('billing') → requireCapability('billing', CAPABILITIES.BILLING_PAYMENT_GATEWAY) → requirePermission(…)`.

---

## 5. Provider abstraction (mirror ABDM `providers/`)

New folder `hms_backend/src/modules/payment/providers/`.

### 5.1 The contract — `providers/types.ts`

```
export interface PaymentProviderAdapter {
  readonly name: 'paytm' | 'razorpay' | 'cashfree' | 'mock';
  createOrder(i: { amountPaise; orderId; account: DecryptedAccount; invoiceRef; customer? }):
    Promise<{ providerOrderId; providerToken; checkoutParams: Record<string, string> }>;
  getStatus(i: { account; providerOrderId | providerTransactionId }): Promise<NormalizedPaymentStatus>;
  verifyWebhook(i: { rawBody: Buffer; headers; account }): { valid: boolean; event: NormalizedWebhookEvent };
  refund(i: { account; providerTransactionId; amountPaise; refundId }): Promise<{ providerRefundId; status: NormalizedPaymentStatus }>;
  getRefundStatus(i: { account; providerRefundId }): Promise<NormalizedPaymentStatus>;
}
export class PaymentGatewayError extends Error {
  constructor(public status: number, public providerCode: string | undefined, message: string, public details?: unknown) { super(message); }
}
```

- **`PaytmAdapter`** — the only real adapter buildable now (staging MID + test key). Reads Paytm host from config by `environment`; decrypts credentials just-in-time; uses Paytm checksum utilities for signing/verifying.
- **`MockPaymentProvider`** — deterministic, offline, used by unit/api/e2e tests and local dev. **ADR-130:** the mock is **no kinder than the Paytm sandbox** — it does not echo back the amount it was asked for, does not "succeed" a webhook the real gateway would leave pending, and surfaces the same shapes of failure. A mock that is more agreeable than the sandbox hides exactly the bugs this layer exists to catch.

### 5.2 Registry (no hard-coded providers in business logic)

`providers/index.ts` maps `provider` → adapter instance. `PaymentService` selects by the account's `provider` field. Adding Razorpay later = a new adapter file + one registry line; **no change to the payment domain**.

### 5.3 Normalized status model (§ used everywhere above)

`CREATED → PENDING → PROCESSING → SUCCESS | FAILED | CANCELLED | EXPIRED`, plus `REFUNDED | PARTIALLY_REFUNDED` on the payment. Each adapter owns its provider→internal mapping table.

---

## 6. Central resolution & service

### 6.1 `resolvePaymentAccount(tenantId, branchId?)` — ONE place (never duplicated)

```
1. active account where tenant_id = ? AND branch_id = branchId      → use it (facility override)
2. else active account where tenant_id = ? AND branch_id IS NULL AND is_default  → use it (org default)
3. else throw Errors.paymentAccountNotConfigured()   // new error in src/http/error.ts
```

Lives in `hms_backend/src/modules/payment/paymentAccount.service.ts`. OPD, pharmacy, lab, appointment billing all call it — they never look up an account themselves.

### 6.2 `PaymentGatewayService` (the one door)

`createOnlinePayment()`, `getPaymentStatus()`, `handleWebhook()`, `refundPayment()`, `reconcile()`. It resolves the account, decrypts creds, selects the adapter, writes `payment_transactions`, and on a verified SUCCESS calls the shared `applyGatewayPayment()` (below).

### 6.3 `applyGatewayPayment()` — reuse, don't reinvent

Mirrors `billing.service.recordPayment()`: inserts a `payments` row (`method` = instrument, `payment_account_id`, `provider`, `reference` = provider txn id, `status='captured'`, `idempotency_key` = the transaction's key), recomputes `amountPaidPaise` + invoice status from the ledger, and **emits the same `payment.received` event**. Downstream (receipts, portal history, dashboards) needs zero changes.

---

## 7. API surface

All under `/api/v1`, documented in OpenAPI (`payment.openapi.ts`, generated from Zod — CI gates it), every body Zod-validated.

### 7.1 Admin — manage accounts (staff, administrator)

| Method | Path                                 | Gate                       | Purpose                                                                     |
| ------ | ------------------------------------ | -------------------------- | --------------------------------------------------------------------------- |
| GET    | `/billing/payment-accounts`          | module+cap+`…gateway.view` | List (masked MID, status, environment, "used by N branches")                |
| POST   | `/billing/payment-accounts`          | …+`…gateway.manage`        | Create — `encryptSecret` immediately                                        |
| PATCH  | `/billing/payment-accounts/:id`      | …+`…gateway.manage`        | Replace credentials / set default / enable / disable (optimistic `version`) |
| POST   | `/billing/payment-accounts/:id/test` | …+`…gateway.manage`        | Test connection (server-side; never activates an invalid account)           |

### 7.2 Take an online payment (staff cashier, or patient)

| Method | Path                                          | Gate                                            | Purpose                                                     |
| ------ | --------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------- |
| POST   | `/billing/invoices/:id/online-payment`        | module+cap+`…gateway.view` (+`BILLING_PAYMENT`) | Create order, return **safe** checkout payload (token only) |
| GET    | `/billing/invoices/:id/online-payment/:txnId` | …+`…gateway.view`                               | Poll normalized status (redirect page reads this)           |
| POST   | `/billing/payments/:id/refund`                | module+cap+`BILLING_REFUND`                     | Full/partial refund                                         |

> **Patient-initiated (logged-in portal):** `requireAuth` rejects a `patient` principal on staff routes by design. A logged-in patient uses the **patient session guard** (confirm the patient-auth middleware) on a patient-scoped variant, **or** the public link below. For the first release (test key), staff-initiated + the public link cover it.

### 7.3 Public — payment link / QR (NO auth, ADR-056)

| Method | Path                   | Purpose                                                                                      |
| ------ | ---------------------- | -------------------------------------------------------------------------------------------- |
| GET    | `/pay/:token`          | Resolve invoice + account **from token server-side**; return amount due + safe checkout init |
| POST   | `/pay/:token/initiate` | Create the order for the link                                                                |
| POST   | `/webhooks/:provider`  | **Webhook — the source of truth**                                                            |

ADR-056 rules for `/pay/:token` and `/webhooks/*`: tenant resolved **server-side** from the opaque token / the account behind the verified signature (never from body/query/subdomain); **same status + message** for unknown / expired / disabled (no enumeration); **rate-limited at the sign-in tier**; **audited with no actor**; never writes to a clinical table. Mount `/webhooks/*` **outside** `requireAuth` with a **raw-body** parser (signature is computed over the raw bytes).

---

## 8. Payment flows

### 8.1 Happy path (see the sequence diagram shared in chat)

`Pay` → resolve account → `payment_transactions=CREATED` (our id) → adapter `createOrder` (decrypt creds, S2S) → `PENDING` → safe token to FE → hosted checkout (patient picks UPI/card) → **two parallel paths:** (a) **browser redirect = UX only, never trusted**; (b) **signed webhook = truth**. Webhook verifies signature (`safeEqual`) → idempotency check (`payment_webhook_events` unique) → normalize status → on SUCCESS `applyGatewayPayment()` → `payment.received` + audit. Redirect page **polls** §7.2 status until verified. **Reconciliation** covers a lost webhook.

### 8.2 Refund (mirror image of the capture)

1. `POST /billing/payments/:id/refund` (`BILLING_REFUND`), amount ≤ captured, idempotency key.
2. Insert `payment_transactions` `type=REFUND`, `status=PENDING`; call `adapter.refund()`.
3. Provider confirms via **refund webhook** (or reconciliation): set the transaction `SUCCESS`, set the `payments` row `status='refunded'` (full) or record a partial refund, **recompute `invoice.amountPaidPaise` downward + status**, emit `payment.refunded`, audit.
4. Idempotent throughout — a duplicate refund webhook never double-refunds (unique `(provider, provider_event_id)` + the refund idempotency key). Clinical/financial records are corrected, never hard-deleted (invariant #6, ADR-060).

### 8.3 Shareable payment link / QR (patient not logged in)

1. Staff/system creates a `payment_links` row (opaque `token`, `expires_at`) for an invoice; a QR/URL encodes only the token.
2. Patient opens `/pay/:token` → server resolves invoice+account from the token, shows amount due, launches checkout.
3. Same webhook + reconciliation truth path as §8.1; on SUCCESS the link flips to `paid`.
4. ADR-056 throughout: opaque token, server-side resolution, same response for unknown/expired/disabled, rate-limited, audited with no actor. This is the **second and last** intended unauthenticated write path — no third without an ADR.

### 8.4 Reconciliation (the safety net)

A `payment.reconcile` job (`src/jobs/processors.ts`, `registerProcessor`) periodically takes `PENDING` transactions older than _N_ minutes, calls `adapter.getStatus()` (S2S), and applies the same normalized update **idempotently**. Guarantees no debited-but-unrecorded payment. Enqueue on a schedule (BullMQ) once wired.

---

## 9. Webhook architecture (detail)

Per provider (`/webhooks/paytm`, later `/webhooks/razorpay`, …), each handler: **(1)** parse raw body; **(2)** identify the account (by MID in the payload) and load its key; **(3)** `verifyWebhook` → **reject on bad signature** (`safeEqual`, record `signature_valid=false`, 400); **(4)** upsert `payment_webhook_events` on `(provider, provider_event_id)` — if already `processed`, **ack and stop**; **(5)** find the `payment_transactions` row; **(6)** map status; **(7)** apply via `applyGatewayPayment()` / refund handler; **(8)** mark event `processed`, ack `200`. Processing is **idempotent**; the same event arriving 3× produces one payment. Never trust a webhook that fails signature verification, and never create a duplicate payment or refund.

---

## 10. Security controls (ADR-084 + hard rules)

- Credentials stored **only** as `encryptSecret(...)`; decrypted **just-in-time** inside the adapter, never held longer than the call.
- **Never returned to any frontend, never logged, never in an error body, never in analytics.** API returns **masked metadata only**: `{ provider, merchantIdMasked: "ABC••••1234", status, environment, connectionType }`.
- UI offers **Replace Credentials**, never **View Secret** (write-only after save).
- `gateway_response_safe` / `payload_safe` are **filtered** before storage (no PAN, no full instrument, no secrets).
- `assertEncryptionReady('Payment Gateway')` at startup; in production the feature refuses requests if `ENCRYPTION_KEY` is unset (ADR-084 pattern), rather than 500-ing at the counter.
- Webhook signatures verified with `safeEqual` (constant-time). Public routes rate-limited at the sign-in tier.
- A handled failure opts out of a second toast with `feedback: false` (ADR-057) — e.g. "no account configured" is shown inline on the settings screen, not as a toast.

---

## 11. Frontend (Portal + Patient, `@hms/ui` tokens, Light+Dark, ADR-* UI rules)

- **Organization → Finance & Payments → Payment Accounts:** list connected accounts (masked), `[+ Connect Payment Provider]` as the **PageHeader top-right primary action** (ADR-128), `Test Connection`, per-account status chip. Gated `<Can perm={BILLING_PAYMENT_GATEWAY_MANAGE}>`.
- **Facility (Branch) → Finance & Payments:** radio — _Use organization default_ (shows the inherited account, masked) vs _Use a separate account_. Independent tenant with a single branch: only its own account.
- **Cashier / invoice screen:** a `Collect online` action beside the existing counter-payment action (gated `…gateway.view`), opening checkout; the invoice view shows the resolved masked account.
- **Patient portal / link page:** amount due, checkout, "Confirming payment…" → "Payment received ✓" driven by **polling the verified status**, never the redirect.
- All money via `@hms/ui` money formatting; dates via `DateDisplay`; missing values via `EmptyValue`/`ValueOrEmpty` (ADR-123); tables via the Standard DataTable; confirmations via `ConfirmDialog`.

---

## 12. Config / env (lockstep across all six apps, enforced by `npm run env:check`)

Per-tenant credentials live in **`payment_accounts` (encrypted), not env.** Env holds only non-secret, platform-level values:

- `ENCRYPTION_KEY` — already required (ADR-084); the gateway depends on it.
- `PAYTM_API_HOST_TEST=` / `PAYTM_API_HOST_PROD=` — provider API base URLs (non-secret; blank = provider default).
- `PAYMENT_WEBHOOK_BASE_URL=` — public base for building return/callback URLs (from `resources/domains.md`, never hard-coded).

Add each new key to **`hms_backend/.env.example` and `hms_backend/.env` in the same change**, same key and order; blank values ship as `KEY=` (never `# KEY=`). No real secret ever in `.env.example`.

---

## 13. Seeding (ADR-058 / ADR-122)

- **Development** (`seed.dev`, run by hand): may create a **test** `payment_account` for the demo tenant using a dev-only Paytm **staging** MID/key, `environment='test'`, `connection_type='OWN_CREDENTIALS'`. Idempotent: matched on `(tenant_id, provider, environment)`, recorded via `seed_markers`, created once, never overwritten.
- **Staging** (`seed.staging`, run automatically by the deploy workflow after migrations): a **deterministic** test account (never real credentials) so QA/E2E can exercise the flow.
- **Production:** **never** a payment account, credential, hospital, or patient. Bootstrap config only.

---

## 14. Testing (Definition of Done — automated _and_ manual)

- **Unit:** `resolvePaymentAccount` (branch → tenant → not-configured), provider status mapping, signature verify (good/bad), idempotency (duplicate webhook/refund), amount = server balance.
- **API:** create-order, webhook **double-delivery → one payment**, refund (full/partial), **tenant isolation** (tenant A cannot resolve, use, or read tenant B's account — invariant #1), `PAYMENT_ACCOUNT_NOT_CONFIGURED`, permission/capability 403s, credentials never in any response.
- **E2E:** full pay via **`MockPaymentProvider`** (no real Paytm in CI), including redirect-abandon → reconciliation.
- **Manual:** add a "Payment Gateway" section to `testcases.md` and a role-by-role walkthrough to `docs/manual-testing-guide.md` (admin connects account → cashier collects online → webhook confirms → refund → reconcile), in the **same change**.
- Run the **full** suite before manual QA; a known failure is documented in `BACKLOG.md` or it blocks handover.

---

## 15. Backward compatibility

- `recordPayment()` (cash/counter) and every existing invoice/payment path are **unchanged**; new `payments` columns are nullable.
- The capability defaults ON (deny-by-exception) only after the `BUILT` flip, but a tenant with **no configured account** simply has no online option — counter payments unaffected.
- No existing module is rewritten: OPD/pharmacy/lab keep raising invoices exactly as today and merely gain the option to call `resolvePaymentAccount` when offering online collection.

---

## 16. Build sequence (checklist)

1. **Schema + migration** (§3) — 4 tables, 3 columns, RLS, indexes. + `Errors.paymentAccountNotConfigured()`.
2. **Permissions + registry** (§4) — keys, `CAPABILITIES` const, `BUILT` flip (in the shipping change).
3. **Provider layer** (§5) — `types.ts`, `PaytmAdapter`, `MockPaymentProvider`, `PaymentGatewayError`, registry, status map.
4. **Account service + resolution** (§6.1) + admin CRUD API (§7.1) + encryption + Test Connection.
5. **PaymentGatewayService** (§6.2) + `applyGatewayPayment` (§6.3) + create-order API (§7.2).
6. **Webhook** (§9) + `payment_webhook_events` + ADR-056 public route + raw-body mount.
7. **Reconciliation job** (§8.4).
8. **Refunds** (§8.2).
9. **Payment link / QR** (§8.3).
10. **Frontend** (§11).
11. **Config/env, seeding, tests, docs, marketing status, ADR, BACKLOG** (§12–14) — alongside each piece, not at the end.

---

## 17. Compliance notes (carry from the architecture review)

- **RBI Payment Aggregator rules:** bring-your-own (`OWN_CREDENTIALS`) keeps **each tenant its own merchant of record**; the platform never pools or settles funds — the gateway does. Do not build any flow where patient money rests in a Nirogix account.
- **Sub-merchant / split settlement** (`connection_type` != `OWN_CREDENTIALS`) requires a **licensed PG partner/aggregator agreement** + per-facility KYC; schema-ready, not in this release.
- **GST / merchant of record** stays the tenant's (bring-your-own) — do not become MoR for the full amount.
- **PCI-DSS:** hosted checkout / provider SDK only; never touch or store card data (SAQ-A).

---

## 18. Open decisions for the owner

1. **Group model:** confirm _one tenant + many branches_ = a corporate group (recommended), so no cross-tenant account sharing is attempted.
2. **Monetization:** subscription only (bring-your-own is enough) **vs** per-transaction commission (needs the deferred sub-merchant/split product later).
3. **Providers beyond Paytm** to prioritise (Razorpay Route / Cashfree are the more self-serve marketplace options if commission is wanted).
4. **Patient-initiated online payment** in the logged-in portal now, or start with staff-initiated + QR link only.
