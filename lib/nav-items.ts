import type { IconSvgElement } from "@hugeicons/react";
import {
  DashboardSquare01Icon,
  DocumentAttachmentIcon,
  ZapIcon,
  Settings01Icon,
  ArtificialIntelligence08Icon,
  InboxIcon,
  Timer01Icon,
  MetaIcon,
  AiImagineIcon,
  LibraryIcon,
  FilterHorizontalIcon,
  UserCircleIcon,
  TelevisionTableIcon,
  UserGroup02Icon,
} from "@hugeicons/core-free-icons";

export type NavItem = {
  readonly href: string;
  readonly labelKey: string;
  readonly icon: IconSvgElement;
};

export type NavGroup = {
  readonly id: string;
  /** Omitted for the first group: a heading over the two entry points would be
   *  a label on the obvious. */
  readonly labelKey?: string;
  readonly items: readonly NavItem[];
};

/**
 * The sidebar's navigation, grouped by what you're doing rather than listed
 * flat. Nine equal-weight rows read as a pile; four short groups read as a
 * map. Shared with the command palette so the two can never disagree.
 */
export const NAV_GROUPS: readonly NavGroup[] = [
  {
    id: "main",
    items: [
      { href: "/chat", labelKey: "nav.chat", icon: ArtificialIntelligence08Icon },
      { href: "/dashboard", labelKey: "nav.dashboard", icon: DashboardSquare01Icon },
    ],
  },
  {
    id: "conversations",
    labelKey: "nav.groupConversations",
    items: [
      { href: "/history", labelKey: "nav.chats", icon: DocumentAttachmentIcon },
      { href: "/inbox", labelKey: "nav.inbox", icon: InboxIcon },
    ],
  },
  {
    id: "crm",
    labelKey: "nav.groupCrm",
    items: [
      { href: "/crm", labelKey: "nav.crm", icon: TelevisionTableIcon },
      { href: "/leads", labelKey: "nav.leads", icon: UserGroup02Icon },
    ],
  },
  {
    id: "automation",
    labelKey: "nav.groupAutomation",
    items: [
      { href: "/automations", labelKey: "nav.automations", icon: ZapIcon },
      { href: "/agents", labelKey: "nav.agents", icon: AiImagineIcon },
      { href: "/reminders", labelKey: "nav.reminders", icon: Timer01Icon },
      { href: "/ads", labelKey: "nav.ads", icon: MetaIcon },
    ],
  },
  {
    id: "knowledge",
    labelKey: "nav.groupKnowledge",
    items: [{ href: "/knowledge", labelKey: "nav.knowledge", icon: LibraryIcon }],
  },
  {
    id: "system",
    labelKey: "nav.groupSystem",
    items: [
      { href: "/account", labelKey: "nav.account", icon: UserCircleIcon },
      { href: "/settings", labelKey: "nav.settings", icon: Settings01Icon },
      { href: "/setup", labelKey: "nav.setup", icon: FilterHorizontalIcon },
    ],
  },
];

export const NAV_ITEMS: readonly NavItem[] = NAV_GROUPS.flatMap((group) => group.items);
