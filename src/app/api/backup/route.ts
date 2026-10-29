import { backupFilename } from "@/lib/backup";
import { buildBackup } from "@/lib/data/backup";
import { getSettings } from "@/lib/data/settings";
import { todayIn } from "@/lib/dates";
import { unauthorized, userForRoute } from "@/lib/route-auth";

// GET /api/backup → pulse-backup-YYYY-MM-DD.json with everything you own.
export async function GET() {
  const auth = await userForRoute();
  if (!auth) return unauthorized();
  try {
    const settings = await getSettings(auth.supabase, auth.userId);
    const backup = await buildBackup(auth.supabase, settings.timezone);
    await auth.supabase.from("settings").update({ last_backup_at: backup.exported_at }).eq("user_id", auth.userId);
    return new Response(JSON.stringify(backup, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${backupFilename(todayIn(settings.timezone))}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("Backup export failed", error);
    return Response.json({ error: "Couldn't create the backup. Nothing was changed; try again." }, { status: 503 });
  }
}
