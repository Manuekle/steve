"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { LockKeyIcon, SparklesIcon } from "@hugeicons/core-free-icons";
import { Beam } from "@/components/ui/beam";
import { Button } from "@/components/ui/button";
import type { LicenseInfo } from "@/lib/license/types";

type GateState = { loading: true } | { loading: false; allowed: boolean };

function useEnterpriseAllowed(): GateState {
  const [state, setState] = useState<GateState>({ loading: true });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/license");
        if (!res.ok) {
          if (!cancelled) setState({ loading: false, allowed: false });
          return;
        }
        const info = (await res.json()) as LicenseInfo;
        const allowed = info.status === "valid" && info.payload?.edition === "enterprise";
        if (!cancelled) setState({ loading: false, allowed });
      } catch {
        if (!cancelled) setState({ loading: false, allowed: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

export function EnterpriseGate({ children }: { readonly children: React.ReactNode }) {
  const gate = useEnterpriseAllowed();

  if (gate.loading) {
    return <>{children}</>;
  }

  if (gate.allowed) {
    return <>{children}</>;
  }

  return (
    <div className="relative">
      {/* Content underneath, blurred and inert */}
      <div aria-hidden="true" className="pointer-events-none select-none blur-[6px] opacity-50">
        {children}
      </div>

      {/* Backdrop */}
      <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60 backdrop-blur-xl p-4">
        <Beam size="pulse-outside" strength={0.7} borderRadius={20} className="w-full max-w-[420px]">
          <div className="w-full rounded-[20px] border border-border bg-card p-6 shadow-[var(--shadow-soft),var(--shadow-soft)] sm:p-7">
            <div className="mx-auto flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-[var(--shadow-inset)]">
              <HugeiconsIcon icon={LockKeyIcon} size={18} strokeWidth={1.75} />
            </div>

            <h2 className="mt-4 text-center font-cooper text-[1.7rem] leading-[1.05] tracking-[-0.02em]">
              Configuración bloqueada
            </h2>
            <p className="mt-2 text-center text-[13px] leading-relaxed text-muted-foreground" style={{ fontFamily: "var(--font-sans)" }}>
              Tu suscripción actual es <span className="font-medium text-foreground">Pro / Managed</span>. Configuración e
              Instalación son funciones <span className="font-medium text-foreground">Enterprise</span>.
            </p>

            <div className="mt-6 flex flex-col gap-2">
              <Button asChild className="w-full" size="lg">
                <Link href="/pricing">
                  <HugeiconsIcon icon={SparklesIcon} size={16} strokeWidth={1.75} />
                  Comprar Enterprise
                </Link>
              </Button>
              <p className="text-center text-[11px] text-muted-foreground/70" style={{ fontFamily: "var(--font-sans)" }}>
                Desbloquea claves, base de datos y soporte completo.
              </p>
            </div>
          </div>
        </Beam>
      </div>
    </div>
  );
}
