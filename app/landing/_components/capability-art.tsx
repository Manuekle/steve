"use client";

/**
 * The scenes on the capability cards.
 *
 * Each one is a small built interface — panels, plates, a real icon, a chip —
 * assembled out of the app's own surfaces and staged inside the card. Not a
 * diagram of the feature: a fragment of the thing itself, caught at the moment
 * it does its job.
 *
 * ── Scenes fit ───────────────────────────────────────────────────────
 *
 * The stage is in flow and grows to hold what is in it. An earlier version
 * pinned every scene to `absolute inset-0`, so anything taller than its stage
 * was sliced by the card: rows cut through the middle, a calendar missing its
 * last week, an edge fade doing duty as a lid. That is what made the section
 * look unfinished, and no amount of edge treatment fixes a cropped drawing.
 *
 * So: nothing here overflows. A scene is composed to sit inside its card with
 * room around it, and the grid row equalises the cards beside it. Where that
 * meant fewer rows in a list — two documents instead of three, two leads
 * instead of three — the count came down. A scene that has to be cropped to
 * fit is a scene with too much in it.
 *
 * ── The motion contract ──────────────────────────────────────────────
 *
 * Everything animates on `group-hover` and nothing animates on its own. The
 * resting frame is the *before* and hover plays the *after* — the search
 * resolves, the lead lands, the slot is taken, the link is paid — so a card is
 * never mid-thought when still, and the one thing it has to say is the thing
 * the cursor asks for. `prefers-reduced-motion` cuts every transition in
 * globals.css, which leaves that resting frame, already complete.
 *
 * Icons are Hugeicons — the set the product itself uses, so a capability is
 * drawn with the same glyph its own page carries.
 */

import { HugeiconsIcon } from "@/components/icons/icon";
import {
  ArrowRight02Icon,
  BotIcon,
  Calendar03Icon,
  File01Icon,
  Link01Icon,
  MetaIcon,
  Mic01Icon,
  PlugSocketIcon,
  Search01Icon,
  Target01Icon,
  Tick02Icon,
  UserCircleIcon,
  Wallet01Icon,
  WebhookIcon,
} from "@hugeicons/core-free-icons";
import type { ReactNode } from "react";
import { at, Chip, Mono, Plate, Row, Scene, SwapPlate } from "./scene-kit";

// ── 01 · Conocimiento propio ────────────────────────────────────────

/**
 * A question going into the knowledge base and the document that answers it.
 *
 * Two results rather than three. The claim needs one thing it passed over to
 * be visible — "it found the right one" is about the ones it did not pick —
 * and one is enough to make that point inside a card this size.
 */
export function KnowledgeScene() {
  const docs = [
    { hit: true, name: "politica-devoluciones.pdf", score: "0.94" },
    { hit: false, name: "lista-precios-2026.xlsx", score: "0.31" },
  ];

  return (
    <Scene>
      <Row>
        <Plate active className="size-8" icon={Search01Icon} />
        <Mono className="min-w-0 flex-1 truncate text-muted-foreground/70 transition-colors duration-500 group-hover:text-foreground">
          ¿hacen devoluciones?
        </Mono>
        <Mono className="shrink-0 text-muted-foreground/40">2 docs</Mono>
      </Row>

      <div className="mt-2.5 space-y-2">
        {docs.map((doc, index) => (
          <Row
            className={`transition-colors duration-500 ${doc.hit ? "group-hover:border-input" : ""}`}
            key={doc.name}
            style={at(140 + index * 80)}
          >
            {doc.hit ? (
              <SwapPlate className="size-8" delay={200} from={File01Icon} to={Tick02Icon} />
            ) : (
              <Plate className="size-8" icon={File01Icon} />
            )}

            <Mono
              className={`min-w-0 flex-1 truncate transition-all duration-500 ${
                doc.hit
                  ? "text-muted-foreground/70 blur-[3px] group-hover:text-foreground group-hover:blur-none"
                  : "text-muted-foreground/50 group-hover:opacity-40"
              }`}
              style={at(160 + index * 80)}
            >
              {doc.name}
            </Mono>

            <Mono
              className={`shrink-0 tabular-nums transition-all duration-500 ${
                doc.hit
                  ? "translate-y-1 text-transparent group-hover:translate-y-0 group-hover:text-muted-foreground"
                  : "text-muted-foreground/30 group-hover:opacity-40"
              }`}
              style={at(240 + index * 80)}
            >
              {doc.score}
            </Mono>
          </Row>
        ))}
      </div>
    </Scene>
  );
}

// ── 02 · Pasar a una persona ────────────────────────────────────────

/**
 * The agent stopping, and the person picking it up.
 *
 * One gesture, so one row: the bot on the left, the person on the right, the
 * arrow between them. On hover the bot dims out of the conversation, the
 * person comes to full contrast, and the status the inbox actually shows lands
 * underneath. The handoff is drawn as a transfer of contrast.
 */
export function HandoffScene() {
  return (
    <Scene>
      <div className="flex flex-col items-center gap-4">
        <div className="flex items-center gap-4">
          <Plate
            className="size-11 rounded-xl transition-opacity duration-500 group-hover:opacity-40"
            icon={BotIcon}
            size={19}
          />
          <HugeiconsIcon
            className="text-muted-foreground/40 transition-transform duration-500 group-hover:translate-x-1"
            icon={ArrowRight02Icon}
            size={16}
            strokeWidth={2}
          />
          <span className="lp-plate flex size-11 items-center justify-center rounded-xl text-muted-foreground/70 transition-colors duration-500 group-hover:text-foreground">
            <HugeiconsIcon icon={UserCircleIcon} size={19} strokeWidth={1.75} />
          </span>
        </div>

        <Chip
          className="translate-y-2 text-muted-foreground opacity-0 transition-all duration-500 group-hover:translate-y-0 group-hover:opacity-100"
          style={at(220)}
        >
          Espera humano
        </Chip>
      </div>
    </Scene>
  );
}

// ── 03 · Agenda y turnos ────────────────────────────────────────────

/**
 * A week of slots with one of them taken.
 *
 * The grid is what a calendar looks like from across the room, and it is the
 * fastest read in the section. On hover one cell fills to full ink and the
 * booking confirms underneath. Everything else stays exactly where it was — a
 * booking is one cell changing, not a calendar redrawing.
 */
export function CalendarScene() {
  const cols = [0, 1, 2, 3, 4, 5, 6];
  const rows = [0, 1, 2];
  const taken = { col: 3, row: 1 };

  return (
    <Scene>
      <div className="lp-panel rounded-xl px-4 py-3.5">
        <div className="flex items-center gap-3">
          <Plate active className="size-8" icon={Calendar03Icon} />
          <Mono className="truncate text-muted-foreground/70 transition-colors duration-500 group-hover:text-foreground">
            esta semana
          </Mono>
          <Mono className="ml-auto shrink-0 text-muted-foreground/40">10:30</Mono>
        </div>

        <div className="mt-4 grid grid-cols-7 gap-1.5">
          {rows.map((row) =>
            cols.map((col) => {
              const isTaken = col === taken.col && row === taken.row;
              return (
                <span className="relative h-4" key={`${row}-${col}`}>
                  <span
                    className={`absolute inset-0 rounded-[4px] bg-muted-foreground/15 transition-opacity duration-500 ${
                      isTaken ? "group-hover:opacity-0" : ""
                    }`}
                  />
                  {isTaken ? (
                    <span
                      className="absolute inset-0 scale-90 rounded-[4px] bg-foreground opacity-0 transition-all duration-500 group-hover:scale-100 group-hover:opacity-100"
                      style={at(160)}
                    />
                  ) : null}
                </span>
              );
            }),
          )}
        </div>
      </div>

      <div className="mt-3 flex justify-center">
        <Chip
          className="translate-y-1 text-muted-foreground/40 opacity-60 transition-all duration-500 group-hover:translate-y-0 group-hover:text-muted-foreground group-hover:opacity-100"
          icon={Tick02Icon}
          style={at(300)}
        >
          Turno reservado · jue 10:30
        </Chip>
      </div>
    </Scene>
  );
}

// ── 04 · Leads de Meta Ads ──────────────────────────────────────────

/**
 * A campaign, and the leads it produced landing under it.
 *
 * At rest the two leads are held a little above their places and faded,
 * because they have not arrived yet. On hover they drop in one after another
 * and the first takes the chip that is the actual claim — the welcome message
 * went out with nobody watching.
 */
export function LeadsScene() {
  const leads = [
    { name: "Lucía Romero", when: "hace 2 min" },
    { name: "Diego Paz", when: "hace 6 min" },
  ];

  return (
    <Scene>
      <Row>
        <Plate active className="size-8" icon={MetaIcon} />
        <Mono className="min-w-0 flex-1 truncate text-muted-foreground/70 transition-colors duration-500 group-hover:text-foreground">
          Retargeting · carrito abandonado
        </Mono>
        <Mono className="shrink-0 text-muted-foreground/40">form</Mono>
      </Row>

      <div className="mt-2.5 space-y-2">
        {leads.map((lead, index) => (
          <Row
            className="-translate-y-1 opacity-40 transition-all duration-500 group-hover:translate-y-0 group-hover:opacity-100"
            key={lead.name}
            style={at(120 + index * 120)}
          >
            <Plate className="size-8" icon={UserCircleIcon} />
            <Mono className="min-w-0 flex-1 truncate text-foreground">{lead.name}</Mono>
            {index === 0 ? (
              <Chip
                className="shrink-0 text-muted-foreground opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                icon={Tick02Icon}
                style={at(480)}
              >
                1er mensaje
              </Chip>
            ) : (
              <Mono className="shrink-0 text-muted-foreground/40">{lead.when}</Mono>
            )}
          </Row>
        ))}
      </div>
    </Scene>
  );
}

// ── 05 · Cobrar por chat ────────────────────────────────────────────

/**
 * The link going out, and the money arriving.
 *
 * Two rows, because the claim has two halves and the second is the webhook —
 * the part nobody believes until they see it named. The status under the
 * figure swaps and the row's border comes up, which is exactly what the inbox
 * does when a payment confirms.
 */
export function PaymentsScene() {
  return (
    <Scene>
      <Row>
        <Plate active className="size-8" icon={Link01Icon} />
        <Mono className="min-w-0 flex-1 truncate text-muted-foreground/70 transition-colors duration-500 group-hover:text-foreground">
          pago.mercadopago.com/…
        </Mono>
        <Mono className="shrink-0 text-muted-foreground/40">enviado</Mono>
      </Row>

      <Row className="mt-2.5 transition-colors duration-500 group-hover:border-input">
        <SwapPlate className="size-8" delay={220} from={Wallet01Icon} to={Tick02Icon} />
        <span className="min-w-0 flex-1">
          <Mono className="block truncate text-foreground">$ 24.500</Mono>
          {/* Both statuses stacked in a fixed slot rather than swapped in flow,
              so the row does not change height mid-fade. */}
          <span className="relative mt-1 block h-3.5">
            <Mono className="absolute inset-0 text-muted-foreground/40 transition-opacity duration-500 group-hover:opacity-0">
              esperando el pago…
            </Mono>
            <Mono
              className="absolute inset-0 text-muted-foreground opacity-0 transition-opacity duration-500 group-hover:opacity-100"
              style={at(300)}
            >
              pagado · webhook confirmado
            </Mono>
          </span>
        </span>
      </Row>
    </Scene>
  );
}

// ── 06 · Agentes de voz ─────────────────────────────────────────────

/**
 * A call, and what is being said on it.
 *
 * At rest the waveform is low — the line is open and nobody is talking. On
 * hover it comes alive, bar by bar from the left, which is the one thing a
 * voice agent looks like. The heights are a fixed pattern rather than a random
 * one, so it is the same waveform every time the reader comes back.
 */
export function VoiceScene() {
  const bars = [42, 64, 100, 76, 92, 54, 80, 100, 68, 88, 50, 72, 46];

  return (
    <Scene>
      <div className="flex items-center gap-4">
        <Plate active className="size-11 rounded-xl" icon={Mic01Icon} size={19} />

        <div className="flex h-11 flex-1 items-center justify-between gap-1">
          {bars.map((height, index) => (
            <span
              className="w-1 origin-center scale-y-[0.55] rounded-full bg-muted-foreground/60 transition-transform duration-500 group-hover:scale-y-100"
              // biome-ignore lint/suspicious/noArrayIndexKey: a fixed, positional waveform
              key={index}
              style={{ ...at(index * 35), height: `${height}%` }}
            />
          ))}
        </div>
      </div>
    </Scene>
  );
}

// ── 07 · CRM y contactos ────────────────────────────────────────────

/**
 * A board, and a contact moving a column along it.
 *
 * Three columns is the smallest number that reads as a pipeline rather than as
 * two piles. On hover the card in the first column crosses into the second —
 * exactly one column, which is why the columns are a fixed width and the
 * travel is stated in the same unit rather than eyeballed.
 */
export function CrmScene() {
  return (
    <Scene>
      <div className="flex justify-center gap-2.5">
        {[0, 1, 2].map((column) => (
          <div
            className="flex h-[5.5rem] w-[5rem] flex-col gap-2 rounded-xl bg-muted/60 p-2"
            key={column}
          >
            {/* Headings of different widths, so three columns do not read as
                three copies of one column. */}
            <span
              className="h-[3px] rounded-full bg-muted-foreground/25"
              style={{ width: [22, 28, 18][column] }}
            />
            {column === 2 ? <span className="lp-plate h-6 rounded-lg" /> : null}
            {column === 0 ? (
              /* One column is 5rem plus a 0.625rem gap, so the travel is
                 exactly 5.625rem — stated, not eyeballed, or the card lands
                 between two columns. It is also the only one at full contrast:
                 the eye needs one thing to follow, not three. */
              <span className="lp-panel relative z-10 h-6 rounded-lg transition-transform duration-500 group-hover:translate-x-[5.625rem]" />
            ) : null}
            {column === 1 ? <span className="h-6 rounded-lg bg-card/70" /> : null}
          </div>
        ))}
      </div>
    </Scene>
  );
}

// ── 08 · Prospección ────────────────────────────────────────────────

/**
 * Two conversations, and where each one actually left the person.
 *
 * The stages are `PROSPECT_STAGES` verbatim — the same words the classifier in
 * `lib/prospect.ts` is allowed to answer with, so the card cannot promise a
 * vocabulary the model does not have. At rest both threads are unread; on
 * hover each takes its verdict, because the whole point is that nobody sat
 * down to tag them.
 */
export function ProspectScene() {
  const threads = [
    { stage: "ganado", who: "Lucía Romero" },
    { stage: "negociando", who: "Diego Paz" },
  ];

  return (
    <Scene>
      <div className="space-y-2">
        {threads.map((thread, index) => (
          <Row key={thread.who} style={at(index * 90)}>
            <Plate active={index === 0} className="size-8" icon={Target01Icon} />
            <Mono className="min-w-0 flex-1 truncate text-muted-foreground/70 transition-colors duration-500 group-hover:text-foreground">
              {thread.who}
            </Mono>
            {/* A fixed slot, so two chips of different lengths do not shuffle
                the rows as they arrive. */}
            <span className="relative h-6 w-[6.5rem] shrink-0">
              <span className="absolute inset-y-0 right-0 h-[3px] w-10 translate-y-2.5 rounded-full bg-muted-foreground/20 transition-opacity duration-500 group-hover:opacity-0" />
              <Chip
                className="absolute inset-y-0 right-0 translate-y-1 text-muted-foreground opacity-0 transition-all duration-500 group-hover:translate-y-0 group-hover:opacity-100"
                style={at(160 + index * 90)}
              >
                {thread.stage}
              </Chip>
            </span>
          </Row>
        ))}
      </div>
    </Scene>
  );
}

// ── 09 · Tu propia API ──────────────────────────────────────────────

/**
 * Two systems and the call between them.
 *
 * steve on the left, whatever you already run on the right, a hairline
 * connecting them. On hover the request slides the length of the wire, the far
 * plate lights, and the response lands underneath as a status line. The
 * allowlist is the subject, so the route is spelled out rather than implied.
 */
export function ApiScene() {
  return (
    <Scene>
      {/* A measure on the full-width card. Left to stretch, the wire ran the
          whole row and the request crossing it read as a loading bar. */}
      <div className="mx-auto w-full max-w-[30rem]">
        <div className="flex items-center justify-between">
          <div className="flex flex-col items-center gap-2">
            <Plate active className="size-12 rounded-xl" icon={PlugSocketIcon} size={21} />
            <Mono className="text-muted-foreground/60">steve</Mono>
          </div>

          {/* The chip travels from the near end to `100% - its own width`, so
              it finishes flush against the far plate at any card width instead
              of overshooting on a wide one. */}
          <div className="relative mx-4 h-px flex-1 bg-border">
            <Chip
              className="absolute -top-4 left-0 text-muted-foreground/50 opacity-60 transition-all duration-500 group-hover:left-[calc(100%-5.5rem)] group-hover:text-muted-foreground group-hover:opacity-100"
              style={at(80)}
            >
              GET /stock
            </Chip>
          </div>

          <div className="flex flex-col items-center gap-2">
            <span className="lp-plate flex size-12 items-center justify-center rounded-xl text-muted-foreground/70 transition-colors duration-500 group-hover:text-foreground">
              <HugeiconsIcon icon={WebhookIcon} size={21} strokeWidth={1.75} />
            </span>
            <Mono className="text-muted-foreground/60">tu API</Mono>
          </div>
        </div>

        <div className="mt-5 flex justify-center">
          <Chip
            className="translate-y-2 text-muted-foreground opacity-0 transition-all duration-500 group-hover:translate-y-0 group-hover:opacity-100"
            icon={Tick02Icon}
            style={at(520)}
          >
            200 · 6 unidades en stock
          </Chip>
        </div>
      </div>
    </Scene>
  );
}

export const CAPABILITY_ART: Record<string, () => ReactNode> = {
  knowledge: KnowledgeScene,
  handoff: HandoffScene,
  calendar: CalendarScene,
  leads: LeadsScene,
  payments: PaymentsScene,
  voice: VoiceScene,
  crm: CrmScene,
  prospect: ProspectScene,
  api: ApiScene,
};
