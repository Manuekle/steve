// The catalog of accounts Steve can connect to, and how each connection is made.
//
// The distinction this file exists to draw: an OAuth connection is made by
// signing into an account you already have — nobody copies a secret out of a
// vendor dashboard — while an API-key connection still needs a value pasted
// into Settings. A vendor lands in the first list only when its public API
// really does issue per-account tokens over OAuth 2. The rest are listed
// honestly under "needs a key" rather than given a Connect button that would
// only open a form.
//
// Client ids and secrets are the *app's* identity, not the operator's: on a
// hosted install they arrive as environment variables and nobody ever sees
// them. A self-hoster registers their own app and fills the same keys in
// Settings — that is the one case where these values are typed by hand, and
// it is a one-time cost paid by whoever runs the server, not by the person
// clicking Connect.

import type { CredentialKey } from "./credentials";

export type ConnectionId =
  | "google"
  | "hubspot"
  | "calendly"
  | "slack"
  | "notion"
  | "airtable";

/** Vendors that appear on the page but are wired through Settings instead. */
export type ManualConnectionId =
  | "stripe"
  | "mercadopago"
  | "shopify"
  | "meta"
  | "elevenlabs"
  | "twilio"
  | "smtp"
  | "resend"
  | "anthropic"
  | "openai"
  | "ai-gateway";

export type TokenAuthStyle = "body" | "basic";
export type TokenBodyStyle = "form" | "json";

export type OAuthConfig = {
  readonly authorizeUrl: string;
  readonly tokenUrl: string;
  readonly scopes: readonly string[];
  /** Space everywhere except Slack, which wants commas. */
  readonly scopeSeparator: string;
  /** Extra query params on the authorize URL (Google's offline access, etc). */
  readonly authParams?: Readonly<Record<string, string>>;
  /** Airtable requires PKCE; the others accept it, so it is always on. */
  readonly pkce: boolean;
  /** Where the client credentials ride on the token request. */
  readonly tokenAuth: TokenAuthStyle;
  readonly tokenBody: TokenBodyStyle;
  /** Whether the provider issues refresh tokens at all. Slack and Notion
   *  hand out long-lived tokens instead, so there is nothing to refresh. */
  readonly refreshable: boolean;
  readonly clientIdKey: CredentialKey;
  readonly clientSecretKey: CredentialKey;
  /** A GET that names the connected account. `{token}` is substituted with
   *  the access token — HubSpot puts it in the path rather than a header. */
  readonly identityUrl?: string;
  /** Dot path into the identity response, e.g. "resource.email". */
  readonly identityPath?: string;
  /** Dot path into the *token* response, for providers that name the account
   *  there (Slack's team, Notion's workspace). */
  readonly accountPath?: string;
};

export type OAuthConnection = {
  readonly id: ConnectionId;
  readonly kind: "oauth";
  /** Vendor name. Never translated. */
  readonly label: string;
  /** Dictionary key for the one-line description. */
  readonly descriptionKey: string;
  /** Dictionary keys for what connecting unlocks, listed on the card. */
  readonly unlockKeys: readonly string[];
  /** Where a self-hoster registers the OAuth app. */
  readonly appDocsUrl: string;
  readonly oauth: OAuthConfig;
};

export type ManualConnection = {
  readonly id: ManualConnectionId;
  readonly kind: "api_key";
  readonly label: string;
  readonly descriptionKey: string;
  /** Why this one still needs a key — the vendor offers no user OAuth. */
  readonly reasonKey: string;
  /** Settings group to scroll to. */
  readonly settingsGroup: string;
  readonly credentialKeys: readonly CredentialKey[];
  /** Which of `credentialKeys` is worth a masked preview ("sk-ant-…wXyz") on
   *  the card — the secret one, not an account id or a hostname. Defaults to
   *  `credentialKeys[0]`. */
  readonly previewKey?: CredentialKey;
};

export const OAUTH_CONNECTIONS: readonly OAuthConnection[] = [
  {
    id: "google",
    kind: "oauth",
    label: "Google",
    descriptionKey: "connections.google.description",
    unlockKeys: [
      "connections.google.unlockSheets",
      "connections.google.unlockCalendar",
      "connections.google.unlockDrive",
      "connections.google.unlockGmail",
    ],
    appDocsUrl: "https://console.cloud.google.com/apis/credentials",
    oauth: {
      authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      scopes: [
        "openid",
        "email",
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/calendar",
        "https://www.googleapis.com/auth/drive.file",
        "https://www.googleapis.com/auth/gmail.send",
      ],
      scopeSeparator: " ",
      // Without `access_type=offline` Google returns no refresh token, and
      // without `prompt=consent` it stops returning one on every grant after
      // the first — which is exactly the grant a reinstall depends on.
      authParams: { access_type: "offline", prompt: "consent", include_granted_scopes: "true" },
      pkce: true,
      tokenAuth: "body",
      tokenBody: "form",
      refreshable: true,
      clientIdKey: "GOOGLE_OAUTH_CLIENT_ID",
      clientSecretKey: "GOOGLE_OAUTH_CLIENT_SECRET",
      identityUrl: "https://openidconnect.googleapis.com/v1/userinfo",
      identityPath: "email",
    },
  },
  {
    id: "hubspot",
    kind: "oauth",
    label: "HubSpot",
    descriptionKey: "connections.hubspot.description",
    unlockKeys: [
      "connections.hubspot.unlockContacts",
      "connections.hubspot.unlockSync",
    ],
    appDocsUrl: "https://developers.hubspot.com/docs/api/working-with-oauth",
    oauth: {
      authorizeUrl: "https://app.hubspot.com/oauth/authorize",
      tokenUrl: "https://api.hubapi.com/oauth/v1/token",
      scopes: ["oauth", "crm.objects.contacts.read", "crm.objects.contacts.write"],
      scopeSeparator: " ",
      pkce: false,
      tokenAuth: "body",
      tokenBody: "form",
      refreshable: true,
      clientIdKey: "HUBSPOT_CLIENT_ID",
      clientSecretKey: "HUBSPOT_CLIENT_SECRET",
      identityUrl: "https://api.hubapi.com/oauth/v1/access-tokens/{token}",
      identityPath: "hub_domain",
    },
  },
  {
    id: "calendly",
    kind: "oauth",
    label: "Calendly",
    descriptionKey: "connections.calendly.description",
    unlockKeys: [
      "connections.calendly.unlockBooking",
      "connections.calendly.unlockEvents",
    ],
    appDocsUrl: "https://developer.calendly.com/how-to-authenticate-with-oauth",
    oauth: {
      authorizeUrl: "https://auth.calendly.com/oauth/authorize",
      tokenUrl: "https://auth.calendly.com/oauth/token",
      scopes: [],
      scopeSeparator: " ",
      pkce: true,
      tokenAuth: "basic",
      tokenBody: "form",
      refreshable: true,
      clientIdKey: "CALENDLY_CLIENT_ID",
      clientSecretKey: "CALENDLY_CLIENT_SECRET",
      identityUrl: "https://api.calendly.com/users/me",
      identityPath: "resource.email",
    },
  },
  {
    id: "slack",
    kind: "oauth",
    label: "Slack",
    descriptionKey: "connections.slack.description",
    unlockKeys: ["connections.slack.unlockNotify", "connections.slack.unlockHandoff"],
    appDocsUrl: "https://api.slack.com/apps",
    oauth: {
      authorizeUrl: "https://slack.com/oauth/v2/authorize",
      tokenUrl: "https://slack.com/api/oauth.v2.access",
      scopes: ["chat:write", "channels:read", "chat:write.public"],
      scopeSeparator: ",",
      pkce: false,
      tokenAuth: "body",
      tokenBody: "form",
      // Slack bot tokens do not expire unless the workspace opts into token
      // rotation, which this app does not request.
      refreshable: false,
      clientIdKey: "SLACK_CLIENT_ID",
      clientSecretKey: "SLACK_CLIENT_SECRET",
      accountPath: "team.name",
    },
  },
  {
    id: "notion",
    kind: "oauth",
    label: "Notion",
    descriptionKey: "connections.notion.description",
    unlockKeys: ["connections.notion.unlockDatabase", "connections.notion.unlockNotes"],
    appDocsUrl: "https://www.notion.so/my-integrations",
    oauth: {
      authorizeUrl: "https://api.notion.com/v1/oauth/authorize",
      tokenUrl: "https://api.notion.com/v1/oauth/token",
      scopes: [],
      scopeSeparator: " ",
      authParams: { owner: "user" },
      pkce: false,
      tokenAuth: "basic",
      tokenBody: "json",
      refreshable: false,
      clientIdKey: "NOTION_CLIENT_ID",
      clientSecretKey: "NOTION_CLIENT_SECRET",
      accountPath: "workspace_name",
    },
  },
  {
    id: "airtable",
    kind: "oauth",
    label: "Airtable",
    descriptionKey: "connections.airtable.description",
    unlockKeys: ["connections.airtable.unlockRows", "connections.airtable.unlockBases"],
    appDocsUrl: "https://airtable.com/create/oauth",
    oauth: {
      authorizeUrl: "https://airtable.com/oauth2/v1/authorize",
      tokenUrl: "https://airtable.com/oauth2/v1/token",
      scopes: [
        "data.records:read",
        "data.records:write",
        "schema.bases:read",
        "user.email:read",
      ],
      scopeSeparator: " ",
      // Airtable rejects an authorization request without PKCE outright.
      pkce: true,
      tokenAuth: "basic",
      tokenBody: "form",
      refreshable: true,
      clientIdKey: "AIRTABLE_CLIENT_ID",
      clientSecretKey: "AIRTABLE_CLIENT_SECRET",
      identityUrl: "https://api.airtable.com/v0/meta/whoami",
      identityPath: "email",
    },
  },
];

/**
 * Vendors whose public API has no user-level OAuth, so a key stays the only
 * honest option. Named on the page so the answer to "why does this one ask me
 * for a key?" is on screen instead of in a support thread.
 */
export const MANUAL_CONNECTIONS: readonly ManualConnection[] = [
  {
    id: "shopify",
    kind: "api_key",
    label: "Shopify",
    descriptionKey: "connections.shopify.description",
    reasonKey: "connections.shopify.reason",
    settingsGroup: "shopify",
    credentialKeys: ["SHOPIFY_SHOP_DOMAIN", "SHOPIFY_ADMIN_ACCESS_TOKEN"],
  },
  {
    id: "mercadopago",
    kind: "api_key",
    label: "Mercado Pago",
    descriptionKey: "connections.mercadopago.description",
    reasonKey: "connections.mercadopago.reason",
    settingsGroup: "mercadopago",
    credentialKeys: ["MERCADOPAGO_ACCESS_TOKEN"],
  },
  {
    id: "stripe",
    kind: "api_key",
    label: "Stripe",
    descriptionKey: "connections.stripe.description",
    reasonKey: "connections.stripe.reason",
    settingsGroup: "stripe",
    credentialKeys: ["STRIPE_SECRET_KEY"],
  },
  {
    id: "meta",
    kind: "api_key",
    label: "Meta",
    descriptionKey: "connections.meta.description",
    reasonKey: "connections.meta.reason",
    settingsGroup: "meta-ads",
    credentialKeys: ["META_ACCESS_TOKEN", "META_AD_ACCOUNT_ID"],
  },
  {
    id: "elevenlabs",
    kind: "api_key",
    label: "ElevenLabs",
    descriptionKey: "connections.elevenlabs.description",
    reasonKey: "connections.elevenlabs.reason",
    settingsGroup: "elevenlabs",
    credentialKeys: ["ELEVENLABS_API_KEY"],
  },
  // BYOK — bring your own AI provider key. Connecting one of these switches
  // that provider's calls to billing_source "BYOK" (see lib/credit-gate.ts):
  // Steve stops paying for them, the customer's own account does. All three
  // share the "ai-provider" Settings group, the same one that already picks
  // which provider is active — a key can be saved here even for a provider
  // that isn't the active one, so switching providers later doesn't mean
  // retyping a key that was already given once.
  {
    id: "anthropic",
    kind: "api_key",
    label: "Anthropic",
    descriptionKey: "connections.anthropic.description",
    reasonKey: "connections.anthropic.reason",
    settingsGroup: "ai-provider",
    credentialKeys: ["ANTHROPIC_API_KEY"],
  },
  {
    id: "openai",
    kind: "api_key",
    label: "OpenAI",
    descriptionKey: "connections.openai.description",
    reasonKey: "connections.openai.reason",
    settingsGroup: "ai-provider",
    credentialKeys: ["OPENAI_API_KEY"],
  },
  {
    id: "ai-gateway",
    kind: "api_key",
    label: "Vercel AI Gateway",
    descriptionKey: "connections.aiGateway.description",
    reasonKey: "connections.aiGateway.reason",
    settingsGroup: "ai-provider",
    credentialKeys: ["AI_GATEWAY_API_KEY"],
  },
  {
    id: "twilio",
    kind: "api_key",
    label: "Twilio",
    descriptionKey: "connections.twilio.description",
    reasonKey: "connections.twilio.reason",
    settingsGroup: "twilio",
    credentialKeys: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"],
  },
  {
    id: "smtp",
    kind: "api_key",
    label: "SMTP",
    descriptionKey: "connections.smtp.description",
    reasonKey: "connections.smtp.reason",
    settingsGroup: "smtp",
    credentialKeys: ["SMTP_HOST", "SMTP_USER", "SMTP_PASS"],
  },
  {
    id: "resend",
    kind: "api_key",
    label: "Resend",
    descriptionKey: "connections.resend.description",
    reasonKey: "connections.resend.reason",
    settingsGroup: "resend",
    credentialKeys: ["RESEND_API_KEY", "RESEND_FROM_EMAIL"],
    previewKey: "RESEND_API_KEY",
  },
];

export function isConnectionId(value: unknown): value is ConnectionId {
  return OAUTH_CONNECTIONS.some((connection) => connection.id === value);
}

export function isManualConnectionId(value: unknown): value is ManualConnectionId {
  return MANUAL_CONNECTIONS.some((connection) => connection.id === value);
}

export function getManualConnectionDefinition(id: ManualConnectionId): ManualConnection {
  const found = MANUAL_CONNECTIONS.find((connection) => connection.id === id);
  if (!found) throw new Error(`Unknown manual connection: ${id}`);
  return found;
}

export function getConnectionDefinition(id: ConnectionId): OAuthConnection {
  const found = OAUTH_CONNECTIONS.find((connection) => connection.id === id);
  if (!found) throw new Error(`Unknown connection: ${id}`);
  return found;
}
