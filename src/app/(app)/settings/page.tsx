import type { Metadata } from "next";
import { Card, Label, PageHeader, BackLink } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/data/settings";
import { moneyFormat } from "@/lib/money";
import { logout } from "../../login/actions";
import { BackupPanel } from "./backup-panel";
import { FeaturesCard } from "./features-card";
import { NotificationsCard } from "./notifications-card";
import { ThemeSwitch } from "./theme-switch";

export const metadata: Metadata = { title: "Settings · Pulse" };

export default async function SettingsPage() {
  const { supabase, user } = await requireUser();
  const settings = await getSettings(supabase, user.id);
  const fmt = moneyFormat(settings.homeCurrency);
  const devices = await supabase.from("push_subscriptions").select("id, device, endpoint, created_at").order("created_at");

  return (
    <>
      <BackLink href="/" label="Today" />
      <PageHeader title="Settings" />

      <Card>
        <Label>Features</Label>
        <div className="mt-2">
          <p className="mb-2 text-sm">
            {settings.region === "hk" ? "🇭🇰 Hong Kong, China · HK$" : "🇨🇳 Mainland China · ¥ RMB"}
            <span className="block text-xs text-muted">Set when you joined; every amount is saved in this currency.</span>
          </p>
          <FeaturesCard
            family={settings.features.family}
            rent={settings.features.rent}
          />
        </div>
      </Card>

      <Card>
        <Label>Notifications</Label>
        <div className="mt-3">
          <NotificationsCard
            prefs={settings.notify}
            devices={(devices.data ?? []).map((d) => ({
              id: d.id,
              name: d.device ?? "Browser",
              added: new Date(d.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: settings.timezone }),
              tail: String(d.endpoint).slice(-16), // enough to recognise this device, without sending the full address to the page
            }))}
          />
        </div>
      </Card>


      <Card>
        <Label>Appearance</Label>
        <div className="mt-3">
          <ThemeSwitch />
        </div>
        <p className="mt-2 text-xs text-muted">Auto follows your phone or computer. Saved on this device.</p>
      </Card>

      <Card>
        <Label>Budget</Label>
        <dl className="mt-3 grid grid-cols-2 gap-y-2 text-sm">
          <dt className="text-muted">Monthly budget</dt>
          <dd className="tabular text-right font-medium">{fmt(settings.defaultBudgetFen)}</dd>
          <dt className="text-muted">Tracking since</dt>
          <dd className="text-right font-medium">{settings.trackingStartDate}</dd>
          <dt className="text-muted">Timezone</dt>
          <dd className="text-right font-medium">{settings.timezone}</dd>
        </dl>
        <p className="mt-3 text-xs text-muted">Editing these comes in a later step.</p>
      </Card>

      <Card>
        <div id="backup" className="scroll-mt-6">
          <Label>Backup &amp; restore</Label>
        </div>
        <div className="mt-3">
          <BackupPanel lastBackupAt={settings.lastBackupAt} daysSince={settings.backupAgeDays} timezone={settings.timezone} />
        </div>
      </Card>

      <Card>
        <Label>Account</Label>
        <p className="mt-2 text-sm">{user.email}</p>
        <form action={logout} className="mt-3">
          <button className="h-11 w-full rounded-xl border border-line text-sm font-semibold">Sign out</button>
        </form>
      </Card>
    </>
  );
}
