# Tutoriales de credenciales

Los videos que abre el modal "Ver explicación" de **Ajustes** (`/settings`) viven acá.

## Nombres de archivo

Cada tarjeta de credenciales pide un archivo con el mismo id que la tarjeta:

```
public/videos/tutorials/<id>.mp4     ← el video (obligatorio)
public/videos/tutorials/<id>.jpg     ← el poster / primer frame (opcional)
```

`<id>` es el id del grupo de credenciales. Los que existen hoy:

| id                 | Tarjeta                       |
| ------------------ | ----------------------------- |
| `ai-provider`      | Proveedor de IA               |
| `database`         | Base de datos (Postgres)      |
| `whatsapp`         | WhatsApp                      |
| `messenger`        | Messenger                     |
| `instagram`        | Instagram                     |
| `twilio`           | Twilio                        |
| `elevenlabs`       | ElevenLabs                    |
| `resend`           | Resend                        |
| `smtp`             | SMTP                          |
| `stripe`           | Stripe                        |
| `mercadopago`      | Mercado Pago                  |
| `shopify`          | Shopify                       |
| `google-sheets`    | Google Sheets                 |
| `google-calendar`  | Google Calendar               |
| `meta-ads`         | Meta Ads                      |
| `integrations`     | Integraciones                 |
| `oauth-google`     | OAuth · Google                |
| `oauth-hubspot`    | OAuth · HubSpot               |
| `oauth-slack`      | OAuth · Slack                 |
| `oauth-notion`     | OAuth · Notion                |

## Formato

- **Contenedor:** MP4 (H.264 + AAC) — lo reproduce todo navegador sin JS extra.
- **Resolución:** 1920×1080 o 1280×720, relación 16:9 (el modal recorta con `object-contain`).
- **Duración:** 60–120 s. Es "dónde saco la key y dónde la pego", no un curso.
- **Peso:** ideal < 15 MB. Se sirve como archivo estático desde `public/`, sin CDN de video.
- **Audio:** opcional. Si el video no tiene voz, subtitulá en pantalla los pasos.

## Mientras no exista el archivo

El modal ya está en producción: si el `.mp4` no está, muestra un estado
"video en preparación" en vez de romperse. Alcanza con dejar el archivo con el
nombre correcto acá — no hay que tocar código para publicar un tutorial.
