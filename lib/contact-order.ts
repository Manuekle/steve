import type { Contact, ContactStatus } from "./types";

/**
 * Move a contact to a stage, optionally into a precise slot inside it.
 *
 * The board has no `position` column: a contact's place in its column is its
 * place in the contacts array, filtered by status. So a drop that lands
 * between two cards is expressed here as an insert into the flat list at the
 * array index those two cards straddle — which keeps one ordering for the
 * store, the API and the optimistic update in the page, instead of three that
 * can disagree about where a card went.
 *
 * `index` is counted within the destination column, ignoring every contact in
 * the other three. Leave it out to change status without touching order.
 */
export function moveContactTo(
  contacts: readonly Contact[],
  id: string,
  status: ContactStatus,
  index?: number,
): Contact[] {
  const moving = contacts.find((c) => c.id === id);
  if (!moving) return [...contacts];
  if (index === undefined) {
    return contacts.map((c) => (c.id === id ? { ...c, status } : c));
  }

  const next: Contact = { ...moving, status };
  const rest = contacts.filter((c) => c.id !== id);
  /** Where each card of the destination column sits in the flat list. */
  const slots: number[] = [];
  rest.forEach((c, i) => {
    if (c.status === status) slots.push(i);
  });

  const clamped = Math.max(0, Math.min(index, slots.length));
  const insertAt =
    clamped < slots.length
      ? slots[clamped]!
      : slots.length > 0
        ? slots[slots.length - 1]! + 1
        : rest.length;

  const out = [...rest];
  out.splice(insertAt, 0, next);
  return out;
}
