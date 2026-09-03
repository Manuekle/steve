import type { OAuthConfig } from "./connections";

/**
 * Google OAuth config for "Continuar con Google" on /login — identity only.
 *
 * Deliberately separate from the "google" entry in lib/connections.ts, which
 * asks for offline access plus every integration scope (Sheets, Calendar,
 * Drive, Gmail) because a Connection has to keep working unattended. Signing
 * in only needs to know whose inbox this is: no refresh token, no consent
 * screen forced on a returning visitor, no scopes the login screen has no use
 * for.
 */
export const GOOGLE_LOGIN_OAUTH: OAuthConfig = {
  authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenUrl: "https://oauth2.googleapis.com/token",
  scopes: ["openid", "email"],
  scopeSeparator: " ",
  pkce: true,
  tokenAuth: "body",
  tokenBody: "form",
  // Not used — this flow reads its own access token once and discards it,
  // never lib/oauth-client.ts's refreshTokens().
  refreshable: false,
  // Same app credentials as the "google" Connection (lib/connections.ts):
  // one Google Cloud OAuth app, two things it can be used for.
  clientIdKey: "GOOGLE_OAUTH_CLIENT_ID",
  clientSecretKey: "GOOGLE_OAUTH_CLIENT_SECRET",
  identityUrl: "https://openidconnect.googleapis.com/v1/userinfo",
  identityPath: "email",
};
