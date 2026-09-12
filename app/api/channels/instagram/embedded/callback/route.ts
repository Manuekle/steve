import { type NextRequest, NextResponse } from "next/server";
import { withApiErrors } from "@/lib/api-error";
import { getCredential, saveCredentials } from "@/lib/credentials";
import { MetaApiError } from "@/lib/meta-ads";
import {
  IG_STATE_COOKIE,
  exchangeForLongLivedToken,
  exchangeIgCode,
  getIgAccount,
  igEmbeddedCallbackUrl,
  subscribeIgApp,
} from "@/lib/meta-instagram";

// GET /api/channels/instagram/embedded/callback — Meta lands here.
//
// This URL runs inside the popup, never in the app: it finishes the whole
// exchange server-side (code → short token → 60-day token → account →
// webhook subscription → stored credentials) and answers with a page that
// posts the verdict to the opener and closes itself. The drawer listens for
// that message and paints done/error without a reload.

function popupPage(payload: { ok: boolean; username?: string; message?: string }): NextResponse {
  // JSON-encoded, with `<` neutralized so a Meta error string can never break
  // out of the script block.
  const encoded = JSON.stringify(payload).replace(/</g, "\\u003c");
  const title = payload.ok ? "Instagram conectado" : "No se pudo conectar";
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${title}</title></head><body><p>${title}.</p><script>try{window.opener&&window.opener.postMessage(Object.assign({type:"IG_EMBEDDED_SIGNUP"},${encoded}),window.location.origin);}catch(e){}window.close();</script><noscript><p>Cerrá esta ventana y volvé a la app.</p></noscript></body></html>`;
  return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}

export const GET = withApiErrors(async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const code = params.get("code")?.trim();
  const state = params.get("state");
  const expected = request.cookies.get(IG_STATE_COOKIE)?.value;

  if (!code) return popupPage({ ok: false, message: "Meta no devolvió el código de autorización." });
  if (!state || !expected || state !== expected) {
    return popupPage({ ok: false, message: "La respuesta no coincide con la solicitud (state)." });
  }

  const igAppId = (await getCredential("INSTAGRAM_APP_ID"))?.trim();
  const igSecret = (await getCredential("INSTAGRAM_LOGIN_SECRET"))?.trim();
  if (!igAppId || !igSecret) {
    return popupPage({ ok: false, message: "Falta registrar la app de Instagram en esta instalación." });
  }

  try {
    const redirectUri = igEmbeddedCallbackUrl();
    const short = await exchangeIgCode({ igAppId, igSecret, redirectUri, code });
    const long = await exchangeForLongLivedToken({
      igSecret,
      shortToken: short.accessToken,
    });
    // Proves the new token can see the account before anything is stored.
    const account = await getIgAccount({ accessToken: long.accessToken });
    await subscribeIgApp({ accessToken: long.accessToken });
    await saveCredentials({
      INSTAGRAM_ACCESS_TOKEN: long.accessToken,
      INSTAGRAM_ACCOUNT_ID: account.id,
    });
    const done = popupPage({
      ok: true,
      ...(account.username ? { username: account.username } : {}),
    });
    done.cookies.delete(IG_STATE_COOKIE);
    return done;
  } catch (error) {
    const message =
      error instanceof MetaApiError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Falló la conexión.";
    return popupPage({ ok: false, message });
  }
});
