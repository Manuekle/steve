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
  | "slack"
  | "notion"
  | "salesforce";

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
  | "gemini"
  | "ai-gateway"
  | "zendesk"
  | "chargebee"
  | "mailerlite"
  | "tavily";

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
  /** Google requires PKCE; the others accept it too, so it is per-connection. */
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
  /**
   * The vendor's API hosts. A connected account's token is attached to
   * `http_request` calls that land on these hosts and nowhere else, which is
   * what makes connecting an account do something rather than only store a
   * token — see lib/connection-http.ts. Subdomains count, so
   * "googleapis.com" covers sheets.googleapis.com.
   */
  readonly apiHosts: readonly string[];
  /** Headers the vendor's API requires beyond Authorization. */
  readonly apiHeaders?: Readonly<Record<string, string>>;
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
    apiHosts: ["googleapis.com"],
    oauth: {
      authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      scopes: [
        "openid",
        "email",
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/calendar",
        "https://www.googleapis.com/auth/drive.file",
        "https://www.googleapis.com/auth/drive.readonly",
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
    apiHosts: ["api.hubapi.com"],
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
    id: "slack",
    kind: "oauth",
    label: "Slack",
    descriptionKey: "connections.slack.description",
    unlockKeys: ["connections.slack.unlockNotify", "connections.slack.unlockHandoff"],
    appDocsUrl: "https://api.slack.com/apps",
    apiHosts: ["slack.com"],
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
    apiHosts: ["api.notion.com"],
    // Notion refuses any request that does not pin an API version.
    apiHeaders: { "Notion-Version": "2022-06-28" },
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
    id: "salesforce",
    kind: "oauth",
    label: "Salesforce",
    descriptionKey: "connections.salesforce.description",
    unlockKeys: ["connections.salesforce.unlockLeads", "connections.salesforce.unlockContacts"],
    appDocsUrl: "https://help.salesforce.com/s/articleView?id=sf.connected_app_create.htm",
    // Each org's API lives on its own instance/My Domain host, always a
    // subdomain of one of these two — there is no single fixed API host.
    apiHosts: ["salesforce.com", "force.com"],
    oauth: {
      authorizeUrl: "https://login.salesforce.com/services/oauth2/authorize",
      tokenUrl: "https://login.salesforce.com/services/oauth2/token",
      scopes: ["api", "refresh_token", "offline_access"],
      scopeSeparator: " ",
      pkce: true,
      tokenAuth: "body",
      tokenBody: "form",
      refreshable: true,
      clientIdKey: "SALESFORCE_CLIENT_ID",
      clientSecretKey: "SALESFORCE_CLIENT_SECRET",
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
  // Steve stops paying for them, the customer's own account does. All four
  // share the "ai-provider" Settings group, the same one that already picks
  // which provider is active — a key can be saved here even for a provider
  // that isn't the active one, so switching providers later doesn't mean
  // retyping a key that was already given once. Every provider the AI group
  // offers has a card here: Gemini was selectable in Settings but had none,
  // so the one place that lists "what am I paying for myself" was missing it.
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
    id: "gemini",
    kind: "api_key",
    label: "Google Gemini",
    descriptionKey: "connections.gemini.description",
    reasonKey: "connections.gemini.reason",
    settingsGroup: "ai-provider",
    credentialKeys: ["GOOGLE_GENERATIVE_AI_API_KEY"],
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
  {
    id: "zendesk",
    kind: "api_key",
    label: "Zendesk",
    descriptionKey: "connections.zendesk.description",
    reasonKey: "connections.zendesk.reason",
    settingsGroup: "zendesk",
    credentialKeys: ["ZENDESK_SUBDOMAIN", "ZENDESK_EMAIL", "ZENDESK_API_TOKEN"],
    previewKey: "ZENDESK_API_TOKEN",
  },
  {
    id: "chargebee",
    kind: "api_key",
    label: "Chargebee",
    descriptionKey: "connections.chargebee.description",
    reasonKey: "connections.chargebee.reason",
    settingsGroup: "chargebee",
    credentialKeys: ["CHARGEBEE_SITE", "CHARGEBEE_API_KEY"],
    previewKey: "CHARGEBEE_API_KEY",
  },
  {
    id: "mailerlite",
    kind: "api_key",
    label: "MailerLite",
    descriptionKey: "connections.mailerlite.description",
    reasonKey: "connections.mailerlite.reason",
    settingsGroup: "mailerlite",
    credentialKeys: ["MAILERLITE_API_KEY"],
    previewKey: "MAILERLITE_API_KEY",
  },
  {
    id: "tavily",
    kind: "api_key",
    label: "Tavily",
    descriptionKey: "connections.tavily.description",
    reasonKey: "connections.tavily.reason",
    settingsGroup: "tavily",
    credentialKeys: ["TAVILY_API_KEY"],
    previewKey: "TAVILY_API_KEY",
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
