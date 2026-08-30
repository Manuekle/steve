# Modelo comercial y licencia Enterprise

Referencia de arquitectura para el modelo comercial de steve: SaaS hospedado
(Pro/Managed) + licencia Enterprise perpetua self-hosted. Escrito después de
auditar el repo tal como está — no asume nada que el código no confirme.

## 1–2. Diagnóstico: qué está bien, qué faltaba

**Ya resuelto antes de este trabajo**, verificado en el código:

- `README.md` ya declara la separación de negocio: este repositorio completo
  es lo que se vende como **Enterprise** — código fuente, instalación vía
  Ansible (`deploy/`), dos servicios `systemd` (`steve` = eve, `steve-web` =
  Next), Caddy delante. **Pro** y **Managed** son el mismo código operado por
  el vendor en infraestructura multi-tenant que *no vive en este repo* — eso
  es responsabilidad de un control plane hospedado separado.
- Mono-tenant por diseño: `lib/auth/store.ts` es un owner único (scrypt +
  sesión), `lib/business-store.ts` y `lib/credentials.ts` son un JSON por
  instalación en `~/.steve/`. No hay concepto de organización ni tenant en
  ningún lado — coherente con "una instalación = un negocio", tanto para un
  cliente Enterprise como para una instancia Pro/Managed detrás del control
  plane hospedado.
- `app/pricing`, `app/landing` y `lib/i18n/dictionaries.ts` ya tenían Pro
  $49/mes, Managed $199/mes, Enterprise $9990 pago único, con la sección
  "Vos elegís quién lo aloja" en la landing.

**Lo que faltaba, y lo que este trabajo agrega:**

- Ningún mecanismo de licencia — cero código antes de `lib/license/`. La
  palabra "licencia" solo existía en prosa.
- Sin separación explícita licencia perpetua / mantenimiento en el copy legal
  ni en pricing.
- Sin cláusula de restricciones (no reventa/sublicencia/redistribución/
  white-label/SaaS de terceros) en ningún lado.
- `/guide` no aclaraba que Pro/Managed no necesitan instalar nada.
- La distribución de Enterprise es hoy código fuente completo vía git — sin
  alternativa de imagen Docker que permita no entregarlo (ver §9).

## 3. Riesgos técnicos identificados

- **Ninguno de bloqueo de uso**: el diseño elegido (`lib/license/verify.ts`)
  nunca hace red, nunca convierte un vencimiento en un corte de servicio. El
  riesgo que sí existe es el inverso — que a futuro alguien agregue una
  verificación online "para simplificar" y rompa la promesa offline-first.
  Cualquier cambio a `verify.ts` debería mantener la regla: la firma es lo
  único que decide `status`, `maintenanceUntil` es puramente informativo.
- **Clave privada**: si se filtra, cualquiera puede emitir licencias válidas.
  Vive fuera del repo (ver `scripts/license/README.md`); rotarla agrega un
  nuevo `keyId` a `lib/license/keys.ts` sin invalidar licencias ya emitidas
  con la clave anterior.
- **Distribución actual = fuente completo**: mientras Enterprise se entregue
  como `git clone` de este repo, la protección real depende del contrato
  legal (la cláusula nueva en Términos), no del código. La licencia disuade y
  documenta el uso permitido; no impide técnicamente correr una copia del
  fuente sin ella. Eso es habitual en software comercial self-hosted
  (no es un DRM) y es coherente con "no bloquees la ejecución" — un
  verificador que sí pudiera bloquear el uso del software violaría
  exactamente la promesa offline-first que se pidió.

## 4–5. Vercel/Steve Cloud vs. self-hosted

Nada de lo agregado acopla a Vercel. `lib/license/*` usa únicamente
`node:crypto` y el sistema de archivos — corre igual en Vercel, en un droplet
Ansible, o en un contenedor. Lo que ya estaba acoplado a Vercel (`VERCEL_URL`
como fallback de `SITE_URL` en `lib/site.ts`, el AI Gateway como proveedor
por defecto) sigue siendo opcional: un self-hosted que no usa Vercel para
nada configura `NEXT_PUBLIC_SITE_URL` y una clave de proveedor directa, como
ya documentaba el README antes de este trabajo.

## 6. Qué ya funciona 100% self-hosted

Todo el runtime: Next.js, PostgreSQL (Workflow world), Docker sandbox,
OpenTelemetry, los cuatro canales, knowledge base/RAG, automatizaciones,
Meta Ads. Confirmado por `README.md`, `docker-compose.yml` y
`node_modules/eve/docs/guides/deployment.md` (eve corre igual "on Vercel, on
Vercel, and on a long-running Node host").

## 7. Arquitectura del sistema de licencia

Firma **Ed25519** (`node:crypto`, sin dependencias nuevas). Token de tres
partes en base64url: `<keyId>.<payload>.<firma>` — el mismo formato que un
JWS compacto sin header, porque hay un solo algoritmo.

**Firmado, no encriptado — deliberado.** La firma es lo que da la propiedad
que importa acá: nadie puede alterar o inventar una licencia válida sin la
clave privada. Encriptar el payload además de eso no agregaría seguridad
real en un sistema que se verifica del lado del cliente — la clave para
desencriptar tendría que viajar embebida en la app para que la app la lea,
así que cualquiera con el binario también tiene la clave. Sería ofuscación,
no protección, y vendería una garantía que no existe.

```ts
type LicensePayload = {
  licenseId: string;
  company: string;
  customerEmail: string;
  edition: string;             // "enterprise" hoy; "partner-oem" el día que exista
  deploymentType: "self-hosted";
  features: string[];          // abre la puerta a gating futuro sin tocar el verificador
  issuedAt: string;            // ISO
  maintenanceUntil: string;    // ISO — informativo, nunca bloquea
  installationId?: string;     // qué instalación pidió esta licencia — también informativo, ver más abajo
  schemaVersion: 1;
};
```

**Regla dura**: `deriveLicenseInfo()` en `lib/license/verify.ts` nunca hace
`fetch`. `maintenanceUntil` vencido produce `maintenanceActive: false` pero
`status` sigue siendo `"valid"` si la firma verifica. Solo una firma
inválida, un token corrupto, o la ausencia de token cambian `status` a algo
distinto de `"valid"` — y ninguno de esos casos impide que la aplicación
arranque o funcione; solo cambia lo que se muestra en Settings. La misma
regla aplica a `installationId`: un desacuerdo cambia `installationMatches`
a `false`, nunca `status` — ver "Licencia única por instalación" más abajo.

Archivos:

- `lib/license/types.ts` — tipos.
- `lib/license/keys.ts` — claves **públicas** embebidas, por `keyId` (permite
  rotación sin invalidar licencias viejas).
- `lib/license/verify.ts` — `parseLicense`, `verifyLicense`,
  `deriveLicenseInfo`, `signLicense`. Puras, sin fs ni red.
- `lib/license/installation.ts` — el id de esta instalación
  (`~/.steve/installation-id`, UUID generado una vez en el primer arranque y
  persistido). Separado de `verify.ts` a propósito: el verificador no toca
  el filesystem, y esto sí.
- `lib/license/store.ts` — lee/escribe `~/.steve/license.key`, con fallback a
  `STEVE_LICENSE_KEY`, mismo patrón que `lib/credentials.ts`. Le pasa el
  installation id local a `deriveLicenseInfo()`.
- `lib/license/verify.test.ts` — roundtrip, tamper detection, mantenimiento
  vencido sigue siendo `valid`, y los tres casos de binding de instalación
  (coincide / no coincide / licencia sin atar).
- `scripts/license/issue-license.mjs` + `scripts/license/README.md` — emisor
  del lado del vendor. Nunca corre en la instalación del cliente; necesita la
  clave **privada**, que nunca está en este repo.

### Licencia única por instalación

Pedido explícito: que una licencia no sea un archivo que se pueda copiar a
cualquier servidor sin que quede rastro. La firma por sí sola no resuelve
esto — prueba que el token es auténtico, no que corre donde se emitió.

**Diseño elegido**: binding por id de instalación, no por hardware. Un
fingerprint de hardware se rompe con cualquier migración de VM, rebuild de
contenedor, o clonado de disco — ninguno de esos casos debería invalidar una
licencia perpetua. En cambio, `~/.steve/installation-id` es un UUID al azar,
generado la primera vez que algo lo pide y persistido después — estable
mientras la instalación exista, distinto si se reinstala desde cero.

**Por qué esto no rompe offline-first**: el intercambio es un solo mensaje
manual (el cliente copia su id desde Settings y se lo manda a Steve), no un
phone-home continuo. Una vez emitida, la licencia se verifica exactamente
igual que antes — sin red. Y un desacuerdo entre `installationId` y el id
local **nunca bloquea nada**: cambia `installationMatches` a `false`, que la
UI muestra como una nota amarilla, no como un error. Esto es deliberado —
hard-block por mismatch violaría la misma garantía que `maintenanceUntil`
ya protege, por ejemplo cuando un cliente legítimamente restaura la app en
un servidor nuevo tras una falla de hardware. El valor real de esto es
detectar copias, no impedirlas — la cláusula de Términos sigue siendo lo que
hace la reventa/redistribución un incumplimiento contractual, esto es la
señal técnica que lo hace visible.

## 8. Flujo de activación

1. El cliente instala steve (o lo recibe ya instalado) y abre **Settings ›
   Licencia Enterprise**, que ya muestra su `installationId` — no hace falta
   tener una licencia todavía para generarlo.
2. Se lo manda a Steve. Steve emite el token con `issue-license.mjs
   --installation-id <ese id>` (clave privada fuera del repo).
3. El cliente pega el token en la misma card
   (`components/ai-elements/license-card.tsx`).
4. `POST /api/license` verifica la firma offline contra
   `lib/license/keys.ts` y solo persiste si es válida
   (`lib/license/store.ts#saveLicenseToken`).
5. `GET /api/license` devuelve el estado (incluido `installationMatches`)
   para que la UI lo muestre — nunca para decidir si algo funciona.

Alternativa sin UI: `STEVE_LICENSE_KEY` en el entorno del proceso (útil para
una instalación provisionada por Ansible/systemd sin pasar por el navegador).

## 9. Flujo de "actualización" y separación licencia/mantenimiento

- **Licencia** = derecho perpetuo a correr la versión adquirida. No caduca,
  no se revalida contra ningún servidor.
- **Mantenimiento** = `maintenanceUntil`. Mientras esté vigente, da derecho a
  versiones nuevas y soporte. Vencido, la instalación sigue funcionando
  exactamente igual — solo se pierde el acceso a versiones futuras hasta
  renovar.
- Esto no está automatizado todavía (no hay un endpoint de "última versión
  disponible" ni un mecanismo de descarga), a propósito: el pedido no exigía
  construirlo ahora, solo que la arquitectura lo permita. `edition` y
  `features` como strings abiertos, y `schemaVersion` en el payload, son
  justamente lo que deja espacio para un v2 sin romper `verify.ts` ni las
  licencias ya emitidas.

## 10. Separación Hosted vs. Self-hosted

Ya resuelta por el `README.md` existente y reforzada en este trabajo:
`app/guide` ahora abre aclarando que Pro/Managed no necesitan nada de la
guía; `app/pricing` y la landing (`landing.selfHosted.*`) ya distinguían
"nosotros alojamos" de "vos alojás, licencia perpetua".

### Arquitectura técnica de Pro/Managed (hosted) — no existía ni como spec

El control plane hospedado en sí no vive en este repo (confirmado en el
diagnóstico, §4–6), pero hasta esta sesión tampoco existía documentado en
ningún lado **con qué corre por debajo**. Es la misma aplicación eve, sin
cambiar una línea de `agent/agent.ts` — solo el backend de cada pieza
cambia según dónde corre, exactamente como `defaultBackend()` ya lo hace
hoy en `agent/sandbox/sandbox.ts` y como `node_modules/eve/docs/guides/deployment.md`
describe la portabilidad de eve (Nitro como capa HTTP, Workflow y sandbox
como adaptadores de runtime intercambiables — "not hidden Vercel
dependencies").

| Pieza | Self-hosted (Enterprise) | Hosted (Pro/Managed) |
| --- | --- | --- |
| Runtime / estado durable | `@workflow/world-postgres` contra tu PostgreSQL (`WORKFLOW_POSTGRES_URL`) | Vercel Workflows — checkpoints entre mensajes, resume on delivery, sin Postgres propio que administrar |
| Llamadas a modelo | AI SDK directo (`@ai-sdk/openai`/`@ai-sdk/anthropic`) o Gateway con tu key | Vercel AI Gateway — mismo mecanismo que Enterprise puede usar opcionalmente, acá es el único camino |
| Sandbox aislado | Docker local, `agent/sandbox/sandbox.ts` con `docker: { networkPolicy: "deny-all" }` | Vercel Sandbox SDK — mismo `defineSandbox()`, el otro lado de la rama `defaultBackend()` que el propio código ya trae |
| Integraciones HTTP/MCP | `HTTP_ALLOWLIST` + `lib/http-guard.ts` (SSRF-gated) | Vercel Connect |
| Tools & Subagents | eve, agnóstico de host | Igual — no cambia entre hosted y self-hosted |

Esto no es una propuesta de plan nuevo — Pro y Managed ya son "en la nube"
en el pricing actual; esto documenta con qué, para que la futura
implementación del control plane hospedado (§17, punto 5) tenga una
arquitectura de referencia en vez de arrancar de cero. La diferencia de
precio Pro→Managed no viene de qué backend usa cada uno (los dos usan
este mismo stack) sino de lo que Managed agrega encima: monitoreo, trazas,
alertas, soporte con SLA — ver `pricing.managed.feature*` en
`lib/i18n/dictionaries.ts`.

**Pendiente real, no de este repo**: un flujo de autoservicio para que un
suscriptor de Pro pase a Managed (o viceversa) sin intervención manual.
Necesita el mismo control plane con billing que §17.5 ya señala como hueco
— no hay cuentas de suscriptor en ningún lado hoy, así que "actualizar tu
suscripción" no tiene, todavía, un sistema del cual colgarse.

## 11. Distribución Enterprise sin entregar el código fuente

Implementado y verificado con un build y boot reales en este entorno (Docker
Desktop, `docker build` + `docker compose up` contra un Postgres real) — no
es solo diseño en papel.

- **Dos imágenes**, reflejando los dos servicios `systemd` que ya existen
  (`deploy/roles/app/templates/steve.service.j2` para eve,
  `deploy/roles/frontend/templates/steve-web.service.j2` para Next):
  [Dockerfile](../Dockerfile) multi-stage, targets `eve` y `web`, cada uno
  con solo lo que su proceso necesita en runtime.
- **[docker-compose.enterprise.yml](../docker-compose.enterprise.yml)**
  orquesta `postgres`, `eve`, `web`. Independiente de `docker-compose.yml`
  (que solo corre Postgres para `pnpm dev`) — no se ejecutan juntos.
- **Bug real encontrado y corregido durante la verificación**: `eve start`
  no inlinea todo el código autor en `.output/` al buildear — vuelve a
  resolver los imports de `agent/agent.ts` en el arranque, y ese archivo
  importa por ruta relativa desde el `lib/` de nivel superior
  (`../lib/ai-provider`, etc.), no solo desde `agent/`. La imagen `eve`
  copia ambos directorios por eso. Sin ese ajuste, el contenedor fallaba con
  `UNRESOLVED_IMPORT` en el primer boot — no es un detalle menor, es la
  clase de cosa que "diseñar sin buildear" no detecta.
- **Paso de migración, verificado**: un `eve` recién levantado contra un
  Postgres vacío hace boot-loop (`relation "workflow.workflow_runs" does not
  exist`) hasta correr, una vez, `node_modules/.bin/bootstrap` dentro de la
  imagen `eve` — el mismo paso que el camino Ansible documenta como `pnpm
  db:migrate`, aquí ejecutado dentro del contenedor porque la imagen no trae
  `pnpm`. Instrucciones en el propio `docker-compose.enterprise.yml`.
- **Confirmado funcionando**: build de ambas imágenes, `eve` alcanza
  `{"status":"ready"}` en `/eve/v1/health` tras la migración, `web` sirve
  `/pricing` real con `output: "standalone"` (agregado a `next.config.ts`,
  no rompe `next start` ni el camino systemd — es aditivo), y el contenedor
  `eve` efectivamente alcanza el socket Docker montado
  (`/var/run/docker.sock`) que necesita para crear los sandboxes.
- **Trust boundary sin resolver, documentado en el compose file**: montar el
  socket Docker le da a `eve` control efectivo sobre el daemon del host —
  el patrón estándar para runners de CI/agentes, pero no un sandbox en sí
  mismo. Solo correr esa imagen en un host donde ese nivel de acceso sea
  aceptable.
- **Cómo esto evita entregar el repo**: las imágenes se construyen en CI de
  Steve y se publican a un registro privado (Docker Hub privado, GHCR
  privado, o uno propio). El cliente Enterprise recibe únicamente
  `docker-compose.enterprise.yml`, sus variables de entorno, el token de
  licencia, y credenciales de `docker login` al registro — nunca `git clone`
  de este repositorio.
- **Lo que esto no resuelve por sí solo**: la protección real depende de que
  Steve efectivamente no entregue el repo — es una decisión operativa (quién
  tiene acceso al registro, quién tiene acceso al git remoto), no algo que el
  código pueda forzar. La cláusula de Términos (`terms.enterpriseLicense.*`)
  es el mecanismo legal que cubre el caso en que sí se entrega el fuente.
- **No incluido, deliberadamente**: un Caddyfile estático listo para usar —
  `deploy/roles/caddy/templates/Caddyfile.j2` es la referencia, pero está
  templada con Jinja para Ansible; convertirla en un Caddyfile estático
  significa completar dominio real y email de ACME, algo que solo el
  operador que despliega puede decidir. Tampoco: pipeline de CI que
  construya y publique las imágenes, ni el onboarding al registro privado
  por cliente — eso es proceso del lado de Steve, no código de este repo.
  Tamaño de imagen sin optimizar (~1.7GB `eve`, ~500MB `web` con
  `node_modules` completo o standalone): funciona, pero admite recorte
  futuro si importa.

## 12–16. Cambios hechos

- **Frontend**: `app/settings/page.tsx` (+`components/ai-elements/license-card.tsx`),
  `app/pricing/_components/pricing.tsx`, `app/terms/_components/terms.tsx`,
  `app/guide/_components/guide.tsx`, copy en `lib/i18n/dictionaries.ts`
  (es + en) para landing/pricing/terms/guide/settings.
- **Backend**: `lib/license/*`, `app/api/license/route.ts`.
- **Database**: ninguno — el token vive en `~/.steve/license.key`, mismo
  patrón de archivo que credenciales y auth. No hay tabla nueva.
- **Deployment**: `Dockerfile`, `.dockerignore`, `docker-compose.enterprise.yml`,
  `output: "standalone"` en `next.config.ts` — build y boot verificados
  reales, ver §11.
- **Documentación**: este archivo, más `scripts/license/README.md` y los
  comentarios en `.env.example` y `docker-compose.enterprise.yml`.

## 17. Plan de fases

1. **Hecho en este trabajo**: verificador offline, emisor de licencias, UI
   en Settings, copy legal y de pricing, Dockerfile + compose para
   Enterprise con build y boot verificados end-to-end, esta documentación.
2. **Siguiente, cuando haga falta**: pipeline de CI que construya y publique
   las imágenes a un registro privado, Caddyfile estático real (con dominio
   y ACME email reales, no templados), proceso de onboarding al registro
   por cliente.
3. **Más adelante**: pipeline de "última versión disponible" que lea
   `maintenanceUntil` para decidir si ofrecer un update — sin que la
   ausencia de red o de mantenimiento vigente bloquee nunca la versión que
   ya corre.
4. **Cuando haya demanda real**: licencia Partner/OEM — multi-tenancy
   explícito, probablemente su propio `deploymentType`, y un modelo de
   pricing personalizado. El tipo `LicenseEdition` ya no requiere cambios de
   esquema para ese día; sí requiere diseño de producto nuevo (qué significa
   "features" en un contexto multi-tenant, cómo se factura).
5. **Hueco identificado, no de este repo**: billing real de Pro/Managed
   (Stripe Subscriptions, multi-tenant, control plane hospedado) no existe
   en ningún lado verificable. Es un proyecto aparte — organización/tenant,
   auth multi-usuario, billing, y el flujo de autoservicio para subir de
   Pro a Managed (o al revés) — incompatible con la arquitectura mono-
   tenant de este repo sin una reescritura mayor. Necesita su propia sesión
   de planificación, probablemente su propio repo. La arquitectura técnica
   sobre la que correría (Vercel Workflows, AI Gateway, Vercel Sandbox,
   Vercel Connect) ya está documentada en §10 — falta todo lo demás:
   cuentas de suscriptor, billing, provisioning.
