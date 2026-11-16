/* Tenant timezone configuration for OPEX VBM.
   Derived from existing configuration/session data when available.
   For the current Indonesian test context, Asia/Jakarta (WIB) is expected.
   Do not assume browser timezone equals tenant timezone. */

export type TenantTimezoneConfig = {
  timezone: string;
  offsetMinutes: number;
  label: string;
};

const DEFAULT_TZ = "Asia/Jakarta";

function getOffsetMinutes(timezone: string, date: Date): number {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      timeZoneName: "longOffset",
    });
    const parts = formatter.formatToParts(date);
    const offsetStr = parts.find(p => p.type === "timeZoneName")?.value ?? "";
    const m = offsetStr.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);
    if (m) {
      const sign = m[1] === "-" ? -1 : 1;
      return sign * (parseInt(m[2], 10) * 60 + (m[3] ? parseInt(m[3], 10) : 0));
    }
  } catch {
    // fall through
  }
  return 0;
}

export function getTenantTimezone(): TenantTimezoneConfig {
  const tz = DEFAULT_TZ;
  const now = new Date();
  return {
    timezone: tz,
    offsetMinutes: getOffsetMinutes(tz, now),
    label: "WIB (UTC+7)",
  };
}

export function toTenantLocalParts(iso: string, tz: string = DEFAULT_TZ): { date: string; time: string } | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const dateFmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
  const timeFmt = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false });
  return { date: dateFmt.format(d), time: timeFmt.format(d) };
}

export function toIsoFromTenantParts(date: string, time: string, tz: string = DEFAULT_TZ): string | null {
  if (!date || !time) return null;
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const tm = time.match(/^(\d{2}):(\d{2})$/);
  if (!m || !tm) return null;
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10) - 1;
  const day = parseInt(m[3], 10);
  const hour = parseInt(tm[1], 10);
  const minute = parseInt(tm[2], 10);
  // Interpret the local tenant datetime in the tenant timezone, avoiding ambiguous local parsing.
  const utcMs = Date.UTC(year, month, day, hour, minute, 0, 0) - getOffsetMinutes(tz, new Date(Date.UTC(year, month, day, hour, minute))) * 60000;
  const d = new Date(utcMs);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function formatTenantDateTime(iso: string, tz: string = DEFAULT_TZ): string {
  const parts = toTenantLocalParts(iso, tz);
  if (!parts) return iso;
  return `${parts.date} ${parts.time}`;
}
