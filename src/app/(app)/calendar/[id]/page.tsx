import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EventForm } from "@/components/event-form";
import { BackLink, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getEvent } from "@/lib/data/calendar";

export const metadata: Metadata = { title: "Edit event · Pulse" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditEventPage({ params }: PageProps<"/calendar/[id]">) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const { supabase } = await requireUser();
  const e = await getEvent(supabase, id);
  if (!e) notFound();
  return (
    <>
      <BackLink href={`/calendar?month=${e.date.slice(0, 7)}&day=${e.date}`} label="Calendar" />
      <PageHeader title={e.kind === "deadline" ? "Edit deadline" : "Edit event"} />
      <EventForm
        mode="edit"
        id={e.id}
        values={{
          title: e.title,
          date: e.date,
          endDate: e.endDate ?? "",
          allDay: e.startTime === null,
          startTime: e.startTime ?? "",
          endTime: e.endTime ?? "",
          location: e.location ?? "",
          notes: e.notes ?? "",
          kind: e.kind,
          leadDays: String(e.leadDays ?? 7),
          done: e.done,
        }}
      />
    </>
  );
}
