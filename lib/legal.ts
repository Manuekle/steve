import type { Metadata } from "next";
import entity from "@/content/entity.json";
import operations from "@/content/legal-operations.json";
import { marketingMetadata } from "@/lib/site";

export const LEGAL_VERSION = "2026-09-11";
export const LEGAL_ENTITY: Record<keyof typeof entity, string | null> = entity;
export const LEGAL_OPERATIONS: Record<keyof typeof operations, string | null> = operations;
export const LEGAL_INCOMPLETE = !entity.name || !entity.address || !entity.email ||
  !entity.phone || Object.values(operations).some((value) => !value);

export const LEGAL_LINKS = [
  { href: "/legal", es: "Aviso legal", en: "Legal notice" },
  { href: "/terms", es: "Términos y condiciones", en: "Terms of service" },
  { href: "/privacy", es: "Política de privacidad", en: "Privacy policy" },
  { href: "/privacy-rights", es: "Tus derechos de privacidad", en: "Your privacy rights" },
  { href: "/cookies", es: "Cookies y preferencias", en: "Cookies and preferences" },
] as const;

export function legalMetadata(path: string, title: string, description: string): Metadata {
  return {
    ...marketingMetadata({ path, title: `${title} — senka`, description }),
    ...(LEGAL_INCOMPLETE ? { robots: { index: false, follow: process.env.VERCEL_ENV !== "preview" } } : {}),
  };
}
