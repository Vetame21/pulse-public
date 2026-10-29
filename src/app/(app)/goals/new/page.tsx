import type { Metadata } from "next";
import { BackLink, PageHeader } from "@/components/ui";
import { GoalForm } from "../goal-parts";

export const metadata: Metadata = { title: "New goal · Pulse" };

export default function NewGoalPage() {
  return (
    <>
      <BackLink href="/goals" label="Goals" />
      <PageHeader title="New goal" />
      <GoalForm />
    </>
  );
}
