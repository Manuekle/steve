// The cadence each schedule runs at, overridable per deployment.
//
// These were literals in the five files under agent/schedules/, which is fine
// until the platform has an opinion about them. Vercel's Hobby plan allows
// only once-a-day cron jobs and rejects the whole deployment — not the cron,
// the deployment — when it sees one that runs more often:
//
//   Hobby accounts are limited to daily cron jobs. This cron expression
//   (* * * * *) would run more than once per day.
//
// So the cadence has to be a property of the deployment rather than of the
// code. `STEVE_CRON_<NAME>` sets one schedule, `STEVE_CRON_DEFAULT` sets all
// of them, and with neither the file's own value stands — which is what every
// existing install keeps doing.
//
// Read at build time, not at run time: eve turns these into entries in
// `.vercel/output/config.json` while building, so the variable has to be set
// on the build, and changing it takes a redeploy.
//
// Worth being plain about the trade: a daily reminder schedule does not
// deliver reminders on time, it delivers yesterday's at 03:00. Daily is how
// you deploy the rest of the app on a plan that forbids the real cadence, not
// a configuration anyone should want.

/** A standard 5-field expression. Anything else is a typo, not a schedule. */
const CRON_FIELDS = 5;

function isCronExpression(value: string): boolean {
  return value.trim().split(/\s+/).length === CRON_FIELDS;
}

/**
 * The cron for one schedule.
 *
 * @param name     Matches the file: "reminders" reads `STEVE_CRON_REMINDERS`.
 * @param fallback What the schedule runs at when nothing overrides it.
 */
export function scheduleCron(name: string, fallback: string): string {
  const key = `STEVE_CRON_${name.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
  const configured = process.env[key]?.trim() || process.env.STEVE_CRON_DEFAULT?.trim();
  if (!configured) return fallback;

  if (!isCronExpression(configured)) {
    // A bad value must not take the build down with it: the deployment would
    // fail on a schedule nobody was thinking about, with a cron parser's
    // error rather than this one's.
    console.warn(
      `[schedule] ignoring ${key}="${configured}": expected ${CRON_FIELDS} fields, using "${fallback}"`,
    );
    return fallback;
  }
  return configured;
}
