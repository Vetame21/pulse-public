import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BackLink, Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getUtilityBill } from "@/lib/data/apartment";
import { getSettings } from "@/lib/data/settings";
import { todayIn } from "@/lib/dates";
import { UtilityBillForm } from "../../apartment-controls";

export const metadata: Metadata = { title: "Edit utility bill · Pulse" };

const toYuan = (fen: number | null) => (fen === null ? "" : (fen / 100).toFixed(2).replace(/\.00$/, ""));

export default async function EditUtilityBillPage({ params }: PageProps<"/accounts/apartment/utilities/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, user } = await requireUser();
  const [settings, bill] = await Promise.all([getSettings(supabase, user.id), getUtilityBill(supabase, id)]);
  if (!bill) notFound();
  const split = bill.electricityFen !== null || bill.waterFen !== null;

  return (
    <>
      <BackLink href="/accounts/apartment" label="Apartment" />
      <PageHeader title="Edit utility bill" eyebrow="Utilities" />
      <Card>
        <UtilityBillForm
          mode="edit"
          today={todayIn(settings.timezone)}
          initial={{
            id: bill.id,
            periodStart: bill.periodStart,
            periodEnd: bill.periodEnd,
            paidDate: bill.paidDate ?? "",
            electricity: split ? toYuan(bill.electricityFen) : "",
            water: split ? toYuan(bill.waterFen) : "",
            total: split ? "" : toYuan(bill.totalFen),
            note: bill.note ?? "",
          }}
        />
      </Card>
    </>
  );
}
