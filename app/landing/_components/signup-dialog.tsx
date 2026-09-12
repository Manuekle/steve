"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { GoogleLogo } from "@/components/provider-logo";
import { useSmoothScroll } from "@/components/motion/smooth-scroll";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * Auto-open fires once per page load, not once per mount. Going landing →
 * pricing → landing remounts the hero and would otherwise restart the 5s
 * timer and pop the modal mid-browse. Module state survives client-side
 * navigation but resets on a full reload, which is exactly the split wanted:
 * navigating back does not re-trigger it, reloading does.
 */
let autoOpenedThisLoad = false;

export function SignupDialog({
  children,
  autoOpenAfterMs,
}: {
  readonly children: ReactNode;
  readonly autoOpenAfterMs?: number;
}) {
  const router = useRouter();
  const { lenis } = useSmoothScroll();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (autoOpenAfterMs === undefined || autoOpenedThisLoad) return;

    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      // Another instance may have opened manually while this timer waited —
      // seen is seen, whoever showed it.
      if (autoOpenedThisLoad) return;
      autoOpenedThisLoad = true;
      setOpen(true);
    }, autoOpenAfterMs);
    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [autoOpenAfterMs]);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) return;
    autoOpenedThisLoad = true;
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  /**
   * The page holds still while the modal is open — same two halves as the
   * mobile menu in `landing-header.tsx`. Radix locks the native path on its
   * own; `lenis.stop()` is what stops the Lenis one, which writes the scroll
   * offset itself and never sees `overflow: hidden`.
   */
  useEffect(() => {
    if (!open) return;
    lenis?.stop();
    return () => {
      lenis?.start();
    };
  }, [open, lenis]);

  const submitEmail = (event: FormEvent) => {
    event.preventDefault();
    const address = email.trim();
    if (!address) {
      setEmailError("Escribe tu correo para continuar.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      setEmailError("Ese correo no parece válido.");
      return;
    }
    setEmailError(null);
    router.push(`/login?mode=signup&email=${encodeURIComponent(address)}`);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="gap-5 sm:max-w-[27rem] sm:p-7" variant="plain">
        <DialogHeader className="items-center px-4 text-center sm:px-6">
          <DialogTitle className="max-w-[20ch] text-balance font-heading font-semibold font-cooper text-[1.75rem] leading-[1.08] tracking-[-0.025em] sm:text-[2rem]">
            Crea tu primer agente de ventas IA en 2 minutos
          </DialogTitle>
          <DialogDescription className="text-balance pt-1 text-[15px] leading-relaxed">
            Crea una cuenta y recibe 2.000 créditos gratis.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <Button asChild className="h-11 w-full text-[15px]" variant="outline">
            <Link href="/api/auth/google/start">
              <GoogleLogo size={17} />
              Continúa con Google
            </Link>
          </Button>

          <div className="my-1 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            <span>O</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <form className="flex flex-col gap-3" noValidate onSubmit={submitEmail}>
            <label
              className="flex flex-col gap-1.5 text-left text-sm font-medium"
              htmlFor="signup-email"
            >
              Tu correo electrónico
              <Input
                autoComplete="email"
                className="h-11 rounded-[13px] text-[15px] md:text-[15px]"
                id="signup-email"
                name="email"
                onChange={(event) => {
                  setEmail(event.target.value);
                  if (emailError) setEmailError(null);
                }}
                placeholder="tu@empresa.com"
                type="email"
                value={email}
              />
            </label>
            {emailError ? (
              <p className="text-left text-xs text-destructive" role="alert">
                {emailError}
              </p>
            ) : null}

            <Button className="btn-metal h-11 w-full text-[15px]" type="submit">
              Reclama mis 2.000 créditos
            </Button>
          </form>
          <p className="text-center text-xs text-muted-foreground">No se necesita tarjeta de crédito</p>
        </div>

        <p className="mt-2 text-center text-[11px] leading-relaxed text-muted-foreground">
          Al crear una cuenta, aceptas los{" "}
          <Link className="underline underline-offset-2 hover:text-foreground" href="/terms">
            Términos de Servicio
          </Link>{" "}
          y la{" "}
          <Link className="underline underline-offset-2 hover:text-foreground" href="/privacy">
            Política de Privacidad
          </Link>
          .
        </p>
      </DialogContent>
    </Dialog>
  );
}
