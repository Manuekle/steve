"use client";

import { HugeiconsIcon } from "@/components/icons/icon";
import { Tick02Icon } from "@hugeicons/core-free-icons";
import { Card } from "../../../_components/dashboard-card";
import { Button } from "@/components/ui/button";
import { useT, useI18n } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";
import { SKILL_TEMPLATES, templateContent, type SkillTemplate } from "@/lib/skill-templates";

const TEMPLATE_BULLETS = [1, 2, 3] as const;

export function TemplatePicker({
  onPick,
}: {
  readonly onPick: (template: SkillTemplate) => void;
}) {
  const t = useT();
  const { locale } = useI18n();

  return (
    <section className="mt-10">
      <header className="mb-4">
        <h2 className="text-lg font-semibold">{t("skills.pickerTitle")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("skills.pickerDescription")}</p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {SKILL_TEMPLATES.map((template) => {
          const content = templateContent(template, locale);
          return (
            <Card key={template.id} interactive className="flex flex-col">
              <div className="flex flex-1 flex-col gap-4 p-5">
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      "flex size-10 shrink-0 items-center justify-center rounded-xl shadow-[var(--shadow-inset)]",
                      template.accent,
                    )}
                  >
                    <HugeiconsIcon icon={template.icon} size={20} strokeWidth={1.75} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{content.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{content.description}</p>
                  </div>
                </div>

                <ul className="flex-1 space-y-1.5">
                  {TEMPLATE_BULLETS.map((n) => (
                    <li key={n} className="flex items-start gap-2 text-xs text-muted-foreground">
                      <HugeiconsIcon
                        icon={Tick02Icon}
                        size={12}
                        strokeWidth={2}
                        className="mt-0.5 shrink-0 text-primary"
                      />
                      <span>{t(`skillTemplates.${template.id}.bullet${n}`)}</span>
                    </li>
                  ))}
                </ul>

                <Button size="sm" className="w-full" onClick={() => onPick(template)}>
                  {t("skills.pickerUseTemplate")}
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
