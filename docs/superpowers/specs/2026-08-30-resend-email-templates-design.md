# Resend Integration + Email Templates

**Date**: 2026-08-30  
**Status**: Approved  
**Scope**: New integration (Resend), email template system, visual editor

---

## 1. Overview

Add Resend as an email sending provider alongside existing SMTP, plus a visual email template editor inside Steve. Users can:

- Send transactional emails (lead notifications, reminders, invoices)
- Send marketing emails (newsletters)
- Create custom email templates via a code editor with live preview
- Use built-in templates as starting points

---

## 2. Resend Integration

### 2.1 Credentials

New keys in `lib/credentials.ts`:

```ts
| "RESEND_API_KEY"
| "RESEND_FROM_EMAIL"
```

New group `resend` in Settings:
- `RESEND_API_KEY` — password field
- `RESEND_FROM_EMAIL` — email field (default "from" address)

### 2.2 Connection

Add to `MANUAL_CONNECTIONS` in `lib/connections.ts`:

```ts
{
  id: "resend",
  kind: "api_key",
  label: "Resend",
  descriptionKey: "connections.resend.description",
  reasonKey: "connections.resend.reason",
  settingsGroup: "resend",
  credentialKeys: ["RESEND_API_KEY", "RESEND_FROM_EMAIL"],
  previewKey: "RESEND_API_KEY",
}
```

### 2.3 Sending Logic

New file `lib/resend.ts`:

```ts
import { Resend } from "resend";
import { getCredential } from "./credentials";

export type ResendEmailOptions = {
  from: string;
  to: string;
  subject: string;
  react?: React.ReactNode;
  html?: string;
};

export async function sendResendEmail(
  options: ResendEmailOptions
): Promise<{ success: boolean; error?: string }> {
  const apiKey = await getCredential("RESEND_API_KEY");
  if (!apiKey) {
    return { success: false, error: "RESEND_API_KEY not configured" };
  }
  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: options.from,
    to: options.to,
    subject: options.subject,
    react: options.react,
    html: options.html,
  });
  if (error) return { success: false, error: error.message };
  return { success: true };
}
```

### 2.4 Fallback

Agent email logic: if `RESEND_API_KEY` exists → use Resend; else → fall back to SMTP (`lib/email.ts`).

---

## 3. Email Templates

### 3.1 Built-in Templates

Location: `components/email-templates/`

Each template is a React Email component:

```
components/email-templates/
  welcome.tsx
  lead-notification.tsx
  reminder.tsx
  newsletter.tsx
  invoice.tsx
  index.ts          # registry of all built-in templates
```

Template signature:

```tsx
export default function WelcomeTemplate({
  firstName,
  companyName,
}: {
  firstName: string;
  companyName?: string;
}) {
  return (
    <Html>
      <Head />
      <Body style={main}>
        <Container style={container}>
          <Text>Hola {firstName},</Text>
          <Text>Bienvenido a {companyName ?? "nuestra plataforma"}.</Text>
        </Container>
      </Body>
    </Html>
  );
}
```

### 3.2 Custom Templates

Location: `~/.steve/email-templates/`

- Created/edited from the visual editor
- Stored as `.tsx` files
- Same structure as built-in but with `source: "custom"` metadata

### 3.3 Template Registry

New file `lib/email-templates.ts`:

```ts
export type EmailTemplateMeta = {
  id: string;
  label: string;
  description: string;
  variables: string[];
  source: "builtin" | "custom";
};

export async function listTemplates(): Promise<EmailTemplateMeta[]>;
export async function getTemplateSource(id: string): Promise<string>;
export async function saveCustomTemplate(
  id: string,
  source: string
): Promise<void>;
export async function deleteCustomTemplate(id: string): Promise<void>;
```

---

## 4. Visual Editor

### 4.1 Route

`/email-templates` — standalone page (not under Settings).

### 4.2 Layout

```
┌─────────────────────────────────────────────────────┐
│  Email Templates                    [New Template]  │
├──────────┬──────────────────────┬───────────────────┤
│ Templates│  Code Editor         │  Live Preview     │
│ ──────── │  (Monaco)            │  (iframe)         │
│ □ Welcome│  ┌─────────────────┐ │  ┌─────────────┐ │
│ □ Lead   │  │ export default  │ │  │             │ │
│ □ Reminder│ │ function...     │ │  │  Preview    │ │
│ □ Custom │  │                 │ │  │  del email  │ │
│          │  └─────────────────┘ │  │             │ │
│          │  Variables:          │  └─────────────┘ │
│          │  [firstName] [email] │                   │
├──────────┴──────────────────────┴───────────────────┤
│  [Send Test]  From: ___________  To: ___________    │
└─────────────────────────────────────────────────────┘
```

### 4.3 Components

| Component | Path | Purpose |
|-----------|------|---------|
| Page | `app/(app)/email-templates/page.tsx` | Main page |
| TemplatePanel | `components/email-editor/template-panel.tsx` | Left sidebar — list templates |
| CodeEditor | `components/email-editor/code-editor.tsx` | Monaco editor with JSX syntax |
| PreviewPane | `components/email-editor/preview-pane.tsx` | iframe rendering live HTML |
| VariableInspector | `components/email-editor/variable-inspector.tsx` | Inputs to test variables |
| TestSend | `components/email-editor/test-send.tsx` | Send test email form |

### 4.4 API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/email-templates` | GET | List all templates (builtin + custom) |
| `/api/email-templates/[id]` | GET | Get template source code |
| `/api/email-templates/[id]` | PUT | Save custom template |
| `/api/email-templates` | POST | Create new custom template |
| `/api/email-templates/[id]` | DELETE | Delete custom template |
| `/api/email-templates/[id]/preview` | POST | Render JSX to HTML |
| `/api/email-templates/[id]/test` | POST | Send test email |

### 4.5 Preview Rendering

`/api/email-templates/[id]/preview`:
1. Receives JSX source + variable values
2. Dynamically compiles the JSX (using `new Function()` or a sandboxed eval)
3. Renders with `renderToStaticMarkup` from React Email
4. Returns HTML string

**Security**: Only builtin templates and custom templates from `~/.steve/email-templates/` are accepted. No arbitrary code execution beyond template rendering.

---

## 5. Agent Integration

### 5.1 Automation Step

New step type `send_email` in the automation engine:

```json
{
  "step": "send_email",
  "template": "lead-notification",
  "to": "{{contact.email}}",
  "from": "notificaciones@midominio.com",
  "variables": {
    "firstName": "{{contact.name}}",
    "leadSource": "{{lead.source}}"
  }
}
```

### 5.2 Execution Flow

1. Resolve template by id (builtin or custom)
2. Inject variables from automation context
3. Render to HTML via React Email
4. Send via Resend (or SMTP fallback)

---

## 6. i18n Keys

### Spanish (default)

```ts
"connections.resend.description": "Tu propia clave de Resend para enviar emails transaccionales y marketing.",
"connections.resend.reason": "Resend se autentica con una API key, sin OAuth de usuario.",
"settings.group.resend": "Resend",
"settings.group.resendDesc": "Proveedor de email transaccional. Necesitás una API key de resend.com.",
"settings.field.resendApiKey": "API Key de Resend",
"settings.help.resendApiKey": "resend.com/api-keys — crea una key para enviar emails.",
"settings.field.resendFromEmail": "Email remitente por defecto",
"settings.help.resendFromEmail": "Email que aparece como 'de' en los correos enviados. Debe estar en un dominio verificado en Resend.",
"emailTemplates.title": "Plantillas de Email",
"emailTemplates.newTemplate": "Nueva Plantilla",
"emailTemplates.builtin": "Plantillas base",
"emailTemplates.custom": "Mis plantillas",
"emailTemplates.preview": "Vista previa",
"emailTemplates.sendTest": "Enviar prueba",
"emailTemplates.variables": "Variables",
"emailTemplates.noTemplate": "Elegí una plantilla del panel izquierdo",
```

### English

```ts
"connections.resend.description": "Your own Resend key for transactional and marketing emails.",
"connections.resend.reason": "Resend authenticates with an API key, no user OAuth.",
"settings.group.resend": "Resend",
"settings.group.resendDesc": "Transactional email provider. You need an API key from resend.com.",
"settings.field.resendApiKey": "Resend API Key",
"settings.help.resendApiKey": "resend.com/api-keys — create a key to send emails.",
"settings.field.resendFromEmail": "Default sender email",
"settings.help.resendFromEmail": "Email shown as 'from' in sent emails. Must be on a domain verified in Resend.",
"emailTemplates.title": "Email Templates",
"emailTemplates.newTemplate": "New Template",
"emailTemplates.builtin": "Built-in templates",
"emailTemplates.custom": "My templates",
"emailTemplates.preview": "Preview",
"emailTemplates.sendTest": "Send test",
"emailTemplates.variables": "Variables",
"emailTemplates.noTemplate": "Pick a template from the left panel",
```

---

## 7. Files to Create/Modify

### New Files

| File | Purpose |
|------|---------|
| `lib/resend.ts` | Resend sending logic |
| `lib/email-templates.ts` | Template registry + CRUD |
| `components/email-templates/*.tsx` | 5 built-in templates |
| `components/email-templates/index.ts` | Template registry |
| `components/email-editor/template-panel.tsx` | Template list sidebar |
| `components/email-editor/code-editor.tsx` | Monaco code editor |
| `components/email-editor/preview-pane.tsx` | Live preview iframe |
| `components/email-editor/variable-inspector.tsx` | Variable inputs |
| `components/email-editor/test-send.tsx` | Test email form |
| `app/(app)/email-templates/page.tsx` | Editor page |
| `app/api/email-templates/route.ts` | List/create templates |
| `app/api/email-templates/[id]/route.ts` | Get/save/delete template |
| `app/api/email-templates/[id]/preview/route.ts` | Render preview |
| `app/api/email-templates/[id]/test/route.ts` | Send test email |

### Modified Files

| File | Change |
|------|--------|
| `lib/credentials.ts` | Add `RESEND_API_KEY`, `RESEND_FROM_EMAIL` to CredentialKey |
| `lib/connections.ts` | Add `resend` to ManualConnectionId + MANUAL_CONNECTIONS |
| `lib/settings-i18n.ts` | Add FIELD_I18N + VALIDATION_ERROR_KEYS for Resend fields |
| `lib/i18n/dictionaries.ts` | Add i18n keys (es + en) |
| `app/(app)/settings/page.tsx` | Add `resend` group to GROUP_I18N + GROUP_ICONS |
| `app/(app)/connections/page.tsx` | Add ResendBrandIcon to BRAND_ICONS |
| `components/icons/connection-icons.tsx` | Add ResendBrandIcon (SVG provided by user) |
| `package.json` | Add `resend`, `@react-email/render`, `monaco-editor` deps |

---

## 8. Dependencies

```json
{
  "resend": "^4.0.0",
  "@react-email/render": "^1.0.0",
  "react-email": "^3.0.0",
  "@monaco-editor/react": "^4.6.0"
}
```

---

## 9. Testing

- Unit: `lib/resend.ts` (mock Resend SDK)
- Unit: `lib/email-templates.ts` (list/get/save/delete)
- Integration: `/api/email-templates` endpoints
- E2E: Editor page — load template, edit code, see preview update, send test

---

## 10. Out of Scope

- WYSIWYG drag-and-drop email builder
- Email analytics (open rates, click tracking)
- Template versioning / history
- A/B testing of email templates
- Unsubscribe management

---

## 11. Implementation notes

Where the built thing differs from the design above, and why.

### Preview rendering (§4.5)

The design left "compiles the JSX" open. `lib/email-render.ts` does it with
`ts.transpileModule` (no type-check — a template still previews while you're
mid-edit), then evaluates the CommonJS output in a fresh `node:vm` context
whose module map holds only `react`, `react/jsx-runtime` and
`@react-email/components`. Anything else throws by name, so `node:fs` is not
reachable rather than merely discouraged. Evaluation and render each carry a
wall-clock budget, and compiled components are cached by exact source.

Built-in templates skip all of that: they're modules in this bundle, so they
are imported and rendered directly. Their `.tsx` is read from disk only to be
*shown* in the editor, never to be run.

This made `typescript` a runtime dependency rather than a dev one.

### Template metadata

Each template declares a `subject` (with `{{variable}}` placeholders) and a
`sample` — one realistic value per variable. Without samples the preview opened
on a page of blanks and a test send was not worth reading. For custom
templates the variable list is parsed out of the source on every save, so it
can't drift from the props the component actually destructures.

### Test send (§4.4)

Sends the real rendered email — same render, subject and provider an
automation would use. The first cut mailed the template's own source in a
`<pre>`, which proved nothing.

### Agent integration (§5)

There was already a `notify_email` step, so it was fixed rather than joined by
a second one: it gained `emailTo`, `emailSubject` and `emailTemplate` config
(it used to borrow `phone` for the recipient and send `message` as both
subject and body), a step editor, and a route through `lib/email-send.ts` —
the one place that picks Resend when its key is set and SMTP otherwise.
Automations saved before this still work: the runner reads `phone` when
`emailTo` is unset.

### UI (§4.2)

Built as a workspace in the same language as the automation canvas — toolbar,
left rail, resizable dock with Preview / Variables / Test — rather than as
cards inside a scrolling page. Built-ins are read-only with a Duplicate
action, since editing one had nowhere to save.
