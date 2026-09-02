"use client";

import { HugeiconsIcon } from "@/components/icons/icon";
import {
  Add01Icon,
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  Delete01Icon,
  Download01Icon,
  PencilEdit01Icon,
  SearchIcon,
  UserIcon,
} from "@hugeicons/core-free-icons";
import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { Card } from "@/app/_components/dashboard-card";
import { ChannelIcon } from "@/app/_components/channel-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/i18n/provider";
import type { ChannelId } from "@/lib/types";
import { AppChrome, HeaderAction } from "./screen-chrome";

/**
 * The inbox, as `app/(app)/inbox/page.tsx` renders it: the two header actions, the
 * search field, and one `Card` per contact — not rows inside a single divided
 * list. Lucía Romero starts expanded by default.
 *
 * Typing filters, the chevron toggles expansion, and `Reanudar` is inert.
 * Edit/delete remain in the expanded detail.
 */

type Contact = {
  readonly channel: ChannelId;
  readonly lastMessage: string;
  readonly name: string;
  readonly notes: string;
  readonly phone: string;
  readonly source: string;
  readonly status: "waiting_human" | "followup_due";
  readonly when: string;
};

/**
 * `status` is a real `ContactStatus`. The page only ever lists contacts the
 * bot has stopped answering, so the two that appear are `waiting_human` and
 * `followup_due` — and the chip over the name says `Derivación` / `Seguimiento`,
 * which is the pair of words the row actually prints. The longer
 * `inbox.statusWaitingHuman` wording belongs to the status `Select` inside the
 * expanded card, where it is used below.
 */
function useContacts(t: (key: string) => string): readonly Contact[] {
  return [
    {
      channel: "whatsapp",
      lastMessage: t("landing.demo.msg.maria"),
      name: "María Fernández",
      notes: t("landing.demo.note.maria"),
      phone: "+54 9 11 4021-8871",
      source: "whatsapp",
      status: "followup_due",
      when: "2m",
    },
    {
      channel: "instagram",
      lastMessage: t("landing.demo.msg.lucia"),
      name: "Lucía Romero",
      notes: t("landing.demo.note.lucia"),
      phone: "+54 9 341 615-2290",
      source: "instagram",
      status: "waiting_human",
      when: "6m",
    },
    {
      channel: "whatsapp",
      lastMessage: t("landing.demo.msg.carlos"),
      name: "Carlos Ruiz",
      notes: t("landing.demo.note.carlos"),
      phone: "+54 9 11 3388-0142",
      source: "whatsapp",
      status: "waiting_human",
      when: "11m",
    },
    {
      channel: "instagram",
      lastMessage: t("landing.demo.msg.diego"),
      name: "Diego Salas",
      notes: t("landing.demo.note.diego"),
      phone: "+54 9 11 2277-6630",
      source: "instagram",
      status: "followup_due",
      when: "24m",
    },
    {
      channel: "whatsapp",
      lastMessage: t("landing.demo.msg.paula"),
      name: "Paula Ibáñez",
      notes: t("landing.demo.note.paula"),
      phone: "+54 9 11 5540-9917",
      source: "whatsapp",
      status: "waiting_human",
      when: "38m",
    },
    {
      channel: "instagram",
      lastMessage: t("landing.demo.msg.tomas"),
      name: "Tomás Aguirre",
      notes: t("landing.demo.note.tomas"),
      phone: "+54 9 11 6690-3312",
      source: "instagram",
      status: "followup_due",
      when: "52m",
    },
  ];
}

export function InboxScreen() {
  const t = useT();
  const contacts = useContacts(t);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>("Lucía Romero");

  // The page's own filter: name, phone or note, lower-cased.
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return contacts;
    return contacts.filter(
      (contact) =>
        contact.name.toLowerCase().includes(query) ||
        contact.phone.includes(query) ||
        contact.notes.toLowerCase().includes(query),
    );
  }, [search, contacts]);

  return (
    <AppChrome
      active="/inbox"
      title={t("inbox.title")}
      subtitle={t("inbox.subtitle")}
      actions={
        <div className="flex items-center gap-2">
          <HeaderAction icon={Download01Icon} labelBelowSm>
            CSV
          </HeaderAction>
          <HeaderAction icon={Add01Icon} labelBelowSm>
            {t("inbox.createContact")}
          </HeaderAction>
        </div>
      }
    >
      <div className="relative mb-4">
        <HugeiconsIcon
          icon={SearchIcon}
          size={16}
          strokeWidth={1.75}
          className="-translate-y-1/2 absolute top-1/2 left-3 text-muted-foreground"
        />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("inbox.search")}
          className="pl-9"
        />
      </div>

      {filtered.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center gap-3 px-5 py-16 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground shadow-[var(--shadow-inset)]">
              <HugeiconsIcon icon={UserIcon} size={20} strokeWidth={1.75} />
            </div>
            <p className="font-medium text-sm">{t("inbox.empty")}</p>
            <p className="max-w-xs text-muted-foreground text-xs">{t("inbox.emptyHint")}</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((contact) => {
            const isExpanded = expanded === contact.name;
            return (
              <Card key={contact.name}>
                <div className="flex items-center gap-3 px-5 py-4">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground shadow-[var(--shadow-inset)]">
                    <ChannelIcon channel={contact.channel} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium text-sm">{contact.name}</p>
                      <span className="rounded-md bg-muted px-1.5 py-0.5 font-medium text-[10px] text-muted-foreground uppercase tracking-wide">
                        {contact.status === "followup_due" ? t("inbox.followup") : t("inbox.handoff")}
                      </span>
                    </div>
                    <p className="truncate text-muted-foreground text-xs">{contact.lastMessage}</p>
                  </div>
                  <span className="hidden text-muted-foreground text-xs sm:block">{contact.when}</span>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => setExpanded(isExpanded ? null : contact.name)}
                    aria-label={contact.name}
                  >
                    <span className="t-icon-swap" data-state={isExpanded ? "b" : "a"}>
                      <span className="t-icon" data-icon="a">
                        <HugeiconsIcon icon={ChevronDownIcon} size={14} strokeWidth={1.75} />
                      </span>
                      <span className="t-icon" data-icon="b">
                        <HugeiconsIcon icon={ChevronUpIcon} size={14} strokeWidth={1.75} />
                      </span>
                    </span>
                  </Button>
                  <Button size="sm" variant="outline">
                    <HugeiconsIcon icon={CheckIcon} size={14} strokeWidth={1.75} />
                    {t("inbox.resume")}
                  </Button>
                </div>

                {isExpanded ? (
                  <motion.div
                    initial={false}
                    animate={{ height: "auto", opacity: 1 }}
                    transition={{ type: "spring", stiffness: 300, damping: 25, mass: 0.8 }}
                    style={{ overflow: "hidden" }}
                  >
                    <div className="space-y-2 border-border border-t px-5 py-3 text-muted-foreground text-xs">
                      <p>
                        {t("inbox.phone")}: {contact.phone}
                      </p>
                      <p>
                        {t("inbox.source")}: {contact.source}
                      </p>
                      <p>
                        {t("inbox.status")}: {contact.status}
                      </p>
                      <p>
                        {t("inbox.notes")}: {contact.notes}
                      </p>
                      <div className="mt-3 flex gap-2 border-border border-t pt-2">
                        <Button size="sm" variant="outline">
                          <HugeiconsIcon icon={PencilEdit01Icon} size={14} strokeWidth={1.75} />
                          {t("inbox.edit")}
                        </Button>
                        <Button size="sm" variant="destructive">
                          <HugeiconsIcon icon={Delete01Icon} size={14} strokeWidth={1.75} />
                          {t("inbox.delete")}
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}
    </AppChrome>
  );
}
