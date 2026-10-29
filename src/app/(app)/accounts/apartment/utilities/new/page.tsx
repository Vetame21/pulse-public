import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import { BackLink, Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { listUtilityBills } from "@/lib/data/apartment";
import { getSettings } from "@/lib/data/settings";
import { todayIn } from "@/lib/dates";
import { nextBillPeriod } from "@/lib/utilities";
import { UtilityBillForm } from "../../apartment-controls";

export const metadata: Metadata = { title: "Add utility bill · Pulse" };

export default async function NewUtilityBillPage() {
  const { supabase, user } = await requireUser();
  const [settings, bills] = await Promise.all([getSettings(supabase, user.id), listUtilityBills(supabase)]);
  // Suggest the period right after the latest bill (Jun–Aug → Sep–Nov).
  const next = bills.length ? nextBillPeriod(bills[bills.length - 1]) : { start: "", end: "" };

  return (
    <>
      <BackLink href="/accounts/apartment" label="Apartment" />
      <PageHeader title="Add electricity + water bill" eyebrow="Utilities" />
      <Card>
        <UtilityBillForm
          mode="create"
          today={todayIn(settings.timezone)}
          initial={{ id: randomUUID(), periodStart: next.start, periodEnd: next.end, paidDate: "", electricity: "", water: "", total: "", note: "" }}
        />
      </Card>
    </>
  );
}
