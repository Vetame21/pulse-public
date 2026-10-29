import type { Metadata } from "next";
import { EventForm } from "@/components/event-form";
import { BackLink, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/data/settings";
import { isValidISODate, todayIn } from "@/lib/dates";

export const metadata: Metadata = { title: "New event · Pulse" };

export default async function NewEventPage({ searchParams }: PageProps<"/calendar/new">) {
  const sp = await searchParams;
  const d = sp.date;
  const kind: "event" | "deadline" = sp.kind === "deadline" ? "deadline" : "event";
  // Prefilled from a notice's "Add as deadline" chip.
  const title = typeof sp.title === "string" ? sp.title.slice(0, 200) : undefined;
  const time = typeof sp.time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(sp.time) ? sp.time : undefined;
  const noticeId = typeof sp.notice === "string" && /^[0-9a-f-]{36}$/i.test(sp.notice) ? sp.notice : undefined;
  const { supabase, user } = await requireUser();
  const date = typeof d === "string" && isValidISODate(d) ? d : todayIn((await getSettings(supabase, user.id)).timezone);
  return (
    <>
      <BackLink href={`/calendar?month=${date.slice(0, 7)}&day=${date}`} label="Calendar" />
      <PageHeader title={kind === "deadline" ? "New deadline" : "New event"} />
      <EventForm mode="create" date={date} kind={kind} title={title} time={time} noticeId={noticeId} />
    </>
  );
}
