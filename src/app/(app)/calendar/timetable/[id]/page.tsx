import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ClassForm, DeleteButton } from "@/components/timetable-forms";
import { BackLink, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getClass } from "@/lib/data/calendar";
import { deleteClass } from "../../actions";

export const metadata: Metadata = { title: "Edit class · Pulse" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditClassPage({ params }: PageProps<"/calendar/timetable/[id]">) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const { supabase } = await requireUser();
  const c = await getClass(supabase, id);
  if (!c) notFound();
  return (
    <>
      <BackLink href="/calendar/timetable" label="Timetable" />
      <PageHeader title="Edit class" />
      <ClassForm semesterId={c.semesterId} initial={c} />
      <DeleteButton action={deleteClass} id={c.id} label="Delete class" />
    </>
  );
}
