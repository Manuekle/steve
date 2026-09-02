import { fetchPageText } from "./business-analysis";
import { deleteDocument } from "./knowledge-store";
import { RagError, ingestFile } from "./rag";
import {
  setLegalPage,
  type BusinessIdentity,
  type LegalPage,
  type LegalPageKind,
} from "./business-profile-store";

// The hand-entered half of the business profile: the logo, and the terms and
// privacy pages.
//
// Legal text is the one part of the identity the agent has to be able to
// *quote*, not just know about — "¿cuánto tiempo tengo para devolver?" is
// answered by the returns clause, verbatim. So saving a legal page also
// indexes it into the knowledge base, where search_knowledge already governs
// policy answers (see agent/instructions). The identity keeps the URL and the
// raw text so the owner can read and edit what they saved; the knowledge base
// keeps the chunks the agent retrieves.

export class BusinessIdentityError extends Error {}

/** Logo formats browsers render and the app can serve back untouched. */
const LOGO_MIME_EXTENSIONS: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/svg+xml": ".svg",
};

export const LOGO_ACCEPT_ATTRIBUTE = ".png,.jpg,.jpeg,.webp,.gif,.svg";

/** A logo is a small piece of branding, not an asset library entry — 2 MB is
 *  already generous for one, and the cap keeps the store directory small. */
export const MAX_LOGO_BYTES = 2 * 1024 * 1024;

/** Longest legal page kept. Terms run long; past this the tail is dropped
 *  rather than the save being refused. */
export const MAX_LEGAL_CHARS = 40_000;

/**
 * Validates an uploaded logo and returns the extension to store it under.
 * Throws `BusinessIdentityError` with a message meant for the user.
 */
export function logoExtensionFor(mime: string, size: number): string {
  const extension = LOGO_MIME_EXTENSIONS[mime.toLowerCase()];
  if (!extension) {
    throw new BusinessIdentityError(
      "Formato no soportado. Subí el logo en PNG, JPG, WEBP, GIF o SVG.",
    );
  }
  if (size === 0) throw new BusinessIdentityError("El archivo está vacío.");
  if (size > MAX_LOGO_BYTES) {
    throw new BusinessIdentityError(`El logo supera el límite de ${MAX_LOGO_BYTES / (1024 * 1024)} MB.`);
  }
  return extension;
}

const LEGAL_DOCUMENT_NAMES: Record<LegalPageKind, string> = {
  terms: "Términos y condiciones",
  privacy: "Política de privacidad",
};

/** Reads a legal page off the owner's own site. Returns the text, or a
 *  message saying why it couldn't be read — never throws. */
export async function importLegalPage(
  url: string,
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const result = await fetchPageText(url, { maxChars: MAX_LEGAL_CHARS });
  return "text" in result ? { ok: true, text: result.text } : { ok: false, error: result.error };
}

export type LegalSaveResult = {
  readonly identity: BusinessIdentity;
  /** Set when the text was saved but couldn't be indexed for retrieval — the
   *  page is still stored and visible, the agent just can't quote it yet
   *  (usually no embedding credential). */
  readonly indexWarning?: string;
};

/**
 * Saves one legal page and re-indexes it for retrieval. Indexing is
 * best-effort on purpose: a business with no embedding key should still be
 * able to keep its terms in the app and read them here.
 */
export async function saveLegalPage(
  kind: LegalPageKind,
  input: { url: string; text: string; previous: LegalPage | null },
): Promise<LegalSaveResult> {
  const url = input.url.trim();
  const text = input.text.trim().slice(0, MAX_LEGAL_CHARS);

  if (!url && !text) {
    throw new BusinessIdentityError("Agregá un enlace o el texto de la página.");
  }

  let documentId: string | null = null;
  let indexWarning: string | undefined;

  if (text) {
    try {
      const name = `${LEGAL_DOCUMENT_NAMES[kind]}.txt`;
      const body = url ? `${LEGAL_DOCUMENT_NAMES[kind]} — ${url}\n\n${text}` : text;
      const document = await ingestFile({
        name,
        mime: "text/plain",
        bytes: new TextEncoder().encode(body),
      });
      documentId = document.id;
    } catch (error) {
      indexWarning =
        error instanceof RagError
          ? error.message
          : "No se pudo indexar el texto para búsqueda.";
      if (!(error instanceof RagError)) console.error("[business-identity] legal ingest failed", error);
    }
  }

  // The old indexed copy always goes, even when the new one failed to index.
  // Keeping it would leave the agent quoting the previous terms while the
  // owner reads the new ones here — for legal text, no answer beats a
  // confidently wrong one, and the warning tells them it isn't searchable.
  if (input.previous?.documentId && input.previous.documentId !== documentId) {
    await deleteDocument(input.previous.documentId);
  }

  const identity = await setLegalPage(kind, {
    url,
    text,
    documentId,
    updatedAt: new Date().toISOString(),
  });

  return indexWarning ? { identity, indexWarning } : { identity };
}

/** Removes a legal page and the knowledge document it was indexed as. */
export async function clearLegalPage(
  kind: LegalPageKind,
  previous: LegalPage | null,
): Promise<BusinessIdentity> {
  if (previous?.documentId) await deleteDocument(previous.documentId);
  return setLegalPage(kind, null);
}
