"use client";

import Link from "next/link";
import { Building2, LifeBuoy, ScrollText, ShieldCheck } from "lucide-react";
import { Button, Card } from "@hms/ui";
import { PERMISSIONS } from "@hms/permissions";
import { RequirePermission } from "../../../components/Can";
import { PageHeader } from "../../../components/PageHeader";

/**
 * The support entry point (ADR-037, ADR-051).
 *
 * A support session is started from the *hospital* an operator needs to help — the
 * form lives on the tenant's own page, because it targets one of that tenant's users.
 * This screen is the navigable home for that workflow: it explains the audited,
 * password-free model and sends the operator to the hospital list, rather than
 * duplicating the tenant table or the session form.
 */
function Support() {
  return (
    <>
      <PageHeader
        title="Support sessions"
        description="Enter a hospital as one of its users to reproduce a problem — every session is audited in that tenant."
      />
      <Card
        header={
          <span className="flex items-center gap-2">
            <LifeBuoy size={16} strokeWidth={1.75} aria-hidden /> How support access works
          </span>
        }
      >
        <p className="text-sm text-fg-muted">
          A support session is started from the hospital you need to help. Open the hospital, then use{" "}
          <strong className="font-medium text-fg">Support access</strong> to enter as one of its active users. You never
          see or need their password, the session grants exactly that user&apos;s permissions, and both its start and its
          end are written to the tenant&apos;s audit trail with your name and the reason you give.
        </p>

        <ul className="mt-4 flex flex-col gap-2 text-sm text-fg-muted">
          <li className="flex items-center gap-2">
            <Building2 size={15} strokeWidth={1.75} className="shrink-0 text-brand" aria-hidden /> Pick the hospital from
            the list.
          </li>
          <li className="flex items-center gap-2">
            <ShieldCheck size={15} strokeWidth={1.75} className="shrink-0 text-brand" aria-hidden /> Enter as a specific
            user, with a reason.
          </li>
          <li className="flex items-center gap-2">
            <ScrollText size={15} strokeWidth={1.75} className="shrink-0 text-brand" aria-hidden /> The session opens the
            Portal in a new tab, audited throughout.
          </li>
        </ul>

        <div className="mt-5">
          <Link href="/tenants">
            <Button>
              <Building2 size={16} strokeWidth={2} /> Choose a hospital
            </Button>
          </Link>
        </div>
      </Card>
    </>
  );
}

export default function SupportPage() {
  return (
    <RequirePermission perm={PERMISSIONS.PLATFORM_SUPPORT_IMPERSONATE}>
      <Support />
    </RequirePermission>
  );
}
