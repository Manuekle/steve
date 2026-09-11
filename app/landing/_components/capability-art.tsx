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
  Blockchain05Icon,
  Search01Icon,
  Target01Icon,
  Tick02Icon,
  UserCircleIcon,
  Wallet01Icon,
  WebhookIcon,
} from "@hugeicons/core-free-icons";
import type { ReactNode } from "react";
import { at, Bloom, Brackets, Chip, Figure, Mono, Plate, Row, Scene, SwapPlate } from "./scene-kit";

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
      {/* The light is on the answer, not on the question: the bloom sits over
          the first result, which is the row the scene is arguing about. */}
      <Bloom className="top-8 left-0 h-32 w-64 opacity-70 transition-opacity duration-700 group-hover:opacity-100" />

      <Row>
        <Plate active className="size-8" icon={Search01Icon} tint="blue" />
        <Mono className="min-w-0 flex-1 truncate text-muted-foreground transition-colors duration-500 group-hover:text-foreground">
          ¿hacen devoluciones?
        </Mono>
        <Mono className="shrink-0 text-muted-foreground">2 docs</Mono>
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
                  ? "text-muted-foreground blur-[3px] group-hover:text-foreground group-hover:blur-none"
                  : "text-muted-foreground group-hover:opacity-40"
              }`}
              style={at(160 + index * 80)}
            >
              {doc.name}
            </Mono>

            <Mono
              className={`shrink-0 tabular-nums transition-all duration-500 ${
                doc.hit
                  ? "translate-y-1 text-transparent group-hover:translate-y-0 group-hover:text-muted-foreground"
                  : "text-muted-foreground group-hover:opacity-40"
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
        {/* One bloom, and it moves. The handoff is a transfer, so the light
            travels the same distance the conversation does — it starts over
            the bot and ends over the person. Two blooms, one per plate, would
            say both are lit and the card would have no subject.

            It hangs off the row, not off the scene. The scene is as tall as
            the grid row and centres what is in it, so a bloom placed from the
            scene's own top ended up wherever the row happened to leave it —
            on a tall row, a pool of light floating above the plates it was
            supposed to be on. Anchored here, the two plates are 5.75rem apart
            whatever the card does, and the travel is that number. */}
        <div className="relative flex items-center gap-4">
          <Bloom className="-translate-x-1/2 -translate-y-1/2 top-1/2 left-[calc(50%-2.875rem)] h-32 w-32 transition-[translate] duration-700 group-hover:translate-x-[calc(-50%+5.75rem)]" />

          <Plate
            className="size-11 rounded-xl transition-opacity duration-500 group-hover:opacity-40"
            icon={BotIcon}
            size={19}
            tint="violet"
          />
          <HugeiconsIcon
            className="text-muted-foreground transition-transform duration-500 group-hover:translate-x-1"
            icon={ArrowRight02Icon}
            size={16}
            strokeWidth={2}
          />
          <span className="lp-plate flex size-11 items-center justify-center rounded-xl text-muted-foreground transition-colors duration-500 group-hover:text-foreground">
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
      {/* Under the cell that gets taken, not over the whole week. */}
      <Bloom className="bottom-8 left-[46%] h-24 w-40" />

      <div className="lp-panel relative rounded-xl px-4 py-3.5">
        {/* The grain of the surface the week is printed on. It is the one
            texture in the section, and it is here because a calendar is the
            one scene that is mostly empty rectangle: without it the panel is a
            flat swatch with dots of ink on it. */}
        <span aria-hidden="true" className="lp-dots pointer-events-none absolute inset-0 rounded-xl opacity-40" />
        <div className="flex items-center gap-3">
          <Plate active className="size-8" icon={Calendar03Icon} tint="amber" />
          <Mono className="truncate text-muted-foreground transition-colors duration-500 group-hover:text-foreground">
            esta semana
          </Mono>
          <Mono className="ml-auto shrink-0 text-muted-foreground">10:30</Mono>
        </div>

        <div className="relative mt-4 grid grid-cols-7 gap-1.5">
          {rows.map((row) =>
            cols.map((col) => {
              const isTaken = col === taken.col && row === taken.row;
              return (
                <span className="relative h-4" key={`${row}-${col}`}>
                  <span
                    className={`absolute inset-0 rounded-[4px] bg-[var(--lp-glass)] shadow-[inset_0_0_0_1px_var(--lp-glass-edge)] transition-opacity duration-500 ${
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
          className="translate-y-1 text-muted-foreground opacity-60 transition-all duration-500 group-hover:translate-y-0 group-hover:text-muted-foreground group-hover:opacity-100"
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
      {/* On the campaign row: the leads fall out of it, so that is where the
          light enters the scene. */}
      <Bloom className="-top-4 left-4 h-32 w-56 opacity-80 transition-opacity duration-700 group-hover:opacity-100" />

      <Row>
        <Plate active className="size-8" icon={MetaIcon} tint="rose" />
        <Mono className="min-w-0 flex-1 truncate text-muted-foreground transition-colors duration-500 group-hover:text-foreground">
          Retargeting · carrito abandonado
        </Mono>
        <Mono className="shrink-0 text-muted-foreground">form</Mono>
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
              <Mono className="shrink-0 text-muted-foreground">{lead.when}</Mono>
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
        <Plate active className="size-8" icon={Link01Icon} tint="emerald" />
        <Mono className="min-w-0 flex-1 truncate text-muted-foreground transition-colors duration-500 group-hover:text-foreground">
          pago.mercadopago.com/…
        </Mono>
        <Mono className="shrink-0 text-muted-foreground">enviado</Mono>
      </Row>

      {/* The amount is the scene, so it is drawn at the size the thing
          deserves rather than as another 10px mono label in another row. Two
          rows of identical furniture was the card saying "here is a list";
          one row and a figure is the card saying "this arrived". */}
      <div className="relative mt-6 flex items-end gap-4">
        <Bloom className="-bottom-8 -left-8 h-40 w-56 opacity-40 transition-opacity duration-700 group-hover:opacity-100" />

        <span className="min-w-0">
          <Figure className="block text-[clamp(2.25rem,5vw,3.25rem)]">
            <span className="mr-1 align-top text-[0.42em] leading-[2.2]">$</span>
            24.500
          </Figure>

          {/* Both statuses stacked in a fixed slot rather than swapped in
              flow, so nothing changes height mid-fade. */}
          <span className="relative mt-3 block h-3.5">
            <Mono className="absolute inset-0 text-muted-foreground transition-opacity duration-500 group-hover:opacity-0">
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

        <SwapPlate className="mb-1.5 size-9" delay={220} from={Wallet01Icon} size={16} to={Tick02Icon} />
      </div>
    </Scene>
  );
}

// ── 06 · Agentes de voz ─────────────────────────────────────────────

/** The line's own geometry, in the units its `viewBox` is written in.
 *
 *  Wider than it will ever be drawn, on purpose. `slice` scales to cover, so
 *  whichever axis is relatively tighter is the one that gets cropped: a
 *  viewBox this much wider than the card's own ratio guarantees that axis is
 *  the horizontal, and the wave runs off the right edge instead of having its
 *  peaks sheared off the top. */
const WAVE_W = 360;
const WAVE_H = 72;
/** Peak travel from the centreline. Short of `WAVE_H / 2` on purpose: a
 *  Catmull-Rom overshoots a little between points, and the headroom is what
 *  keeps the tallest peak from being flattened against the top of the box. */
const WAVE_A = 30;

/** Eleven heights, −1 (floor) to 1 (ceiling). Fixed rather than random, so it
 *  is the same voice every time the reader comes back, and enough of them that
 *  the part the card has room for still carries the whole shape: a shoulder, a
 *  deep trough, the peak the call is about, and the fall out of it. */
const WAVE = [0.9, 0.3, -0.9, 0.25, 0.45, 1, -0.6, -0.25, 0.55, -0.35, 0.4] as const;

/** The halo, painted as blurred copies of the line beneath the crisp one.
 *
 *  Three of them rather than one: a single blur is a soft edge, and what the
 *  eye reads as *light* is the near-exponential falloff you only get by
 *  stacking a tight bright one on a wide faint one. Stroke widths grow with
 *  the blur so each layer has something to smear. */
const WAVE_GLOW = [
  { blur: 18, opacity: 0.22, width: 4 },
  { blur: 7, opacity: 0.34, width: 2.5 },
  { blur: 2, opacity: 0.5, width: 1.25 },
] as const;

/**
 * A smooth line through evenly spaced heights, as one path.
 *
 * Catmull-Rom written out as cubic béziers: the tangent at every point is the
 * slope between its neighbours, which is what makes the curve pass *through*
 * each height instead of being tugged off it the way hand-placed control
 * points would. That matters here because the heights are the content — they
 * are what the drawing is of — and a spline that misses them is a different
 * waveform than the one the array says.
 */
function wavePath(values: readonly number[]): string {
  const step = WAVE_W / (values.length - 1);
  const pts = values.map((v, i) => [i * step, WAVE_H / 2 - v * WAVE_A] as const);
  const n = (value: number) => Math.round(value * 100) / 100;

  let d = `M${n(pts[0][0])} ${n(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    d += ` C${n(p1[0] + (p2[0] - p0[0]) / 6)} ${n(p1[1] + (p2[1] - p0[1]) / 6)}`;
    d += ` ${n(p2[0] - (p3[0] - p1[0]) / 6)} ${n(p2[1] - (p3[1] - p1[1]) / 6)}`;
    d += ` ${n(p2[0])} ${n(p2[1])}`;
  }
  return d;
}

/**
 * A call, and what is being said on it.
 *
 * One continuous line rather than a row of bars. Bars are what a level meter
 * looks like; a line is what a voice looks like, and it is the only drawing in
 * the section that emits its own light instead of being lit by the card's
 * lamp — which is the right way round for a card about sound coming down a
 * wire.
 *
 * At rest the line is nearly flat: the call is connected and nobody is
 * talking. On hover it comes up to full travel in one move, because a voice
 * does not arrive left to right — the whole line moves at once.
 */
export function VoiceScene() {
  const d = wavePath(WAVE);

  return (
    <Scene>
      {/* The lamp is the microphone, and now only the microphone: the line
          carries its own glow. Centred on the plate, which is 3.125rem in:
          half the bloom's own width less that leaves it 0.75rem to the left of
          the scene. It used to hang a full 1.5rem out, far enough that the
          card's crop took a straight edge off the side of the glow. */}
      <Bloom className="-translate-y-1/2 top-1/2 left-[-0.75rem] h-32 w-32" />

      <div className="flex items-center gap-4">
        <Plate active className="size-11 rounded-xl" icon={Mic01Icon} size={19} tint="cyan" />

        {/* `slice`, not a stretch. Fitting the box would squash the curve at
            narrow widths and stretch the glow with it; slicing keeps the wave
            at the shape it was drawn and lets the right-hand end run off the
            card, which is what stops the drawing reading as an icon centred in
            a box. The negative margin cancels the scene's own right padding so
            the line reaches the card's edge.

            `overflow-visible` is what decides *which* edge does the cutting.
            An SVG viewport clips by default, and the glow is wider than the
            line it belongs to — so the box was taking a straight-sided bite
            out of the halo a good 20px before the card did, which is a lit
            rectangle sitting in the middle of a dark card. Let the drawing
            out of its own box and the only thing that crops it is the card,
            at the edge the line is already running off. */}
        <svg
          aria-hidden="true"
          className="-mr-7 h-20 min-w-0 flex-1 overflow-visible text-foreground/45 transition-colors duration-700 group-hover:text-foreground"
          preserveAspectRatio="xMinYMid slice"
          viewBox={`0 0 ${WAVE_W} ${WAVE_H}`}
        >
          {/* `view-box` rather than the default: the origin has to be the
              centreline of the drawing, and the path's own bounding box is not
              centred on it. */}
          <g
            className="origin-center scale-y-[0.18] transition-transform duration-700 ease-out group-hover:scale-y-100"
            style={{ transformBox: "view-box" }}
          >
            {WAVE_GLOW.map((layer) => (
              <path
                d={d}
                fill="none"
                key={layer.blur}
                stroke="currentColor"
                strokeLinecap="round"
                strokeOpacity={layer.opacity}
                strokeWidth={layer.width}
                style={{ filter: `blur(${layer.blur}px)` }}
                vectorEffect="non-scaling-stroke"
              />
            ))}

            {/* The line itself. One device pixel whatever the card's width
                does to the viewBox — a hairline is the whole look, and a
                hairline that scales is a smudge at some widths. */}
            <path
              d={d}
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          </g>
        </svg>
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
      {/* Over the second column — where the card is going, not where it is. */}
      <Bloom className="top-2 left-[50%] h-28 w-32" />

      <div className="flex justify-center gap-2.5">
        {[0, 1, 2].map((column) => (
          <div
            className="flex h-[5.5rem] w-[5rem] flex-col gap-2 rounded-xl bg-[var(--lp-glass)] p-2 shadow-[inset_0_0_0_1px_var(--lp-glass-edge)]"
            key={column}
          >
            {/* Headings of different widths, so three columns do not read as
                three copies of one column. */}
            <span
              className="h-[3px] rounded-full bg-foreground/20"
              style={{ width: [22, 28, 18][column] }}
            />
            {column === 2 ? <span className="lp-plate h-6 rounded-lg opacity-70" /> : null}
            {column === 0 ? (
              /* One column is 5rem plus a 0.625rem gap, so the travel is
                 exactly 5.625rem — stated, not eyeballed, or the card lands
                 between two columns. It is also the only one at full contrast:
                 the eye needs one thing to follow, not three. */
              <span
                className="relative z-10 h-6 rounded-lg bg-[var(--lp-glass-lit)] shadow-[inset_0_0_0_1px_var(--lp-glass-edge-lit),0_0_18px_-6px_var(--lp-halo)] transition-transform duration-500 group-hover:translate-x-[5.625rem]"
              />
            ) : null}
            {column === 1 ? (
              <span className="h-6 rounded-lg bg-[var(--lp-glass)] opacity-60" />
            ) : null}
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
      <Bloom className="-top-2 left-2 h-28 w-48" />

      <div className="space-y-2">
        {threads.map((thread, index) => (
          <Row key={thread.who} style={at(index * 90)}>
            <Plate active={index === 0} className="size-8" icon={Target01Icon} />
            <Mono className="min-w-0 flex-1 truncate text-muted-foreground transition-colors duration-500 group-hover:text-foreground">
              {thread.who}
            </Mono>
            {/* A fixed slot, so two chips of different lengths do not shuffle
                the rows as they arrive. */}
            <span className="relative h-6 w-[6.5rem] shrink-0">
              <span className="absolute inset-y-0 right-0 h-[3px] w-10 translate-y-2.5 rounded-full bg-foreground/12 transition-opacity duration-500 group-hover:opacity-0" />
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
 * senka on the left, whatever you already run on the right, a hairline
 * connecting them. On hover the request slides the length of the wire, the far
 * plate lights, and the response lands underneath as a status line. The
 * allowlist is the subject, so the route is spelled out rather than implied.
 */
export function ApiScene() {
  return (
    <Scene>
      {/* A measure on the full-width card. Left to stretch, the wire ran the
          whole row and the request crossing it read as a loading bar. */}
      <div className="relative mx-auto w-full max-w-[30rem]">
        {/* The measured region, marked the way a drawing marks one: four
            corners rather than a box. What is between them is the claim —
            two systems and one call. */}
        <Brackets className="-inset-x-3 -top-3 bottom-9" />
        <Bloom className="-right-2 top-0 h-28 w-32 opacity-0 transition-opacity duration-700 group-hover:opacity-100" />

        <div className="flex items-center justify-between">
          <div className="flex flex-col items-center gap-2">
            <Plate active className="size-12 rounded-xl" icon={Blockchain05Icon} size={21} />
            <Mono className="text-muted-foreground">senka</Mono>
          </div>

          {/* The chip travels from the near end to `100% - its own width`, so
              it finishes flush against the far plate at any card width instead
              of overshooting on a wide one. */}
          <div className="relative mx-4 h-px flex-1 bg-border">
            <Chip
              className="absolute -top-4 left-0 text-muted-foreground opacity-60 transition-all duration-500 group-hover:left-[calc(100%-5.5rem)] group-hover:text-muted-foreground group-hover:opacity-100"
              style={at(80)}
            >
              GET /stock
            </Chip>
          </div>

          <div className="flex flex-col items-center gap-2">
            <span className="lp-plate flex size-12 items-center justify-center rounded-xl text-muted-foreground transition-colors duration-500 group-hover:text-foreground">
              <HugeiconsIcon icon={WebhookIcon} size={21} strokeWidth={1.75} />
            </span>
            <Mono className="text-muted-foreground">tu API</Mono>
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
