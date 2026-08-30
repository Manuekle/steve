// Every provider an account can be stored for, and what "an account" means for
// each one.
//
// Two shapes, one list. An OAuth provider is added by signing in: the grant is
// server-to-server afterwards, so an automation running at 3am has a token
// without anyone being logged in. An API-key provider is added by pasting the
// values its API actually accepts — no OAuth exists to hide them behind, and
// pretending otherwise would only mean a Connect button that opens a form.
//
// Unlike Settings, which holds one global value per key, this catalog backs a
// store that can hold *several* accounts per provider: two Google accounts,
// a sandbox and a live OpenAI key, one HubSpot portal per brand. Each step
// that uses a provider picks the account by name, and the one marked default
// is what anything unnamed gets.

import { OAUTH_CONNECTIONS, type OAuthConfig } from "./connections";
import type { CredentialKey } from "./credentials";

export type CredentialProviderKind = "oauth" | "api_key";

export type CredentialField = {
  readonly key: string;
  readonly label: string;
  readonly type?: "text" | "password";
  readonly placeholder?: string;
  /** Dictionary key for the hint under the input. */
  readonly helpKey?: string;
  readonly required?: boolean;
};

export type CredentialProvider = {
  readonly id: string;
  /** Vendor name. Never translated. */
  readonly label: string;
  readonly kind: CredentialProviderKind;
  readonly descriptionKey: string;
  /** Providers that share one registered app, so the page can say so. */
  readonly family?: "google" | "microsoft" | "meta";
  readonly oauth?: OAuthConfig;
  readonly fields?: readonly CredentialField[];
  /** Where to register the app (OAuth) or find the key (API key). */
  readonly docsUrl: string;
};

/** Reuse the configs the curated Connections cards already carry, so a change
 *  to HubSpot's endpoints lands in one place rather than two. */
function reuse(id: string): OAuthConfig {
  const found = OAUTH_CONNECTIONS.find((connection) => connection.id === id);
  if (!found) throw new Error(`No OAuth config to reuse for ${id}`);
  return found.oauth;
}

const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const MICROSOFT_AUTH = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const MICROSOFT_TOKEN = "https://login.microsoftonline.com/common/oauth2/v2.0/token";

/** Google hands back a refresh token only when asked, and only re-asks when
 *  forced — the same two params every Google grant here needs. */
function googleOAuth(scopes: readonly string[]): OAuthConfig {
  return {
    authorizeUrl: GOOGLE_AUTH,
    tokenUrl: GOOGLE_TOKEN,
    scopes: ["openid", "email", ...scopes],
    scopeSeparator: " ",
    authParams: { access_type: "offline", prompt: "consent", include_granted_scopes: "true" },
    pkce: true,
    tokenAuth: "body",
    tokenBody: "form",
    refreshable: true,
    clientIdKey: "GOOGLE_OAUTH_CLIENT_ID" satisfies CredentialKey,
    clientSecretKey: "GOOGLE_OAUTH_CLIENT_SECRET" satisfies CredentialKey,
    identityUrl: "https://openidconnect.googleapis.com/v1/userinfo",
    identityPath: "email",
  };
}

/** Microsoft's identity platform, common tenant: personal and work accounts
 *  both sign in, and `offline_access` is what makes the grant survive the
 *  hour-long access token. */
function microsoftOAuth(scopes: readonly string[]): OAuthConfig {
  return {
    authorizeUrl: MICROSOFT_AUTH,
    tokenUrl: MICROSOFT_TOKEN,
    scopes: ["offline_access", "openid", "email", ...scopes],
    scopeSeparator: " ",
    pkce: true,
    tokenAuth: "body",
    tokenBody: "form",
    refreshable: true,
    clientIdKey: "MICROSOFT_OAUTH_CLIENT_ID" satisfies CredentialKey,
    clientSecretKey: "MICROSOFT_OAUTH_CLIENT_SECRET" satisfies CredentialKey,
    identityUrl: "https://graph.microsoft.com/v1.0/me",
    identityPath: "userPrincipalName",
  };
}

export const CREDENTIAL_PROVIDERS: readonly CredentialProvider[] = [
  {
    id: "google-sheets",
    label: "Google Sheets",
    kind: "oauth",
    family: "google",
    descriptionKey: "credentials.provider.googleSheets",
    docsUrl: "https://console.cloud.google.com/apis/credentials",
    oauth: googleOAuth([
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive.file",
    ]),
  },
  {
    id: "gmail",
    label: "Gmail",
    kind: "oauth",
    family: "google",
    descriptionKey: "credentials.provider.gmail",
    docsUrl: "https://console.cloud.google.com/apis/credentials",
    oauth: googleOAuth([
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/gmail.readonly",
    ]),
  },
  {
    id: "google-calendar",
    label: "Google Calendar",
    kind: "oauth",
    family: "google",
    descriptionKey: "credentials.provider.googleCalendar",
    docsUrl: "https://console.cloud.google.com/apis/credentials",
    oauth: googleOAuth(["https://www.googleapis.com/auth/calendar"]),
  },
  {
    id: "onedrive",
    label: "OneDrive",
    kind: "oauth",
    family: "microsoft",
    descriptionKey: "credentials.provider.onedrive",
    docsUrl: "https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps",
    oauth: microsoftOAuth(["Files.ReadWrite.All"]),
  },
  {
    id: "microsoft-excel",
    label: "Microsoft Excel",
    kind: "oauth",
    family: "microsoft",
    descriptionKey: "credentials.provider.excel",
    docsUrl: "https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps",
    // Excel on Graph is a workbook inside a drive item: the file permission is
    // the workbook permission.
    oauth: microsoftOAuth(["Files.ReadWrite.All"]),
  },
  {
    id: "microsoft-outlook",
    label: "Microsoft Outlook",
    kind: "oauth",
    family: "microsoft",
    descriptionKey: "credentials.provider.outlook",
    docsUrl: "https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps",
    oauth: microsoftOAuth(["Mail.Send", "Mail.Read", "Calendars.ReadWrite"]),
  },
  {
    id: "hubspot",
    label: "HubSpot",
    kind: "oauth",
    descriptionKey: "credentials.provider.hubspot",
    docsUrl: "https://developers.hubspot.com/docs/api/working-with-oauth",
    oauth: reuse("hubspot"),
  },
  {
    id: "notion",
    label: "Notion",
    kind: "oauth",
    descriptionKey: "credentials.provider.notion",
    docsUrl: "https://www.notion.so/my-integrations",
    oauth: reuse("notion"),
  },
  {
    id: "calendly",
    label: "Calendly",
    kind: "oauth",
    descriptionKey: "credentials.provider.calendly",
    docsUrl: "https://developer.calendly.com/how-to-authenticate-with-oauth",
    oauth: reuse("calendly"),
  },
  {
    id: "slack",
    label: "Slack",
    kind: "oauth",
    descriptionKey: "credentials.provider.slack",
    docsUrl: "https://api.slack.com/apps",
    oauth: reuse("slack"),
  },
  {
    id: "airtable",
    label: "Airtable",
    kind: "oauth",
    descriptionKey: "credentials.provider.airtable",
    docsUrl: "https://airtable.com/create/oauth",
    oauth: reuse("airtable"),
  },
  {
    id: "wordpress",
    label: "WordPress",
    kind: "oauth",
    descriptionKey: "credentials.provider.wordpress",
    docsUrl: "https://developer.wordpress.com/apps/",
    oauth: {
      // WordPress.com, which also fronts Jetpack-connected self-hosted sites.
      authorizeUrl: "https://public-api.wordpress.com/oauth2/authorize",
      tokenUrl: "https://public-api.wordpress.com/oauth2/token",
      scopes: ["global"],
      scopeSeparator: " ",
      pkce: false,
      tokenAuth: "body",
      tokenBody: "form",
      // WordPress.com tokens do not expire and no refresh token is issued.
      refreshable: false,
      clientIdKey: "WORDPRESS_CLIENT_ID",
      clientSecretKey: "WORDPRESS_CLIENT_SECRET",
      identityUrl: "https://public-api.wordpress.com/rest/v1.1/me",
      identityPath: "username",
    },
  },
  {
    id: "meta-ads",
    label: "Meta Ads",
    kind: "oauth",
    family: "meta",
    descriptionKey: "credentials.provider.metaAds",
    docsUrl: "https://developers.facebook.com/apps",
    oauth: {
      authorizeUrl: "https://www.facebook.com/v21.0/dialog/oauth",
      tokenUrl: "https://graph.facebook.com/v21.0/oauth/access_token",
      scopes: ["ads_read", "ads_management", "leads_retrieval", "business_management"],
      scopeSeparator: ",",
      pkce: false,
      tokenAuth: "body",
      tokenBody: "form",
      // Meta swaps a short-lived token for a 60-day one; there is no refresh
      // grant, so a reconnect is the renewal.
      refreshable: false,
      clientIdKey: "META_APP_ID",
      clientSecretKey: "META_APP_SECRET",
      identityUrl: "https://graph.facebook.com/v21.0/me",
      identityPath: "name",
    },
  },
  {
    id: "openai",
    label: "OpenAI",
    kind: "api_key",
    descriptionKey: "credentials.provider.openai",
    docsUrl: "https://platform.openai.com/api-keys",
    fields: [
      {
        key: "apiKey",
        label: "API key",
        type: "password",
        required: true,
        placeholder: "sk-…",
        helpKey: "credentials.help.openai",
      },
    ],
  },
  {
    id: "gemini",
    label: "Gemini",
    kind: "api_key",
    descriptionKey: "credentials.provider.gemini",
    docsUrl: "https://aistudio.google.com/app/apikey",
    fields: [
      {
        key: "apiKey",
        label: "API key",
        type: "password",
        required: true,
        placeholder: "AIza…",
        helpKey: "credentials.help.gemini",
      },
    ],
  },
  {
    id: "anthropic",
    label: "Anthropic",
    kind: "api_key",
    descriptionKey: "credentials.provider.anthropic",
    docsUrl: "https://console.anthropic.com/settings/keys",
    fields: [
      {
        key: "apiKey",
        label: "API key",
        type: "password",
        required: true,
        placeholder: "sk-ant-…",
        helpKey: "credentials.help.anthropic",
      },
    ],
  },
  {
    id: "smtp",
    label: "SMTP Server",
    kind: "api_key",
    descriptionKey: "credentials.provider.smtp",
    docsUrl: "https://nodemailer.com/smtp/",
    fields: [
      { key: "host", label: "Host", required: true, placeholder: "smtp.gmail.com" },
      { key: "port", label: "Port", required: true, placeholder: "587" },
      { key: "user", label: "User", required: true, placeholder: "hola@empresa.com" },
      { key: "password", label: "Password", type: "password", required: true },
      { key: "from", label: "From", placeholder: "Steve <hola@empresa.com>" },
    ],
  },
];

export function getProvider(id: string): CredentialProvider | undefined {
  return CREDENTIAL_PROVIDERS.find((provider) => provider.id === id);
}

export function isProviderId(value: unknown): value is string {
  return typeof value === "string" && CREDENTIAL_PROVIDERS.some((p) => p.id === value);
}

/** Providers whose grant can cover a given Google scope, most specific first.
 *  Used to answer "do we have a Google identity that can write a sheet?" */
export function googleProviderIds(): readonly string[] {
  return CREDENTIAL_PROVIDERS.filter((p) => p.family === "google").map((p) => p.id);
}
