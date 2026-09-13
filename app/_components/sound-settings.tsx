"use client";

import { HugeiconsIcon } from "@/components/icons/icon";
import { VolumeHighIcon } from "@hugeicons/core-free-icons";
import { Switch } from "@/components/ui/switch";
import { LiquidSlider } from "@/components/ui/liquid-slider";
import { useSound } from "@/components/sound-provider";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";

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
    <div className={cn("mb-4 break-inside-avoid rounded-[20px] border border-border/70 bg-muted/50 p-1.5 shadow-[var(--shadow-float)]", className)}>
      <div className="flex flex-col">
        <div className="overflow-hidden rounded-[14px] border border-border/50 bg-card p-5 shadow-xs">
          <div className="flex items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground shadow-[var(--shadow-inset)]">
              <HugeiconsIcon icon={VolumeHighIcon} size={16} strokeWidth={1.75} />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-medium">{t("sound.title")}</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">{t("sound.description")}</p>
            </div>
            <Switch
              checked={enabled}
              onCheckedChange={setEnabled}
              label={t(enabled ? "sound.turnOff" : "sound.turnOn")}
            />
          </div>
        </div>
        {/* Volume slider — footer strip outside the inner border */}
        <div className="flex items-center gap-3 px-3.5 pt-2.5 pb-1.5">
          <span className="w-16 shrink-0 text-xs text-muted-foreground">{t("sound.volume")}</span>
          <LiquidSlider
            min={0}
            max={1}
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
      </div>
    </div>
  );
}
