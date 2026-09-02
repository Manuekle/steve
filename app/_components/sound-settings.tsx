"use client";

import { HugeiconsIcon } from "@/components/icons/icon";
import { VolumeHighIcon } from "@hugeicons/core-free-icons";
import { Switch } from "@/components/ui/switch";
import { LiquidSlider } from "@/components/ui/liquid-slider";
import { useSound } from "@/components/sound-provider";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";
import { Card, CardHeader, CardTitle, CardDescription, CardSeparator } from "./dashboard-card";

/**
 * Mute switch plus a volume slider for the cuelume interaction sounds.
 *
 * Lives on Account rather than Settings: it's a preference of whoever is
 * signed in, not a credential this installation runs on.
 */
export function SoundSettings({ className }: { readonly className?: string }) {
  const t = useT();
  const { enabled, volume, setEnabled, setVolume } = useSound();
  return (
    <Card className={cn("mb-4 break-inside-avoid", className)}>
      <CardHeader>
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground shadow-[var(--shadow-inset)]">
          <HugeiconsIcon icon={VolumeHighIcon} size={16} strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1">
          <CardTitle>{t("sound.title")}</CardTitle>
          <CardDescription>{t("sound.description")}</CardDescription>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={setEnabled}
          label={t(enabled ? "sound.turnOff" : "sound.turnOn")}
        />
      </CardHeader>
      <CardSeparator />
      <div className="flex items-center gap-3 px-5 py-3.5">
        <span className="w-16 shrink-0 text-xs text-muted-foreground">{t("sound.volume")}</span>
        <LiquidSlider
          min={0}
          max={1}
          // 1% steps, not 5%: a coarse step teleports the thumb ~15px per
          // tick, and the liquid — which springs after it — separates into a
          // visible second blob before it catches up.
          step={0.01}
          value={volume}
          disabled={!enabled}
          label={t("sound.volume")}
          onValueChange={setVolume}
        />
        <span className="w-9 shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
          {Math.round(volume * 100)}%
        </span>
      </div>
    </Card>
  );
}
