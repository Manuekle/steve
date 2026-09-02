import { HugeiconsIcon } from "@/components/icons/icon";
import { Loading03Icon } from "@hugeicons/core-free-icons";

import { cn } from "@/lib/utils";

function Spinner({
  className,
  ...props
}: Omit<React.ComponentProps<typeof HugeiconsIcon>, "icon">) {
  return (
    <HugeiconsIcon
      icon={Loading03Icon}
      size={16}
      strokeWidth={1.75}
      role="status"
      aria-label="Loading"
      className={cn("animate-spin", className)}
      {...props}
    />
  );
}

export { Spinner };
