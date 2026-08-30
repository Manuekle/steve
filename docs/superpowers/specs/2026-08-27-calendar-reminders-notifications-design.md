# Design: Calendar, Reminders, Notifications Modules

**Date:** 2026-08-27
**Author:** eve-agent
**Status:** Approved

## Overview

Add three modular capabilities to the Steve agent:

1. **Calendar** — Google Calendar integration for availability checking and booking
2. **Reminders** — Tool + automatic schedule for contact reminders
3. **Notifications** — Email (SMTP) + extend existing Slack/Discord

## Architecture: Modular Approach

Each module is independent, testable, and replaceable. Reuses existing infrastructure (Google auth, business-store, automation framework).

---

## Module 1: Calendar (Google Calendar API)

### Files
- `agent/tools/calendar.ts` — new
- `lib/google-auth.ts` — extract from `lib/google-sheets.ts`
- `lib/types.ts` — add `CalendarEvent`
- Credentials: `GOOGLE_CALENDAR_ID`

### Tools

#### `check_calendar_slots`
```typescript
check_calendar_slots(
  start: string,        // ISO datetime
  end: string,          // ISO datetime
  duration_min: number  // slot duration in minutes
): Promise<CalendarSlot[]>
```

**Behavior:**
1. Query Google Calendar API for events in date range
2. Calculate free slots (gaps between events)
3. Return available time slots with start/end times

#### `book_calendar_event`
```typescript
book_calendar_event(
  start: string,        // ISO datetime
  end: string,          // ISO datetime
  summary: string,      // event title
  description?: string, // event description
  contact_email?: string // attendee email
): Promise<{event_id: string, link: string}>
```

**Behavior:**
1. Create event in Google Calendar
2. Optionally add attendee
3. Return event ID and Google Calendar link

### Data Flow
```
Agent → check_calendar_slots → Google Calendar API → slots
Agent → user picks slot
Agent → book_calendar_event → Google Calendar API → confirmation
```

### Error Handling
- No `GOOGLE_CALENDAR_ID` → tool returns skip message
- API rate limit → retry with exponential backoff (max 3)
- Calendar busy → suggest next available slots
- Invalid datetime → return error message

---

## Module 2: Reminders

### Files
- `agent/tools/reminder.ts` — new
- `agent/schedules/reminders.ts` — new
- `lib/types.ts` — add `Reminder`
- `lib/business-store.ts` — add reminder CRUD

### Tool: `set_reminder`
```typescript
set_reminder(
  contact_id: string,
  datetime: string,     // ISO datetime
  message: string
): Promise<{reminder_id: string}>
```

### Tool: `list_reminders`
```typescript
list_reminders(
  contact_id?: string   // optional filter
): Promise<Reminder[]>
```

### Tool: `delete_reminder`
```typescript
delete_reminder(
  reminder_id: string
): Promise<void>
```

### Data Model
```typescript
Reminder = {
  id: string;           // UUID
  contact_id: string;   // FK to contact
  datetime: string;     // ISO datetime when to fire
  message: string;      // message to send
  status: "pending" | "sent" | "cancelled";
  created_at: string;   // ISO datetime
}
```

### Schedule: `reminders.ts`
- Runs every 1 minute (like `followups.ts`)
- Queries business-store for `status === "pending"` AND `datetime <= now`
- For each due reminder:
  1. Look up contact
  2. Send message via WhatsApp (respect 24h window) or appropriate channel
  3. Update status to `"sent"`
- Handles WhatsApp 24h window (use template if outside)

### Storage
Add to `business-store.ts`:
```typescript
reminderStore: Map<string, Reminder>
// CRUD functions:
createReminder(reminder: Omit<Reminder, 'id' | 'created_at'>): Reminder
listReminders(contact_id?: string): Reminder[]
updateReminder(id: string, updates: Partial<Reminder>): void
deleteReminder(id: string): void
```

### Error Handling
- Contact not found → skip with log
- Invalid datetime → return error on creation
- WhatsApp outside 24h → use HSM template
- Schedule failure → log and continue (don't block other reminders)

---

## Module 3: Notifications (Email + Slack)

### Files
- `lib/email.ts` — new SMTP utility
- `lib/types.ts` — add `notify_email` to `WorkflowStepType`
- `lib/automation-runner.ts` — handle `notify_email` step
- Credentials: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`

### Email Utility (`lib/email.ts`)
```typescript
sendEmail(options: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<{success: boolean, error?: string}>
```

**Implementation:**
- Use `nodemailer` library (well-tested SMTP client)
- Support TLS/STARTTLS based on port
- Connection timeout: 10s
- Add `nodemailer` to dependencies

### Workflow Step: `notify_email`
```typescript
{
  type: "notify_email";
  config: {
    to: string;        // recipient email (supports {{contact.email}})
    subject: string;   // email subject
    message: string;   // email body (text or HTML)
  }
}
```

### Slack (Already Exists)
- `notify_team` with webhook URL works
- UI already exists in automation builder
- No changes needed

### Error Handling
- No SMTP credentials → step returns "skipped" with message
- SMTP connection error → retry once, then fail
- Invalid email format → error message
- Attachment limit → skip (future enhancement)

---

## Files Modified (Summary)

### New Files
| File | Purpose |
|------|---------|
| `agent/tools/calendar.ts` | Calendar tools |
| `lib/google-auth.ts` | Shared Google auth |
| `agent/tools/reminder.ts` | Reminder tools |
| `agent/schedules/reminders.ts` | Reminder schedule |
| `lib/email.ts` | SMTP email utility |

### Modified Files
| File | Changes |
|------|---------|
| `lib/types.ts` | Add `CalendarEvent`, `Reminder`, `notify_email` step |
| `lib/business-store.ts` | Add reminder CRUD |
| `lib/automation-runner.ts` | Handle `notify_email` step |
| `lib/google-sheets.ts` | Extract auth to `lib/google-auth.ts` |
| `lib/i18n/dictionaries.ts` | Add labels for new tools/steps |

---

## Credentials Required

| Credential | Module | Purpose |
|------------|--------|---------|
| `GOOGLE_CALENDAR_ID` | Calendar | Which calendar to use |
| `SMTP_HOST` | Notifications | SMTP server |
| `SMTP_PORT` | Notifications | SMTP port (587/465) |
| `SMTP_USER` | Notifications | SMTP username |
| `SMTP_PASS` | Notifications | SMTP password |
| `SMTP_FROM` | Notifications | From email address |

---

## Testing Strategy

### Unit Tests
- `lib/email.test.ts` — SMTP sending
- `lib/google-auth.test.ts` — auth extraction
- `agent/tools/calendar.test.ts` — slot calculation logic
- `agent/tools/reminder.test.ts` — CRUD operations
- `agent/schedules/reminders.test.ts` — schedule firing

### Integration Tests
- Calendar tool → Google Calendar API (mock or real)
- Reminder schedule → sends WhatsApp message
- Notification step → sends email

### Evals
- Add evals for calendar booking flow
- Add evals for reminder creation flow

---

## Migration Notes

1. Extract Google auth from `google-sheets.ts` to `lib/google-auth.ts`
2. Update `google-sheets.ts` to import from new location
3. Add reminder storage to business-store
4. Add new workflow step type to automation framework
5. Update UI to show new tools in automation builder

---

## Success Criteria

- [ ] Agent can check Google Calendar availability
- [ ] Agent can book calendar events
- [ ] Agent can set reminders for contacts
- [ ] Automatic reminders fire at scheduled time
- [ ] Email notifications sent via SMTP
- [ ] All tests pass
- [ ] No breaking changes to existing automations

---

## Future Enhancements

- Calendar: recurring events, multiple calendars
- Reminders: recurring reminders, snooze
- Notifications: SMS (Twilio), push notifications, in-app notification center
