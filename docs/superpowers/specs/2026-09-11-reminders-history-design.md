# Design: Reminders History and Activity

**Date:** 2026-09-11
**Status:** Approved for implementation

## Goal

Make `/reminders` useful as both an operational queue and an audit view. Users
must see processed reminders and the activity that explains how each reminder
got there. Deleting a reminder must not erase its history.

## Data Model

Add `ReminderActivity` to the business store:

```ts
type ReminderActivityType = "created" | "sent" | "failed" | "cancelled" | "deleted";

type ReminderActivity = {
  id: string;
  reminder_id: string;
  type: ReminderActivityType;
  message: string;
  reminder_message: string;
  datetime: string;
  created_at: string;
};
```

Add `reminderActivity: ReminderActivity[]` to the store. Normalize missing data
to an empty array so existing file and database stores remain readable.

## Event Rules

- `createReminder` writes the reminder and a `created` activity atomically.
- Scheduler writes `sent` or `failed` after delivery attempt.
- Delete writes `deleted` activity, then removes the active reminder.
- Existing activity remains immutable.
- No edit or reschedule event is added because no such UI action exists.

## API

`GET /api/reminders` returns:

```ts
{
  reminders: Reminder[];
  activity: ReminderActivity[];
}
```

`DELETE /api/reminders?id=...` keeps current behavior for active reminders,
while recording the `deleted` event before removal.

## UI

The page renders three independent sections:

1. `Pendientes`: pending reminders, soonest first, with delete action.
2. `Historial`: sent, failed, and cancelled reminders, newest first.
3. `Actividad reciente`: immutable event feed, newest first, including deleted
   reminders.

Search filters all three sections by reminder message. Empty sections render no
heading. Existing KPI cards remain focused on active reminder status counts.

Delete action uses the shared `Button` component with `variant="ghost"` and
`size="icon-sm"`, matching agent actions for consistent hover, focus, and
pressed states.

## Validation

- Existing reminder behavior remains intact.
- Activity survives application reload and store normalization.
- Scheduler creates accurate sent/failed events.
- Deleted reminders remain visible in activity.
- Typecheck, lint, and relevant tests pass.
