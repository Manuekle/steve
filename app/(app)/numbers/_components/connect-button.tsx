import { type ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { WhatsAppMark, InstagramMark } from "@/app/landing/_components/brand-marks";
import { cn } from "@/lib/utils";

// Brand connect buttons ("Connect with Meta", "Connect Instagram").
//
// Soft brand tint at rest, a touch stronger on hover — never a solid fill,
// so the brand mark and the label keep full contrast in both states. Green
// for WhatsApp, Meta blue for Instagram. One component so the header, the
// empty state and the drawer footers all read as the same action.

const TONES = {
  whatsapp: {
    Mark: WhatsAppMark,
    className:
      "border-[#25D366]/50 bg-[#25D366]/10 text-[#0B6B3A] dark:text-[#4ADE80]" +
      " hover:border-[#25D366]/70 hover:bg-[#25D366]/20 hover:text-[#0B6B3A] dark:hover:text-[#4ADE80]",
  },
  instagram: {
    Mark: InstagramMark,
    className:
      "border-[#D62976]/50 bg-[#D62976]/10 text-[#A11E54] dark:text-[#F27BAC]" +
      " hover:border-[#D62976]/70 hover:bg-[#D62976]/20 hover:text-[#A11E54] dark:hover:text-[#F27BAC]",
  },
} as const;

export function ConnectButton({
  tone,
  className,
  children,
  ...props
}: {
  readonly tone: keyof typeof TONES;
} & ComponentProps<typeof Button>) {
  const { Mark, className: toneClass } = TONES[tone];
  return (
    <Button variant="outline" className={cn(toneClass, className)} {...props}>
      <Mark size={16} />
      {children}
    </Button>
  );
}
