"use client";

import type { CSSProperties } from "react";
import { Badge } from "@/components/ui/badge";
import { useT } from "@/lib/i18n/provider";
import { Haze, Reveal, Shell } from "./primitives";

/**
 * What the people using it say, as a wall that drifts.
 *
 * Three columns scrolling on their own, the middle one against the other two,
 * fading and blurring out at the top and the bottom. The asymmetry is the
 * whole effect: three columns moving the same way is a conveyor belt, and one
 * moving against them is what makes the wall read as a room full of people
 * talking rather than a list being fed past you.
 *
 * The page argued against a marquee once, on the grounds that a quote sliding
 * past is a quote nobody finishes. That still holds — which is why the entire
 * wall stops on hover. The drift is what gets you to look; stopping is what
 * lets you read. Either half alone is the mistake.
 *
 * The heading and the note sit on the left and hold still, so the section
 * still has a fixed place to start reading.
 *
 * ── Read this before shipping ────────────────────────────────────────
 *
 * `SAMPLES` is `true`, and while it is, the section says so on the page: these
 * quotes are written placeholders, not real customers, and the wall carries a
 * «Muestra» badge saying exactly that. A landing page that prints invented
 * praise is a fabricated review whichever way you look at it, and the moment
 * it is not labelled, it is one being passed off as genuine.
 *
 * To ship real ones: replace `TESTIMONIALS`, and set `SAMPLES` to `false`. The
 * badge and the note disappear on their own.
 */

const SAMPLES = true;

type Testimonial = {
  /**
   * Who they are, as they would want to be named on a public page. Optional:
   * the samples have no name, and a bare «—» over the role reads as a field
   * that failed to load. Without one the role stands as the attribution, which
   * is also how a customer who agreed to be quoted but not named appears.
   */
  readonly name?: string;
  readonly quote: string;
  /** Role and business — the half of an attribution that carries the weight. */
  readonly role: string;
};

/* Not in the dictionary on purpose: placeholder copy does not belong in the
   shipped translation files, and a real testimonial is a quote — published in
   the words it was said in, not in two languages.

   Nine rather than six: three columns of two look like a grid that failed to
   fill, and the wall needs enough in each track that the loop is not obvious. */
const TESTIMONIALS: readonly Testimonial[] = [
  {
    quote:
      "Antes contestábamos los mensajes de Instagram al día siguiente. Ahora el que escribe a las once de la noche ya tiene precio, stock y el link de pago cuando nos levantamos.",
    role: "Tienda de indumentaria · 2 locales",
  },
  {
    quote:
      "Lo que me convenció fue que no inventa. Si la respuesta no está en los documentos que subí, pasa la conversación a una persona y me deja la nota. Prefiero eso mil veces a un bot que improvisa precios.",
    role: "Distribuidora mayorista",
  },
  {
    quote:
      "Los leads de las campañas entraban a una planilla que nadie miraba. Ahora entran al CRM con la campaña de la que vinieron y salen con el primer mensaje solos.",
    role: "Agencia de performance",
  },
  {
    quote:
      "Los turnos son el 80% de lo que nos preguntan. Que consulte el calendario y reserve dentro del mismo chat nos sacó dos horas por día de encima.",
    role: "Centro de estética",
  },
  {
    quote:
      "Corre en nuestro propio servidor, contra nuestra base. Para el área legal eso fue la diferencia entre aprobarlo y no aprobarlo.",
    role: "Servicios profesionales · Enterprise",
  },
  {
    quote:
      "Armar la automatización conversando y que quede en borrador hasta que la apruebo es lo que hizo que la usara el equipo y no sólo yo.",
    role: "Ecommerce de nicho",
  },
  {
    quote:
      "El link de pago dentro de la conversación nos subió el cierre. Antes mandábamos un alias por WhatsApp y la mitad se caía ahí.",
    role: "Venta de equipamiento",
  },
  {
    quote:
      "Que califique solo cada conversación nos ordenó el mes. Abro el CRM y ya sé cuáles valen una llamada.",
    role: "Inmobiliaria",
  },
  {
    quote:
      "Lo probamos con el agente de voz para los turnos, y la transcripción de cada llamada queda guardada. Eso solo nos ahorró discusiones.",
    role: "Consultorio odontológico",
  },
];

/** The initials plate the app uses for a contact with no photo. */
function Avatar({ label }: { readonly label: string }) {
  const initials =
    label
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0])
      .join("")
      .toUpperCase() || "·";

  return (
    <span className="lp-plate flex size-9 shrink-0 items-center justify-center rounded-xl font-medium text-[12.5px] text-muted-foreground">
      {initials}
    </span>
  );
}

function Quote({
  echo,
  testimonial,
}: {
  /** The second, duplicated pass. Hidden from a screen reader: it is the same
   *  quote again, and the wall should be heard once. */
  readonly echo?: boolean;
  readonly testimonial: Testimonial;
}) {
  return (
    <figure
      aria-hidden={echo ? "true" : undefined}
      className="lp-cap lp-cap-still flex-col p-6 sm:p-7"
    >
      <blockquote className="text-[15px] leading-[1.65] text-foreground">
        <span aria-hidden="true" className="text-muted-foreground/40">
          “
        </span>
        {testimonial.quote}
        <span aria-hidden="true" className="text-muted-foreground/40">
          ”
        </span>
      </blockquote>
      <figcaption className="mt-6 flex items-center gap-3 border-border border-t pt-5">
        <Avatar label={testimonial.name ?? testimonial.role} />
        <span className="min-w-0">
          <span className="block line-clamp-2 font-medium text-[13.5px] leading-snug text-foreground">
            {testimonial.name ?? testimonial.role}
          </span>
          {testimonial.name ? (
            <span className="block line-clamp-1 text-[12.5px] text-muted-foreground">
              {testimonial.role}
            </span>
          ) : null}
        </span>
      </figcaption>
    </figure>
  );
}

/**
 * One drifting column. `items` is rendered twice — the animation travels
 * exactly half the track, so the second copy lands where the first began and
 * the loop has no seam.
 *
 * `offset` starts a column part-way down rather than flush with its
 * neighbours. Three columns beginning level and drifting at one speed read as
 * a single block sliding; the stagger is what makes them three columns.
 */
function Column({
  dir,
  duration,
  items,
  offset,
}: {
  readonly dir: "up" | "down";
  readonly duration: string;
  readonly items: readonly Testimonial[];
  readonly offset: string;
}) {
  return (
    <div className="min-w-0" style={{ paddingTop: offset }}>
      <div
        className="lp-wall-track"
        data-dir={dir}
        style={{ "--lp-drift": duration } as CSSProperties}
      >
        {items.map((testimonial) => (
          <Quote key={testimonial.quote} testimonial={testimonial} />
        ))}
        {/* The second pass, flat in the same track rather than inside a
            wrapper. A wrapper made the track four children where the loop
            needs six: `-50%` of a four-child track is not where the second
            copy starts, and the column jumped by half a gap every lap. */}
        {items.map((testimonial) => (
          <Quote echo key={`${testimonial.quote}-echo`} testimonial={testimonial} />
        ))}
      </div>
    </div>
  );
}

/**
 * Two fixed tracks, not three.
 *
 * Three columns split the 632px this half of the section gets into 200px
 * each, and a quote in a 200px column is six words to a line in a card that
 * looks like a phone notification — the wall read as small print rather than
 * as people talking. Two columns give a card 300px and a quote a real measure.
 *
 * Different durations as well as different directions: two columns at the same
 * speed stay in lockstep however they are offset.
 */
const TRACKS = [
  { dir: "up", duration: "56s", offset: "0rem" },
  { dir: "down", duration: "68s", offset: "3rem" },
] as const;

export function TestimonialsSection() {
  const t = useT();

  // Dealt round-robin so no column is all short quotes or all long ones, which
  // is what would make the wall look sorted.
  const columns = [0, 1].map((column) => TESTIMONIALS.filter((_, index) => index % 2 === column));

  return (
    <section id="testimonios" className="scroll-mt-20 border-border border-t py-24 sm:py-32">
      <Shell>
        <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:gap-14">
          {/* The half that holds still. */}
          <div className="lg:sticky lg:top-28">
            <Reveal>
              <p className="lp-eyebrow">Fig 07</p>
              <h2 className="mt-4 max-w-[16ch] text-balance font-cooper font-heading font-semibold text-[clamp(2rem,4.4vw,3rem)] text-foreground leading-[1.02] tracking-[-0.03em]">
                {t("landing.testimonials.titleLine1")} {t("landing.testimonials.titleLine2")}
              </h2>
              <p className="mt-5 max-w-[38ch] text-[15px] leading-relaxed text-muted-foreground">
                {t("landing.testimonials.body")}
              </p>
            </Reveal>

            {SAMPLES && TESTIMONIALS.length > 0 ? (
              <Reveal delay={70}>
                <div className="mt-8 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-dashed border-muted-foreground/40 px-4 py-3">
                  <Badge variant="secondary">{t("landing.testimonials.sampleBadge")}</Badge>
                  <p className="max-w-[36ch] text-[12.5px] leading-relaxed text-muted-foreground">
                    {t("landing.testimonials.sampleNote")}
                  </p>
                </div>
              </Reveal>
            ) : null}
          </div>

          {TESTIMONIALS.length === 0 ? (
            <Reveal delay={60}>
              <div className="rounded-2xl border border-dashed border-muted-foreground/40 px-6 py-8 text-center">
                <p className="font-medium text-sm text-muted-foreground">
                  {t("landing.testimonials.empty")}
                </p>
                <p className="mt-1 text-[13px] text-muted-foreground/70">
                  {t("landing.testimonials.emptyHint")}
                </p>
              </div>
            </Reveal>
          ) : (
            <Reveal delay={80} lift={false}>
              {/* A fixed height rather than an aspect ratio: the wall is a
                  window onto a longer list, and how tall the window is has
                  nothing to do with how wide the columns happen to be. */}
              <div className="lp-wall h-[30rem] sm:h-[34rem]">
                <Haze edge="top" />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {columns.map((items, index) => (
                    <Column
                      dir={TRACKS[index].dir}
                      duration={TRACKS[index].duration}
                      items={items}
                      // biome-ignore lint/suspicious/noArrayIndexKey: three fixed positional tracks
                      key={index}
                      offset={TRACKS[index].offset}
                    />
                  ))}
                </div>
                <Haze edge="bottom" />
              </div>
            </Reveal>
          )}
        </div>
      </Shell>
    </section>
  );
}
