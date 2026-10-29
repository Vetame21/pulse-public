import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BirthdayForm, DeleteButton } from "@/components/timetable-forms";
import { BackLink, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getBirthday } from "@/lib/data/calendar";
import { deleteBirthday } from "../../actions";

export const metadata: Metadata = { title: "Edit birthday · Pulse" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditBirthdayPage({ params }: PageProps<"/calendar/birthdays/[id]">) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const { supabase } = await requireUser();
  const b = await getBirthday(supabase, id);
  if (!b) notFound();
  return (
    <>
      <BackLink href="/calendar/birthdays" label="Birthdays" />
      <PageHeader title="Edit birthday" />
      <BirthdayForm initial={b} />
      <DeleteButton action={deleteBirthday} id={b.id} label="Delete birthday" />
    </>
  );
}
