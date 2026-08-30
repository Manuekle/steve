import { describe, expect, it } from "vitest";
import { CREDENTIAL_GROUPS } from "./credentials";
import { MANUAL_CONNECTIONS, OAUTH_CONNECTIONS } from "./connections";
import { FIELD_I18N, VALIDATION_ERROR_KEYS } from "./settings-i18n";
import { dictionaries } from "./i18n/dictionaries";

// The Settings and Connections pages are both generated from catalogs, so a
// vendor added to a catalog renders whether or not anyone wrote its copy —
// it just renders a hardcoded Spanish label that ignores the language toggle,
// or a blank hint. These tests are the thing that notices.

const es = dictionaries.es;
const en = dictionaries.en;

/** Group ids that intentionally have no card on Connections: they are wired
 *  through a channel or the runtime, not through a vendor account someone
 *  connects. */
const GROUPS_WITHOUT_CARD = new Set([
  "database",
  "google-calendar",
  "google-sheets",
  "integrations",
  "instagram",
  "messenger",
  "oauth-apps",
  "whatsapp",
]);

describe("credential field copy", () => {
  it("gives every field a translated label in both languages", () => {
    const missing: string[] = [];
    for (const group of CREDENTIAL_GROUPS) {
      for (const field of group.fields) {
        const entry = FIELD_I18N[field.key];
        if (!entry?.label) {
          missing.push(`${group.id}.${field.key}: no FIELD_I18N label`);
          continue;
        }
        if (!es[entry.label]) missing.push(`${field.key}: es is missing ${entry.label}`);
        if (!en[entry.label]) missing.push(`${field.key}: en is missing ${entry.label}`);
        if (entry.help) {
          if (!es[entry.help]) missing.push(`${field.key}: es is missing ${entry.help}`);
          if (!en[entry.help]) missing.push(`${field.key}: en is missing ${entry.help}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});

describe("credential field inputs", () => {
  it("gives every text input a placeholder", () => {
    // A select shows its first option, so it never looks blank. A text or
    // password box with nothing in it and no placeholder gives no clue what
    // shape the value has.
    const bare = CREDENTIAL_GROUPS.flatMap((group) =>
      group.fields
        .filter((field) => field.type !== "select" && !field.placeholder)
        .map((field) => `${group.id}.${field.key}`),
    );
    expect(bare).toEqual([]);
  });

  it("keeps every validation message translated in both languages", () => {
    const missing: string[] = [];
    for (const [key, messageKey] of Object.entries(VALIDATION_ERROR_KEYS)) {
      if (!es[messageKey]) missing.push(`${key}: es is missing ${messageKey}`);
      if (!en[messageKey]) missing.push(`${key}: en is missing ${messageKey}`);
    }
    expect(missing).toEqual([]);
  });

  it("only points a validation message at a field that exists", () => {
    const known = new Set(CREDENTIAL_GROUPS.flatMap((g) => g.fields.map((f) => f.key)));
    const orphans = Object.keys(VALIDATION_ERROR_KEYS).filter((key) => !known.has(key as never));
    expect(orphans).toEqual([]);
  });
});

describe("connection card copy", () => {
  it("translates every OAuth card's description and unlock badges", () => {
    const missing: string[] = [];
    for (const connection of OAUTH_CONNECTIONS) {
      for (const key of [connection.descriptionKey, ...connection.unlockKeys]) {
        if (!es[key]) missing.push(`${connection.id}: es is missing ${key}`);
        if (!en[key]) missing.push(`${connection.id}: en is missing ${key}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("translates every API-key card's description and reason", () => {
    const missing: string[] = [];
    for (const connection of MANUAL_CONNECTIONS) {
      for (const key of [connection.descriptionKey, connection.reasonKey]) {
        if (!es[key]) missing.push(`${connection.id}: es is missing ${key}`);
        if (!en[key]) missing.push(`${connection.id}: en is missing ${key}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("points every card at a settings group that exists", () => {
    const groupIds = new Set(CREDENTIAL_GROUPS.map((group) => group.id));
    const dangling = MANUAL_CONNECTIONS.filter((c) => !groupIds.has(c.settingsGroup));
    expect(dangling.map((c) => `${c.id} -> ${c.settingsGroup}`)).toEqual([]);
  });

  it("keeps a card's credential keys inside the group it opens", () => {
    const fieldsByGroup = new Map(
      CREDENTIAL_GROUPS.map((group) => [group.id, new Set(group.fields.map((f) => f.key))]),
    );
    const stray: string[] = [];
    for (const connection of MANUAL_CONNECTIONS) {
      const fields = fieldsByGroup.get(connection.settingsGroup);
      for (const key of connection.credentialKeys) {
        if (fields && !fields.has(key)) stray.push(`${connection.id}: ${key} not in ${connection.settingsGroup}`);
      }
    }
    expect(stray).toEqual([]);
  });

  it("gives every credential group either a card or a documented exemption", () => {
    const carded = new Set(MANUAL_CONNECTIONS.map((c) => c.settingsGroup));
    const orphans = CREDENTIAL_GROUPS.map((g) => g.id).filter(
      (id) => !carded.has(id) && !GROUPS_WITHOUT_CARD.has(id),
    );
    expect(orphans).toEqual([]);
  });
});

describe("dictionaries", () => {
  it("defines the same keys in both languages", () => {
    const onlyEs = Object.keys(es).filter((key) => !(key in en));
    const onlyEn = Object.keys(en).filter((key) => !(key in es));
    expect({ onlyEs, onlyEn }).toEqual({ onlyEs: [], onlyEn: [] });
  });
});
