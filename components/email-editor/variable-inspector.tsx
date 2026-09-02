"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@/components/icons/icon";
import { CodeIcon } from "@hugeicons/core-free-icons";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";

type VariableInspectorProps = {
  readonly variables: readonly string[];
  readonly values: Record<string, unknown>;
  readonly onChange: (key: string, value: unknown) => void;
};

/** Anything that isn't a plain string — an array of invoice items, a number —
 *  is edited as JSON, because there's no honest single-line input for it. */
function isStructured(value: unknown): boolean {
  return value !== null && typeof value === "object";
}

export function VariableInspector({ variables, values, onChange }: VariableInspectorProps) {
  const t = useT();

  if (variables.length === 0) {
    return (
      <div className="flex h-full min-h-[160px] flex-col items-center justify-center gap-2 px-8 text-center">
        <span className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground/60 uppercase">
          {t("emailTemplates.variables")}
        </span>
        <p className="max-w-[32ch] text-[12px] leading-relaxed text-muted-foreground/70">
          {t("emailTemplates.noVariables")}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 px-3 py-3">
      <p className="text-[12px] leading-relaxed text-muted-foreground">
        {t("emailTemplates.variablesHint")}
      </p>
      {variables.map((name) => {
        const value = values[name];
        return (
          <label key={name} className="block space-y-1">
            <span className="flex items-center gap-1.5">
              <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground/80">
                {name}
              </code>
              {isStructured(value) ? (
                <span className="inline-flex items-center gap-1 font-mono text-[9px] tracking-[0.12em] text-muted-foreground/60 uppercase">
                  <HugeiconsIcon icon={CodeIcon} size={10} strokeWidth={2} />
                  JSON
                </span>
              ) : null}
            </span>
            {isStructured(value) ? (
              <JsonField name={name} value={value} onChange={onChange} />
            ) : (
              <Input
                value={typeof value === "string" ? value : value === undefined ? "" : String(value)}
                onChange={(event) => onChange(name, event.target.value)}
                placeholder={t("emailTemplates.variablePlaceholder", { name })}
                className="h-8 text-xs"
              />
            )}
          </label>
        );
      })}
    </div>
  );
}

/** A structured value, edited as JSON text. */
function JsonField({
  name,
  value,
  onChange,
}: {
  readonly name: string;
  readonly value: unknown;
  readonly onChange: (key: string, value: unknown) => void;
}) {
  const t = useT();
  // The text is its own state rather than a projection of `value`: feeding it
  // back through JSON.stringify on every keystroke would reformat what someone
  // is halfway through typing. Switching template remounts this (the pane is
  // keyed on the template id), which is when it should reset.
  const [text, setText] = useState(() => JSON.stringify(value, null, 2));
  const [invalid, setInvalid] = useState(false);

  return (
    <>
      <Textarea
        aria-label="Variables de la plantilla (JSON)"
        value={text}
        rows={Math.min(10, text.split("\n").length)}
        onChange={(event) => {
          const next = event.target.value;
          setText(next);
          try {
            onChange(name, JSON.parse(next));
            setInvalid(false);
          } catch {
            // Kept on screen and flagged: the halfway state of typing an array
            // is always invalid, and discarding it would make the field
            // impossible to edit at all.
            setInvalid(true);
          }
        }}
        className={cn(
          "font-mono text-[11px] leading-relaxed",
          invalid && "border-destructive/50",
        )}
      />
      {invalid ? (
        <span className="block text-[11px] text-destructive">{t("emailTemplates.invalidJson")}</span>
      ) : null}
    </>
  );
}
