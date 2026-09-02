"use client";

import { useEffect } from "react";

// "A credential just changed" — broadcast in the browser, listened to by
// anything whose answer depends on one.
//
// Saving a key in Settings or in the Connections dialog changes what the
// model picker can list, what the health dot reads, and what the provider
// badge says. None of those live in the form that did the saving, and asking
// the operator to reload the page to see their own key take effect is the
// bug this exists to close. A DOM event is enough: every reader is a client
// component in the same document, and a reader that is not mounted has
// nothing to refresh anyway.

const EVENT = "steve:credentials-changed";

/** Announce that the credential store changed. Safe to call on the server —
 *  it simply does nothing there. */
export function notifyCredentialsChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENT));
}

/** Run `onChange` whenever a credential is saved anywhere in the app. */
export function useCredentialsChanged(onChange: () => void): void {
  useEffect(() => {
    const handler = () => onChange();
    window.addEventListener(EVENT, handler);
    return () => window.removeEventListener(EVENT, handler);
  }, [onChange]);
}
