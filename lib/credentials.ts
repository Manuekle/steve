import { existsSync, readFileSync } from "node:fs";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

// Local credential store for Steve.
//
// Credentials are persisted to ~/.steve/credentials.json so they survive
// restarts without being baked into the .env file. Every read falls back to
// the matching environment variable, so env vars still work as before.
//
// The sync reader (`getCredentialSync`) uses an in-memory cache loaded once
// from disk at startup, so it is safe to call from channel modules that run
// during Eve's discovery phase (which is synchronous). The async API
// (`getCredential`, `getAllCredentials`) reads fresh from disk for the
// settings UI.

const CREDENTIALS_DIR = join(homedir(), ".steve");
const CREDENTIALS_FILE = join(CREDENTIALS_DIR, "credentials.json");

// In-memory cache for sync reads. Loaded lazily on first access.
let cachedStore: CredentialStore | null = null;

function loadCacheSync(): CredentialStore {
  if (cachedStore) return cachedStore;
  try {
    if (existsSync(CREDENTIALS_FILE)) {
      const raw = readFileSync(CREDENTIALS_FILE, "utf-8");
      cachedStore = JSON.parse(raw) as CredentialStore;
    } else {
      cachedStore = {};
    }
  } catch {
    cachedStore = {};
  }
  return cachedStore;
}

export type CredentialKey =
  // Model provider selection ("gateway" | "openai" | "anthropic")
  | "AI_PROVIDER"
  | "AI_MODEL"
  // AI Gateway
  | "AI_GATEWAY_API_KEY"
  // Direct providers (alternative to the Gateway)
  | "OPENAI_API_KEY"
  | "ANTHROPIC_API_KEY"
  // Name fixed by @ai-sdk/google, which reads it straight off process.env.
  | "GOOGLE_GENERATIVE_AI_API_KEY"
  // WhatsApp
  | "WHATSAPP_ACCESS_TOKEN"
  | "WHATSAPP_APP_SECRET"
  | "WHATSAPP_PHONE_NUMBER_ID"
  | "WHATSAPP_VERIFY_TOKEN"
  // Facebook Messenger
  | "FACEBOOK_APP_SECRET"
  | "FACEBOOK_PAGE_ACCESS_TOKEN"
  | "FACEBOOK_VERIFY_TOKEN"
  // Instagram (Instagram API with Instagram Login — separate from Messenger)
  | "INSTAGRAM_ACCESS_TOKEN"
  | "INSTAGRAM_APP_SECRET"
  | "INSTAGRAM_VERIFY_TOKEN"
  | "INSTAGRAM_ACCOUNT_ID"
  // Outbound HTTP tool
  | "HTTP_ALLOWLIST"
  // Lead webhook
  | "LEAD_WEBHOOK_SECRET"
  // WhatsApp templates (for 24h+ outbound)
  | "WHATSAPP_TEMPLATE_NAME"
  | "WHATSAPP_TEMPLATE_LANG"
  // Google Sheets (log_sheet step)
  | "GOOGLE_SERVICE_ACCOUNT_JSON"
  // Google Calendar (calendar tools)
  | "GOOGLE_CALENDAR_ID"
  // OAuth app identity for the Connections page. These are the *app's*
  // credentials, not the operator's account: on a hosted install they come
  // from the environment and nobody types them. A self-hoster registers their
  // own app once and fills them here.
  | "GOOGLE_OAUTH_CLIENT_ID"
  | "GOOGLE_OAUTH_CLIENT_SECRET"
  | "HUBSPOT_CLIENT_ID"
  | "HUBSPOT_CLIENT_SECRET"
  | "CALENDLY_CLIENT_ID"
  | "CALENDLY_CLIENT_SECRET"
  | "SLACK_CLIENT_ID"
  | "SLACK_CLIENT_SECRET"
  | "NOTION_CLIENT_ID"
  | "NOTION_CLIENT_SECRET"
  | "AIRTABLE_CLIENT_ID"
  | "AIRTABLE_CLIENT_SECRET"
  | "MICROSOFT_OAUTH_CLIENT_ID"
  | "MICROSOFT_OAUTH_CLIENT_SECRET"
  | "WORDPRESS_CLIENT_ID"
  | "WORDPRESS_CLIENT_SECRET"
  | "META_APP_ID"
  | "META_APP_SECRET"
  // Stripe (send_payment_link step)
  | "STRIPE_SECRET_KEY"
  | "STRIPE_WEBHOOK_SECRET"
  // Mercado Pago (send_payment_link step, Latin America)
  | "MERCADOPAGO_ACCESS_TOKEN"
  // Shopify (shopify_orders agent tool)
  | "SHOPIFY_SHOP_DOMAIN"
  | "SHOPIFY_ADMIN_ACCESS_TOKEN"
  // ElevenLabs (voice generation)
  | "ELEVENLABS_API_KEY"
  | "ELEVENLABS_VOICE_ID"
  | "ELEVENLABS_MODEL_ID"
  | "ELEVENLABS_WEBHOOK_SECRET"
  // Twilio (phone numbers for voice agents)
  | "TWILIO_ACCOUNT_SID"
  | "TWILIO_AUTH_TOKEN"
  | "TWILIO_PHONE_NUMBER"
  // Email notifications (notify_email step)
  | "SMTP_HOST"
  | "SMTP_PORT"
  | "SMTP_USER"
  | "SMTP_PASS"
  | "SMTP_FROM"
  // Resend (transactional email)
  | "RESEND_API_KEY"
  | "RESEND_FROM_EMAIL"
  // Meta Ads
  | "META_ACCESS_TOKEN"
  | "META_AD_ACCOUNT_ID"
  // Database (Postgres Workflow world)
  | "WORKFLOW_POSTGRES_URL"
  | "POSTGRES_USER"
  | "POSTGRES_PASSWORD"
  | "POSTGRES_DB"
  | "POSTGRES_HOST_PORT";

export type CredentialStore = Partial<Record<CredentialKey, string>>;

export type CredentialGroup = {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly fields: ReadonlyArray<{
    readonly key: CredentialKey;
    readonly label: string;
    readonly placeholder?: string;
    readonly type?: "text" | "password" | "select";
    readonly required?: boolean;
    readonly help?: string;
    readonly pattern?: string;
    readonly title?: string;
    /** Only for `type: "select"`. */
    readonly options?: ReadonlyArray<{ readonly value: string; readonly label: string }>;
    /** Show this field only when `AI_PROVIDER` has one of these values. */
    readonly showWhenProvider?: ReadonlyArray<string>;
  }>;
};

export const CREDENTIAL_GROUPS: ReadonlyArray<CredentialGroup> = [
  {
    id: "ai-provider",
    label: "Modelo de IA",
    description:
      "Elegí por dónde habla el agente: el Vercel AI Gateway (un solo key, catálogo completo) o una API directa de OpenAI o Anthropic. Solo hace falta la key del proveedor elegido.",
    fields: [
      {
        key: "AI_PROVIDER",
        label: "Proveedor",
        type: "select",
        required: true,
        options: [
          { value: "gateway", label: "Vercel AI Gateway" },
          { value: "openai", label: "OpenAI" },
          { value: "anthropic", label: "Anthropic" },
          { value: "google", label: "Google Gemini" },
        ],
        help: "El Gateway rutea a cualquier modelo del catálogo; OpenAI y Anthropic llaman al proveedor directo.",
      },
      {
        key: "AI_MODEL",
        label: "Modelo",
        required: false,
        placeholder: "openai/gpt-5-mini-fast",
        help: "Modelo global por defecto, entre los recomendados de tu proveedor. En cada chat podés elegir cualquier otro con el buscador.",
        pattern: "^[A-Za-z0-9._/-]+$",
        title: "Letras, números, puntos, guiones y barras",
      },
      {
        key: "AI_GATEWAY_API_KEY",
        label: "Vercel AI Gateway API Key",
        type: "password",
        required: false,
        placeholder: "vck_xxxxxxxxxxxxxxxxxxxx",
        pattern: "^vck_.+$",
        title: "Debe comenzar con vck_ y tener al menos un carácter más",
        help: "vercel.com/dashboard/ai/api-keys. También habilita los embeddings del Conocimiento (RAG) si no cargás una key de OpenAI.",
        showWhenProvider: ["gateway"],
      },
      {
        key: "OPENAI_API_KEY",
        label: "OpenAI API Key",
        type: "password",
        required: false,
        placeholder: "sk-xxxxxxxxxxxxxxxxxxxx",
        pattern: "^sk-.+$",
        title: "Debe comenzar con sk-",
        help: "platform.openai.com/api-keys. Se usa también para los embeddings del Conocimiento (RAG).",
        showWhenProvider: ["openai"],
      },
      {
        key: "ANTHROPIC_API_KEY",
        label: "Anthropic API Key",
        type: "password",
        required: false,
        placeholder: "sk-ant-xxxxxxxxxxxxxxxxxxxx",
        pattern: "^sk-ant-.+$",
        title: "Debe comenzar con sk-ant-",
        help: "console.anthropic.com/settings/keys. Anthropic no ofrece embeddings: el Conocimiento (RAG) necesita además la key de OpenAI o la del Gateway.",
        showWhenProvider: ["anthropic"],
      },
      {
        key: "GOOGLE_GENERATIVE_AI_API_KEY",
        label: "Google Gemini API Key",
        type: "password",
        required: false,
        placeholder: "AIzaSyxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        pattern: "^AIza[A-Za-z0-9_-]{10,}$",
        title: "Debe comenzar con AIza",
        help: "aistudio.google.com/apikey. Gemini tampoco cubre embeddings acá: el Conocimiento (RAG) necesita además la key de OpenAI o la del Gateway.",
        showWhenProvider: ["google"],
      },
    ],
  },
  {
    id: "whatsapp",
    label: "WhatsApp Business",
    description:
      "Meta WhatsApp Business Cloud API. Get these from developers.facebook.com/apps > WhatsApp > API Setup.",
    fields: [
      {
        key: "WHATSAPP_ACCESS_TOKEN",
        label: "Access Token",
        type: "password",
        required: true,
        placeholder: "EAAxxxxxxxxxxxxxxxxxxxxx",
        help: "Permanent System User Token recommended over temporary tokens.",
        pattern: "^[A-Za-z0-9_\\-]+$",
        title: "Solo letras, números, guiones y guiones bajos",
      },
      {
        key: "WHATSAPP_APP_SECRET",
        label: "App Secret",
        type: "password",
        required: true,
        placeholder: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        help: "App Settings > Basic > App Secret.",
        pattern: "^[A-Za-z0-9]+$",
        title: "Solo letras y números",
      },
      {
        key: "WHATSAPP_PHONE_NUMBER_ID",
        label: "Phone Number ID",
        required: true,
        placeholder: "1234567890123456",
        help: "WhatsApp > API Setup > Phone Number ID.",
        pattern: "^[0-9]{10,20}$",
        title: "Solo números, entre 10 y 20 dígitos",
      },
      {
        key: "WHATSAPP_VERIFY_TOKEN",
        label: "Webhook Verify Token",
        type: "password",
        required: true,
        placeholder: "my_secret_token_123",
        help: "Your custom secret string for webhook verification.",
        pattern: "^.{8,}$",
        title: "Mínimo 8 caracteres",
      },
      {
        key: "WHATSAPP_TEMPLATE_NAME",
        label: "Template name (24h+ outbound)",
        required: false,
        placeholder: "followup_v1",
        help: "HSM template name from Meta Business Suite. Used for outbound messages outside the 24h free-form window. Without this, followups are queued but not sent.",
        pattern: "^[a-z0-9_]+$",
        title: "Solo letras minúsculas, números y guiones bajos",
      },
      {
        key: "WHATSAPP_TEMPLATE_LANG",
        label: "Template language",
        required: false,
        placeholder: "es",
        help: "Language code for the template (e.g. es, en, pt_BR). Default: es.",
        pattern: "^[a-z]{2}(_[A-Z]{2})?$",
        title: "Formato: es, en, pt_BR, etc.",
      },
    ],
  },
  {
    id: "messenger",
    label: "Facebook Messenger",
    description:
      "Meta Messenger Platform API for Facebook Page DMs. Get these from developers.facebook.com/apps > Messenger API Settings.",
    fields: [
      {
        key: "FACEBOOK_APP_SECRET",
        label: "App Secret",
        type: "password",
        required: true,
        placeholder: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        help: "App Settings > Basic > App Secret.",
        pattern: "^[A-Za-z0-9]+$",
        title: "Solo letras y números",
      },
      {
        key: "FACEBOOK_PAGE_ACCESS_TOKEN",
        label: "Page Access Token",
        type: "password",
        required: true,
        placeholder: "EAAxxxxxxxxxxxxxxxxxxxxx",
        help: "Generated under Messenger API Settings.",
        pattern: "^[A-Za-z0-9_\\-]+$",
        title: "Solo letras, números, guiones y guiones bajos",
      },
      {
        key: "FACEBOOK_VERIFY_TOKEN",
        label: "Webhook Verify Token",
        type: "password",
        required: true,
        placeholder: "my_secret_token_123",
        help: "Your custom secret string for webhook verification.",
        pattern: "^.{8,}$",
        title: "Mínimo 8 caracteres",
      },
    ],
  },
  {
    id: "instagram",
    label: "Instagram",
    description:
      "Instagram API with Instagram Login (native, no Facebook Page required). The Instagram account must be a professional Business or Creator account. Get these from developers.facebook.com/apps > Instagram > API Setup.",
    fields: [
      {
        key: "INSTAGRAM_APP_SECRET",
        label: "App Secret",
        type: "password",
        required: true,
        placeholder: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        help: "App Settings > Basic > App Secret.",
        pattern: "^[A-Za-z0-9]+$",
        title: "Solo letras y números",
      },
      {
        key: "INSTAGRAM_ACCESS_TOKEN",
        label: "Access Token",
        type: "password",
        required: true,
        placeholder: "IGAAxxxxxxxxxxxxxxxxxxxxx",
        help: "Instagram User access token from Instagram Business Login.",
        pattern: "^[A-Za-z0-9_\\-]+$",
        title: "Solo letras, números, guiones y guiones bajos",
      },
      {
        key: "INSTAGRAM_ACCOUNT_ID",
        label: "Instagram Account ID",
        required: true,
        placeholder: "17841400000000000",
        help: "Instagram professional account id (Graph API).",
        pattern: "^[0-9]+$",
        title: "Solo números",
      },
      {
        key: "INSTAGRAM_VERIFY_TOKEN",
        label: "Webhook Verify Token",
        type: "password",
        required: true,
        placeholder: "my_secret_token_123",
        help: "Your custom secret string for webhook verification.",
        pattern: "^.{8,}$",
        title: "Mínimo 8 caracteres",
      },
    ],
  },
  {
    id: "integrations",
    label: "Integrations",
    description:
      "Hosts the agent may call with http_request (CRM, calendar, Zapier). Comma-separated, no protocol — e.g. api.hubapi.com, hooks.zapier.com.",
    fields: [
      {
        key: "HTTP_ALLOWLIST",
        label: "HTTP allowlist",
        type: "text",
        required: false,
        placeholder: "api.hubapi.com, hooks.zapier.com",
        help: "SSRF-gated. Private IPs, localhost, and non-HTTPS are blocked.",
        pattern: "^([a-zA-Z0-9\\-]+\\.[a-zA-Z0-9\\-.]+)(,\s*[a-zA-Z0-9\\-]+\\.[a-zA-Z0-9\\-.]+)*$",
        title: "Dominios separados por comas, sin protocolo",
      },
      {
        key: "LEAD_WEBHOOK_SECRET",
        label: "Lead webhook secret",
        type: "password",
        required: false,
        placeholder: "my_webhook_secret_123",
        help: "Shared secret for POST /api/leads. Send as x-webhook-secret header. Without this, the endpoint is open.",
        pattern: "^.{8,}$",
        title: "Mínimo 8 caracteres",
      },
    ],
  },
  {
    id: "google-sheets",
    label: "Google Sheets",
    description:
      "Powers the \"Log to Sheets\" automation step. Create a service account at console.cloud.google.com > IAM & Admin > Service Accounts, enable the Sheets API, then share each target spreadsheet with the service account's email (Editor access).",
    fields: [
      {
        key: "GOOGLE_SERVICE_ACCOUNT_JSON",
        label: "Service account key (JSON)",
        type: "password",
        required: true,
        placeholder: '{"type":"service_account","client_email":"…","private_key":"…", …}',
        help: "The full JSON key file downloaded for the service account.",
        pattern: "^\\{[\\s\\S]*\\}$",
        title: "Debe ser el JSON completo de la service account",
      },
    ],
  },
  {
    id: "google-calendar",
    label: "Google Calendar",
    description:
      "Powers the calendar tools (check availability, book events). Uses the same service account as Google Sheets. Enable the Calendar API in your Google Cloud project.",
    fields: [
      {
        key: "GOOGLE_CALENDAR_ID",
        label: "Calendar ID",
        required: true,
        placeholder: "primary",
        help: "The calendar to use. Use 'primary' for the default calendar, or the calendar's email address (e.g. calendar@group.calendar.google.com).",
        pattern: "^[a-zA-Z0-9._@-]+$",
        title: "ID del calendario (primary o email)",
      },
    ],
  },
  {
    id: "oauth-apps",
    label: "Apps OAuth (conexiones)",
    description:
      "Solo para instalaciones propias. Son las credenciales de la aplicación, no de tu cuenta: quien usa Steve se conecta con su cuenta desde Conexiones y nunca ve estos valores. Registrá una app en cada proveedor y pegá el par acá una sola vez. En un despliegue gestionado ya vienen por variables de entorno.",
    fields: [
      {
        key: "GOOGLE_OAUTH_CLIENT_ID",
        label: "Google client ID",
        required: false,
        placeholder: "123456789012-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.apps.googleusercontent.com",
        help: "From console.cloud.google.com > APIs & Services > Credentials. Redirect URI: <your-domain>/api/connections/google/callback",
      },
      {
        key: "GOOGLE_OAUTH_CLIENT_SECRET",
        label: "Google client secret",
        type: "password",
        required: false,
        placeholder: "GOCSPX-xxxxxxxxxxxxxxxxxxxxxxxx",
      },
      {
        key: "HUBSPOT_CLIENT_ID",
        label: "HubSpot client ID",
        required: false,
        placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
        help: "From developers.hubspot.com > Apps > Auth. Redirect URI: <your-domain>/api/connections/hubspot/callback",
      },
      {
        key: "HUBSPOT_CLIENT_SECRET",
        label: "HubSpot client secret",
        type: "password",
        required: false,
        placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
      },
      {
        key: "CALENDLY_CLIENT_ID",
        label: "Calendly client ID",
        required: false,
        placeholder: "AbCdEf0123456789AbCdEf0123456789",
        help: "From developer.calendly.com > My apps. Redirect URI: <your-domain>/api/connections/calendly/callback",
      },
      {
        key: "CALENDLY_CLIENT_SECRET",
        label: "Calendly client secret",
        type: "password",
        required: false,
        placeholder: "AbCdEf0123456789AbCdEf0123456789AbCdEf01",
      },
      {
        key: "SLACK_CLIENT_ID",
        label: "Slack client ID",
        required: false,
        placeholder: "1234567890123.1234567890123",
        help: "From api.slack.com/apps > OAuth & Permissions. Redirect URI: <your-domain>/api/connections/slack/callback",
      },
      {
        key: "SLACK_CLIENT_SECRET",
        label: "Slack client secret",
        type: "password",
        required: false,
        placeholder: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      },
      {
        key: "NOTION_CLIENT_ID",
        label: "Notion client ID",
        required: false,
        placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
        help: "From notion.so/my-integrations (public integration). Redirect URI: <your-domain>/api/connections/notion/callback",
      },
      {
        key: "NOTION_CLIENT_SECRET",
        label: "Notion client secret",
        type: "password",
        required: false,
        placeholder: "secret_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      },
      {
        key: "AIRTABLE_CLIENT_ID",
        label: "Airtable client ID",
        required: false,
        placeholder: "xxxxxxxxxxxxxxxx",
        help: "From airtable.com/create/oauth. Redirect URI: <your-domain>/api/connections/airtable/callback",
      },
      {
        key: "AIRTABLE_CLIENT_SECRET",
        label: "Airtable client secret",
        type: "password",
        required: false,
        placeholder: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      },
    ],
  },
  {
    id: "shopify",
    label: "Shopify",
    description:
      "Deja que el agente responda \"¿dónde está mi pedido?\" mirando los pedidos reales de la tienda. Creá una app privada en tu admin: Configuración > Apps y canales de venta > Desarrollar apps > Crear app, y otorgale los permisos de lectura read_orders y read_customers.",
    fields: [
      {
        key: "SHOPIFY_SHOP_DOMAIN",
        label: "Dominio de la tienda",
        required: true,
        placeholder: "mi-tienda.myshopify.com",
        help: "El dominio .myshopify.com, no el dominio propio. Podés pegar solo el handle (mi-tienda) y se completa solo.",
        pattern: "^(https?://)?[a-zA-Z0-9-]+(\\.myshopify\\.com)?/?$",
        title: "El handle de la tienda o mi-tienda.myshopify.com",
      },
      {
        key: "SHOPIFY_ADMIN_ACCESS_TOKEN",
        label: "Admin API access token",
        type: "password",
        required: true,
        placeholder: "shpat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        help: "Se muestra una sola vez, al instalar la app privada. Solo hacen falta los permisos de lectura read_orders y read_customers.",
        pattern: "^shpat_[A-Za-z0-9]+$",
        title: "Debe empezar con shpat_",
      },
    ],
  },
  {
    id: "mercadopago",
    label: "Mercado Pago",
    description:
      "La otra mitad del paso \"Cobrar\": Checkout Pro para Argentina, Brasil, Chile, Colombia, México, Perú y Uruguay, donde Stripe no llega o no conviene. Sacá el access token de mercadopago.com/developers > Tus integraciones > Credenciales.",
    fields: [
      {
        key: "MERCADOPAGO_ACCESS_TOKEN",
        label: "Access token",
        type: "password",
        required: true,
        placeholder: "APP_USR-xxxxxxxxxxxxxxxx",
        help: "Empieza con TEST- (credenciales de prueba, cobra en sandbox) o APP_USR- (producción, cobra de verdad).",
        pattern: "^(TEST|APP_USR)-.+$",
        title: "Debe empezar con TEST- o APP_USR-",
      },
    ],
  },
  {
    id: "stripe",
    label: "Stripe",
    description:
      "Powers the \"Charge with Stripe\" automation step. Get your secret key from dashboard.stripe.com > Developers > API keys.",
    fields: [
      {
        key: "STRIPE_SECRET_KEY",
        label: "Secret key",
        type: "password",
        required: true,
        placeholder: "sk_••••••••••••••••••••••••••••••",
        help: "Starts with sk_test_ (test mode) or sk_live_ (real charges).",
        pattern: "^sk_(test|live)_.+$",
        title: "Debe empezar con sk_test_ o sk_live_",
      },
      {
        key: "STRIPE_WEBHOOK_SECRET",
        label: "Webhook signing secret",
        type: "password",
        required: false,
        placeholder: "whsec_xxxxxxxxxxxxxxxxxxxxxxxx",
        help: "dashboard.stripe.com > Developers > Webhooks > tu endpoint > Signing secret. Sin esto, /api/billing/webhook rechaza todos los eventos.",
        pattern: "^whsec_.+$",
        title: "Debe empezar con whsec_",
      },
    ],
  },
  {
    id: "elevenlabs",
    label: "Voz (ElevenLabs)",
    description:
      "Genera los audios del agente (paso \"Enviar audio\" y la herramienta generate_media). Sacá la key en elevenlabs.io/app/settings/api-keys. Sin esta key los audios caen al modelo de voz del AI Gateway.",
    fields: [
      {
        key: "ELEVENLABS_API_KEY",
        label: "API Key",
        type: "password",
        required: true,
        placeholder: "sk_xxxxxxxxxxxxxxxxxxxxxxxx",
        help: "elevenlabs.io/app/settings/api-keys. Se cobra por caracteres generados.",
        pattern: "^[A-Za-z0-9_\\-]{20,}$",
        title: "Solo letras, números, guiones y guiones bajos (mínimo 20 caracteres)",
      },
      {
        key: "ELEVENLABS_VOICE_ID",
        label: "Voice ID",
        required: false,
        placeholder: "JBFqnCBsd6RMkjVDRZzb",
        help: "El id de la voz en elevenlabs.io/app/voice-library. Por defecto: George (JBFqnCBsd6RMkjVDRZzb).",
        pattern: "^[A-Za-z0-9]+$",
        title: "Solo letras y números",
      },
      {
        key: "ELEVENLABS_MODEL_ID",
        label: "Modelo de voz",
        type: "select",
        required: false,
        options: [
          { value: "eleven_multilingual_v2", label: "Multilingual v2 — calidad alta, 29 idiomas (US$0,10/1K)" },
          { value: "eleven_v3", label: "v3 — máxima expresividad, 70+ idiomas (US$0,10/1K)" },
          { value: "eleven_v3_conversational", label: "v3 Conversational — expresivo y de baja latencia (US$0,05/1K)" },
          { value: "eleven_flash_v2_5", label: "Flash v2.5 — el más rápido y barato, 32 idiomas (US$0,05/1K)" },
          { value: "eleven_turbo_v2_5", label: "Turbo v2.5 — equilibrio calidad/latencia (US$0,05/1K)" },
        ],
        help: "Precio por cada 1.000 caracteres generados. Por defecto: Multilingual v2.",
      },
      {
        key: "ELEVENLABS_WEBHOOK_SECRET",
        label: "Webhook signing secret",
        type: "password",
        required: false,
        placeholder: "wsec_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        help: "elevenlabs.io/app/agents/settings > Post-Call Webhook. Apuntalo a /api/webhooks/elevenlabs en este host y pegá acá el secret que te da. Sin esto no se guardan las transcripciones de llamadas.",
      },
    ],
  },
  {
    id: "twilio",
    label: "Teléfono (Twilio)",
    description:
      "El número por el que tus agentes atienden y llaman. Se importa a ElevenLabs desde Mis Agentes > Voz; acá solo van las credenciales. Sacalas de console.twilio.com > Account Info.",
    fields: [
      {
        key: "TWILIO_ACCOUNT_SID",
        label: "Account SID",
        required: true,
        placeholder: "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        help: "Empieza con AC. console.twilio.com > Account Info.",
        pattern: "^AC[a-zA-Z0-9]{32}$",
        title: "Debe empezar con AC y tener 34 caracteres",
      },
      {
        key: "TWILIO_AUTH_TOKEN",
        label: "Auth Token",
        type: "password",
        required: true,
        placeholder: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        help: "El token de la misma pantalla. ElevenLabs lo guarda para poder atender el número.",
        pattern: "^[a-zA-Z0-9]{20,}$",
        title: "Solo letras y números, mínimo 20 caracteres",
      },
      {
        key: "TWILIO_PHONE_NUMBER",
        label: "Número",
        required: true,
        placeholder: "+541155550000",
        help: "En formato E.164, con + y código de país. Tiene que ser un número comprado en Twilio (o un Verified Caller ID, que solo sirve para llamadas salientes).",
        pattern: "^\\+[1-9][0-9]{7,14}$",
        title: "Formato E.164: + y entre 8 y 15 dígitos",
      },
    ],
  },
  {
    id: "smtp",
    label: "Email (SMTP)",
    description:
      "Powers the \"Notify by email\" automation step. Configure your SMTP server to send emails from the agent.",
    fields: [
      {
        key: "SMTP_HOST",
        label: "SMTP Host",
        required: true,
        placeholder: "smtp.gmail.com",
        help: "Your SMTP server hostname.",
        pattern: "^[a-zA-Z0-9._-]+$",
        title: "Hostname del servidor SMTP",
      },
      {
        key: "SMTP_PORT",
        label: "SMTP Port",
        required: false,
        placeholder: "587",
        help: "SMTP port (587 for TLS, 465 for SSL). Default: 587.",
        pattern: "^[0-9]+$",
        title: "Puerto SMTP",
      },
      {
        key: "SMTP_USER",
        label: "SMTP Username",
        required: true,
        placeholder: "you@gmail.com",
        help: "Your SMTP username (often your email address).",
        pattern: "^.+$",
        title: "Usuario SMTP",
      },
      {
        key: "SMTP_PASS",
        label: "SMTP Password",
        type: "password",
        required: true,
        placeholder: "your-app-password",
        help: "Your SMTP password or app-specific password.",
        pattern: "^.+$",
        title: "Contraseña SMTP",
      },
      {
        key: "SMTP_FROM",
        label: "From Email",
        required: false,
        placeholder: "agent@yourdomain.com",
        help: "The sender email address. Defaults to SMTP_USER if not set.",
        pattern: "^.+@.+\\..+$",
        title: "Email del remitente",
      },
    ],
  },
  {
    id: "resend",
    label: "Resend",
    description:
      "Proveedor de email transaccional. Enviá emails transaccionales y de marketing con tu propia API key de Resend.",
    fields: [
      {
        key: "RESEND_API_KEY",
        label: "API Key",
        type: "password",
        required: true,
        placeholder: "re_xxxxxxxxxxxxxxxx",
        help: "resend.com/api-keys — creá una key para enviar emails.",
        pattern: "^re_[A-Za-z0-9]+$",
        title: "API key de Resend (empieza con re_)",
      },
      {
        key: "RESEND_FROM_EMAIL",
        label: "Email remitente",
        required: false,
        placeholder: "notificaciones@tudominio.com",
        help: "Email que aparece como 'de' en los correos. Debe estar en un dominio verificado en Resend.",
        pattern: "^.+@.+\\..+$",
        title: "Email válido",
      },
    ],
  },
  {
    id: "meta-ads",
    label: "Meta Ads",
    description:
      "Meta Marketing API for campaigns, ad sets, and lead forms. Get these from developers.facebook.com/apps > Marketing API > Access Tokens.",
    fields: [
      {
        key: "META_ACCESS_TOKEN",
        label: "Access Token",
        type: "password",
        required: true,
        placeholder: "EAAxxxxxxxxxxxxxxxxxxxxx",
        help: "Permanent System User Token with ads_read and leads_retrieval permissions.",
        pattern: "^[A-Za-z0-9_\\-]+$",
        title: "Solo letras, números, guiones y guiones bajos",
      },
      {
        key: "META_AD_ACCOUNT_ID",
        label: "Ad Account ID",
        required: true,
        placeholder: "1234567890123456",
        help: "Your Meta ad account ID (without the act_ prefix). Found in Ads Manager > Account Settings.",
        pattern: "^[0-9]{10,20}$",
        title: "Solo números, entre 10 y 20 dígitos",
      },
    ],
  },
  {
    id: "database",
    label: "Base de datos",
    description:
      "PostgreSQL guarda el estado durable del agente (sesiones, colas, recordatorios programados). Es la única base que usa el proyecto — no hay Redis. `pnpm db:up` la levanta con Docker en el puerto 5544. Cambiar estos valores requiere reiniciar el agente.",
    fields: [
      {
        key: "WORKFLOW_POSTGRES_URL",
        label: "URL de conexión",
        type: "password",
        required: true,
        placeholder: "postgres://world:password@127.0.0.1:5544/world",
        help: "La que usa el runtime. Si la contraseña tiene caracteres especiales, codificalos (%40 para @).",
        pattern: "^postgres(ql)?://.+$",
        title: "Debe empezar con postgres:// o postgresql://",
      },
      {
        key: "POSTGRES_USER",
        label: "Usuario",
        required: false,
        placeholder: "world",
        help: "Usuario del contenedor Docker. Debe coincidir con el de la URL.",
        pattern: "^[A-Za-z0-9_-]+$",
        title: "Letras, números, guiones y guiones bajos",
      },
      {
        key: "POSTGRES_PASSWORD",
        label: "Contraseña",
        type: "password",
        required: false,
        placeholder: "a-long-random-password",
        help: "Debe ser idéntica a la contraseña dentro de la URL de conexión.",
        pattern: "^.{8,}$",
        title: "Mínimo 8 caracteres",
      },
      {
        key: "POSTGRES_DB",
        label: "Base",
        required: false,
        placeholder: "world",
        pattern: "^[A-Za-z0-9_-]+$",
        title: "Letras, números, guiones y guiones bajos",
      },
      {
        key: "POSTGRES_HOST_PORT",
        label: "Puerto en el host",
        required: false,
        placeholder: "5544",
        help: "5544 y no 5432, para no chocar con otro Postgres local.",
        pattern: "^[0-9]{2,5}$",
        title: "Solo números",
      },
    ],
  },
];

async function readStore(): Promise<CredentialStore> {
  try {
    const raw = await readFile(CREDENTIALS_FILE, "utf-8");
    return JSON.parse(raw) as CredentialStore;
  } catch {
    return {};
  }
}

async function writeStore(store: CredentialStore): Promise<void> {
  await mkdir(dirname(CREDENTIALS_FILE), { recursive: true });
  const tmp = `${CREDENTIALS_FILE}.tmp`;
  await writeFile(tmp, JSON.stringify(store, null, 2) + "\n", "utf-8");
  await rename(tmp, CREDENTIALS_FILE);
  // Invalidate the sync cache so the next sync read picks up the change.
  cachedStore = store;
}

// Serializes read-modify-write cycles so two concurrent saveCredentials()
// calls can't race: without this, both could read the same pre-update
// store, and whichever write lands second would silently discard the
// other's changes (including keys neither call touched).
let writeQueue: Promise<void> = Promise.resolve();

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(fn, fn);
  writeQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/**
 * Synchronous credential reader for channel modules. Uses the in-memory
 * cache loaded from disk on first access, then falls back to env vars.
 * Safe to call during Eve's synchronous discovery phase.
 */
export function getCredentialSync(key: CredentialKey): string | undefined {
  const store = loadCacheSync();
  return store[key] ?? process.env[key];
}

/**
 * Get a single credential value. Falls back to the environment variable
 * if the key is not present in the store.
 */
export async function getCredential(key: CredentialKey): Promise<string | undefined> {
  const store = await readStore();
  return store[key] ?? process.env[key];
}

/**
 * Get all credential values as a record. Falls back to env vars.
 */
export async function getAllCredentials(): Promise<CredentialStore> {
  const store = await readStore();
  const merged: CredentialStore = {};
  for (const group of CREDENTIAL_GROUPS) {
    for (const field of group.fields) {
      merged[field.key] = store[field.key] ?? process.env[field.key];
    }
  }
  return merged;
}

/**
 * Merge updates into the store and persist to disk.
 * Only non-empty values are written; empty strings remove the key.
 */
export async function saveCredentials(updates: CredentialStore): Promise<void> {
  await enqueue(async () => {
    const store = await readStore();
    for (const [key, value] of Object.entries(updates)) {
      if (value === undefined || value === "") {
        delete store[key as CredentialKey];
      } else {
        store[key as CredentialKey] = value;
      }
    }
    await writeStore(store);
  });
}

/**
 * Return only the values explicitly saved via the UI (no env var fallback),
 * so the settings form can be prefilled with exactly what "Configurado"
 * refers to — nothing more.
 */
export async function getStoredCredentials(): Promise<CredentialStore> {
  return await readStore();
}

/**
 * Where a credential's active value came from, per key. Absent means nothing
 * is set anywhere.
 *
 * The distinction matters to the UI, not just to billing: a value that only
 * exists as an environment variable is real and working, but it cannot be
 * cleared from this app and its secret is not ours to echo back. Settings
 * needs to say "configured, from the environment" rather than either lying
 * about it being unset or offering a Clear button that would do nothing.
 */
export async function getCredentialSources(): Promise<Record<string, "store" | "env">> {
  const store = await readStore();
  const sources: Record<string, "store" | "env"> = {};
  for (const group of CREDENTIAL_GROUPS) {
    for (const field of group.fields) {
      if (store[field.key]) sources[field.key] = "store";
      else if (process.env[field.key]) sources[field.key] = "env";
    }
  }
  return sources;
}

/**
 * Return a masked view of all credentials for the API: each key maps to
 * a boolean indicating whether a non-empty value exists in the store
 * (not from environment variables).
 *
 * Deliberately store-only: `lib/credit-gate.ts` reads the same distinction to
 * decide who pays for a model call, so widening this to the environment would
 * silently move billing. The UI gets the fuller picture from
 * `getCredentialSources` instead.
 */
export async function getMaskedCredentials(): Promise<Record<string, boolean>> {
  const store = await readStore();
  const masked: Record<string, boolean> = {};
  for (const group of CREDENTIAL_GROUPS) {
    for (const field of group.fields) {
      masked[field.key] = Boolean(store[field.key] && store[field.key]!.length > 0);
    }
  }
  return masked;
}

const PASSWORD_KEYS: ReadonlySet<CredentialKey> = new Set(
  CREDENTIAL_GROUPS.flatMap((group) =>
    group.fields.filter((field) => field.type === "password").map((field) => field.key),
  ),
);

/** True for every field the Settings form renders as a secret (API keys,
 *  tokens, OAuth client secrets, SMTP password, …) — the set the API never
 *  echoes a full value back for. */
export function isPasswordCredential(key: CredentialKey): boolean {
  return PASSWORD_KEYS.has(key);
}

/**
 * A short, non-reversible preview of a secret explicitly saved through the
 * UI — `"sk-ant-…wXyz"`, never the full value. Only covers password-type
 * fields, and only ones with a value on disk: an env-only value has nothing
 * to preview and stays fully hidden, same as `getStoredCredentials` already
 * treats it. Used to give the Settings/Connections forms something to show
 * in a field's placeholder without ever sending the real value back to the
 * browser — see GET /api/settings.
 */
export async function getCredentialPreviews(): Promise<Partial<Record<CredentialKey, string>>> {
  const store = await readStore();
  const previews: Partial<Record<CredentialKey, string>> = {};
  for (const key of PASSWORD_KEYS) {
    // Environment-provided secrets get a preview too. They are just as
    // configured as a stored one, and without this the field reads as empty
    // on an install that sets its keys through .env or the container runtime.
    const value = store[key] ?? process.env[key];
    if (!value) continue;
    previews[key] = value.length <= 8 ? "•".repeat(value.length) : `${value.slice(0, 3)}…${value.slice(-4)}`;
  }
  return previews;
}
