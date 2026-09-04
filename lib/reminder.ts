import { listReminders, createReminder, deleteReminder as deleteReminderFromStore } from "./business-store";
import type { Reminder } from "./types";

// Reminder utility functions.

export type SetReminderResult = {
  readonly reminder_id: string;
  readonly message: string;
};

/**
 * Set a reminder for a contact at a specific datetime.
 */
export async function setReminder(opts: {
  readonly contact_id: string;
  readonly datetime: string;
  readonly message: string;
}): Promise<SetReminderResult> {
  // Validate datetime is in the future
  const reminderTime = new Date(opts.datetime).getTime();
  if (!Number.isFinite(reminderTime)) {
    throw new Error("Invalid datetime format. Use ISO format (e.g., 2026-08-27T10:00:00Z).");
  }
  if (reminderTime <= Date.now()) {
    throw new Error("Reminder datetime must be in the future.");
  }

  const reminder = await createReminder({
    contact_id: opts.contact_id,
    datetime: opts.datetime,
    message: opts.message,
    status: "pending",
  });

  return {
    reminder_id: reminder.id,
    message: `Reminder set for ${opts.datetime}.`,
  };
}

export type ListRemindersResult = {
  readonly reminders: ReadonlyArray<Reminder>;
  readonly count: number;
};

/**
 * List reminders, optionally filtered by contact_id.
 */
export async function listRemindersForContact(opts: {
  readonly contact_id?: string;
}): Promise<ListRemindersResult> {
  const reminders = await listReminders(opts.contact_id);
  return {
    reminders,
    count: reminders.length,
  };
}

export type DeleteReminderResult = {
  readonly message: string;
};

/**
 * Delete a reminder by ID.
 */
export async function deleteReminderById(opts: {
  readonly reminder_id: string;
}): Promise<DeleteReminderResult> {
  const deleted = await deleteReminderFromStore(opts.reminder_id);
  if (!deleted) {
    throw new Error(`Reminder ${opts.reminder_id} not found.`);
  }
  return {
    message: `Reminder ${opts.reminder_id} deleted.`,
  };
}
