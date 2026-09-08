"use client";

// components/motion — la capa con física. Todo lo de aquí respeta
// prefers-reduced-motion; varios además dejan de animar en cuanto el puntero
// no es un ratón (use-hover-capable), porque un hover en táctil no existe.

import { useState } from "react";
import { HugeiconsIcon } from "@/components/icons/icon";
import { Mail01Icon } from "@hugeicons/core-free-icons";
import { ActionSwapButton } from "@/components/motion/action-swap";
import { Checkbox } from "@/components/motion/checkbox";
import { Input as MotionInput } from "@/components/motion/input";
import { RadioGroup, RadioGroupItem } from "@/components/motion/radio";
import { TextReveal } from "@/components/motion/text-reveal";
import { TextShimmer } from "@/components/motion/text-shimmer";
import { ThemeToggle } from "@/components/motion/theme-toggle";
import { ThinkingText } from "@/components/motion/thinking-text";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast-provider";
import type { Section } from "../_lib/types";

// ── Hosts con estado ────────────────────────────────────────────────

function CheckboxDemo() {
  const [checked, setChecked] = useState(true);
  const [partial, setPartial] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <Checkbox checked={checked} onCheckedChange={setChecked} label="Responder fuera de horario" />
      <Checkbox
        checked={partial}
        onCheckedChange={setPartial}
        indeterminate={!partial}
        label="Algunos canales activos"
      />
      <Checkbox checked disabled onCheckedChange={() => {}} label="Bloqueado" />
    </div>
  );
}

function RadioDemo() {
  const [value, setValue] = useState("auto");
  return (
    <RadioGroup value={value} onValueChange={setValue}>
      <RadioGroupItem value="auto" label="Responder siempre" />
      <RadioGroupItem value="hours" label="Solo en horario" />
      <RadioGroupItem value="off" label="Nunca" disabled />
    </RadioGroup>
  );
}

function MotionInputDemo() {
  const [value, setValue] = useState("");
  const invalid = value.length > 0 && !value.includes("@");
  return (
    <div className="w-full max-w-sm">
      <MotionInput
        label="Correo"
        value={value}
        onChange={setValue}
        error={invalid ? "Eso no parece un correo." : false}
        success={value.includes("@")}
        leftIcon={<HugeiconsIcon icon={Mail01Icon} size={16} strokeWidth={1.75} />}
        placeholder="nombre@empresa.com"
      />
    </div>
  );
}

function ToastDemo() {
  const { toast } = useToast();
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" onClick={() => toast({ title: "Guardado", status: "success" })}>
        success
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => toast({ title: "Sincronizando…", status: "loading" })}
      >
        loading
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() =>
          toast({
            title: "No se pudo conectar",
            description: "Revisa el App Secret en Ajustes.",
            status: "error",
          })
        }
      >
        error
      </Button>
      <Button size="sm" variant="ghost" onClick={() => toast({ title: "Nada que hacer", status: "info" })}>
        info
      </Button>
    </div>
  );
}

// ── Sección ─────────────────────────────────────────────────────────

export const motionSection: Section = {
  id: "motion",
  title: "Movimiento",
  desc:
    "components/motion — controles con muelle, texto que entra y botones con "
    + "estado. Nada de aquí anima bajo prefers-reduced-motion, y los efectos de "
    + "hover se apagan solos en dispositivos sin puntero.",
  entries: [
    {
      id: "motion-checkbox",
      name: "Checkbox",
      source: "components/motion/checkbox.tsx",
      importLine: 'import { Checkbox } from "@/components/motion/checkbox";',
      desc:
        "Casilla con la marca dibujándose. El <input> real sigue debajo, así que "
        + "el clic en la etiqueta y el teclado son los nativos.",
      props: [
        { name: "checked", type: "boolean", required: true, desc: "Controlado." },
        { name: "onCheckedChange", type: "(checked: boolean) => void", required: true, desc: "" },
        { name: "indeterminate", type: "boolean", desc: "Dibuja el guion del estado parcial." },
        { name: "label", type: "string", desc: "Texto a la derecha; también es el destino del clic." },
        { name: "disabled", type: "boolean", desc: "" },
        { name: 'aria-describedby', type: "string", desc: "Asocia un mensaje externo, por ejemplo un error de formulario." },
      ],
      demos: [
        {
          id: "motion-checkbox-basic",
          title: "Marcado, parcial y bloqueado",
          code: `const [checked, setChecked] = useState(true);

<Checkbox checked={checked} onCheckedChange={setChecked} label="Responder fuera de horario" />`,
          render: <CheckboxDemo />,
        },
      ],
    },
    {
      id: "motion-radio",
      name: "RadioGroup",
      source: "components/motion/radio.tsx",
      importLine: 'import { RadioGroup, RadioGroupItem } from "@/components/motion/radio";',
      desc: "Una sola opción de varias, con el punto interior escalando al elegir.",
      exports: ["RadioGroup", "RadioGroupItem"],
      props: [
        { name: "value / defaultValue", type: "string", desc: "Controlado o no." },
        { name: "onValueChange", type: "(value: string) => void", desc: "" },
        { name: "orientation", type: '"vertical" | "horizontal"', def: '"vertical"', desc: "" },
        { name: "value (Item)", type: "string", required: true, desc: "" },
        { name: "label (Item)", type: "string", desc: "" },
      ],
      demos: [
        {
          id: "motion-radio-basic",
          title: "Vertical",
          code: `<RadioGroup value={value} onValueChange={setValue}>
  <RadioGroupItem value="auto" label="Responder siempre" />
  <RadioGroupItem value="hours" label="Solo en horario" />
</RadioGroup>`,
          render: <RadioDemo />,
        },
      ],
    },
    {
      id: "motion-input",
      name: "Input (motion)",
      source: "components/motion/input.tsx",
      importLine: 'import { Input } from "@/components/motion/input";',
      desc:
        "Campo con etiqueta flotante, iconos a los lados y sacudida al fallar. Es "
        + "el de los formularios de la landing; dentro de la app el de "
        + "components/ui/input es el que manda.",
      props: [
        { name: "label", type: "string", desc: "Etiqueta que sube al enfocar." },
        { name: "value / onChange", type: "string / (value: string) => void", desc: "onChange recibe el valor, no el evento." },
        { name: "error", type: "string | boolean", desc: "Truthy sacude y pinta en rojo; si es string, además lo muestra." },
        { name: "success", type: "boolean", desc: "Dibuja el check a la derecha." },
        { name: "leftIcon / rightIcon", type: "ReactNode", desc: "" },
        { name: "classNames", type: "InputClassNames", desc: "Escotillas por parte: root, label, field, input, errorMessage…" },
      ],
      demos: [
        {
          id: "motion-input-basic",
          title: "Escribe algo sin arroba",
          code: `<Input
  label="Correo"
  value={value}
  onChange={setValue}
  error={invalid ? "Eso no parece un correo." : false}
/>`,
          render: <MotionInputDemo />,
        },
      ],
    },
    {
      id: "action-swap",
      name: "ActionSwapButton",
      source: "components/motion/action-swap.tsx",
      importLine: 'import { ActionSwapButton, ActionSwapIcon, ActionSwapText } from "@/components/motion/action-swap";',
      desc:
        "Un botón cuya etiqueta cambia al pulsarlo, sin que la caja se mueva: un "
        + "medidor oculto guarda el estado más largo y es quien fija el ancho.",
      exports: [
        "ActionSwapButton",
        "ActionSwapText",
        "ActionSwapIcon",
        "ActionSwapRollButton",
        "ActionSwapRollText",
        "ActionSwapRollIcon",
      ],
      props: [
        { name: "items", type: "ActionSwapItem[]", required: true, desc: "{ id, label, icon?, ariaLabel? } por estado." },
        { name: "value / defaultValue", type: "string", desc: "El id activo." },
        { name: "onValueChange", type: "(value: string, item: ActionSwapItem) => void", desc: "" },
        { name: "animation", type: '"blur" | "roll" | "cascade"', def: '"blur"', desc: "cascade rueda letra a letra, de izquierda a derecha." },
        { name: "cycle", type: "boolean", def: "true", desc: "Cada clic avanza al siguiente item y vuelve al principio." },
        { name: "iconOnly", type: "boolean", def: 'size === "icon"', desc: "Oculta el texto y deja solo el icono." },
      ],
      demos: [
        {
          id: "action-swap-basic",
          title: "Tres animaciones",
          desc: "Pulsa cada uno: blur funde, roll gira, cascade va letra por letra.",
          code: `<ActionSwapButton
  animation="cascade"
  items={[
    { id: "copy", label: "Copiar" },
    { id: "done", label: "Copiado" },
  ]}
/>`,
          render: (
            <>
              {(["blur", "roll", "cascade"] as const).map((animation) => (
                <ActionSwapButton
                  key={animation}
                  animation={animation}
                  variant="outline"
                  items={[
                    { id: "copy", label: animation },
                    { id: "done", label: "Copiado" },
                  ]}
                />
              ))}
            </>
          ),
        },
      ],
    },
    {
      id: "theme-toggle",
      name: "ThemeToggle",
      source: "components/motion/theme-toggle.tsx",
      importLine: 'import { ThemeToggle } from "@/components/motion/theme-toggle";',
      desc:
        "Cambia el tema con una View Transition: el nuevo esquema se revela desde "
        + "un punto en vez de parpadear. Suspende el cross-fade de :root mientras "
        + "dura, que es lo que convertía el barrido en puré.",
      exports: ["ThemeToggle", "useThemeToggle"],
      props: [
        { name: "variant", type: '"rectangle" | "circle" | "circle-blur" | "blinds"', def: '"rectangle"', desc: "La forma del barrido." },
        { name: "start", type: '"top-left" | "top-right" | "bottom-left" | "bottom-right" | "center" | "bottom-up"', def: '"bottom-up"', desc: "De dónde sale el revelado." },
        { name: "iconClassName", type: "string", desc: "" },
      ],
      demos: [
        {
          id: "theme-toggle-variants",
          title: "Las cuatro variantes",
          desc: "Cada una cambia el tema de verdad — pulsa dos veces para volver.",
          code: '<ThemeToggle variant="circle-blur" start="top-right" />',
          render: (
            <>
              {(["rectangle", "circle", "circle-blur", "blinds"] as const).map((variant) => (
                <div key={variant} className="flex flex-col items-center gap-1.5">
                  <ThemeToggle variant={variant} />
                  <span className="font-mono text-[10.5px] text-muted-foreground">{variant}</span>
                </div>
              ))}
            </>
          ),
        },
      ],
    },
    {
      id: "text-reveal",
      name: "TextReveal",
      source: "components/motion/text-reveal.tsx",
      importLine: 'import { TextReveal } from "@/components/motion/text-reveal";',
      desc:
        "Titular que entra por palabras o por letras, con desenfoque y muelle. Un "
        + "único tokenizador para los dos modos, así que no se desalinean en qué "
        + "cuenta como palabra.",
      props: [
        { name: "text", type: "string | string[]", required: true, desc: "Un array son líneas: cada una entra detrás de la anterior." },
        { name: "as", type: "TextTag", def: '"p"', desc: "h1…h6, span, label, strong, em." },
        { name: "split", type: '"word" | "char"', desc: "Granularidad de la entrada." },
        { name: "stagger", type: "number", desc: "Segundos entre unidad y unidad." },
        { name: "delay", type: "number", desc: "Retraso antes de empezar." },
        { name: "blur", type: "number", desc: "Desenfoque de partida, en px." },
        { name: "yOffset", type: "string | number", desc: "Desde dónde sube." },
        { name: "whileInView / once", type: "boolean", desc: "Dispara al entrar en pantalla, y solo una vez." },
      ],
      demos: [
        {
          id: "text-reveal-basic",
          title: "Por palabras y por letras",
          code: `<TextReveal as="h3" text="Cada canal en una sola bandeja" split="word" />
<TextReveal text="Sin copiar y pegar entre pestañas" split="char" />`,
          render: (
            <div className="flex w-full flex-col gap-3">
              <TextReveal
                as="h3"
                className="font-heading text-xl tracking-[-0.02em]"
                text="Cada canal en una sola bandeja"
                split="word"
              />
              <TextReveal
                className="text-sm text-muted-foreground"
                text="Sin copiar y pegar entre pestañas"
                split="char"
                stagger={0.012}
              />
            </div>
          ),
        },
      ],
    },
    {
      id: "text-shimmer",
      name: "TextShimmer",
      source: "components/motion/text-shimmer.tsx",
      importLine: 'import { TextShimmer } from "@/components/motion/text-shimmer";',
      desc: "Un brillo recorriendo el texto — la señal de «esto sigue pasando».",
      props: [
        { name: "children", type: "ReactNode", required: true, desc: "" },
        { name: "as", type: "TextTag", def: '"span"', desc: "" },
        { name: "duration", type: "number", def: "2.5", desc: "Segundos por pasada." },
      ],
      demos: [
        {
          id: "text-shimmer-basic",
          title: "En marcha",
          code: '<TextShimmer>Generando la respuesta…</TextShimmer>',
          render: <TextShimmer className="text-sm">Generando la respuesta…</TextShimmer>,
        },
      ],
    },
    {
      id: "thinking-text",
      name: "ThinkingText",
      source: "components/motion/thinking-text.tsx",
      importLine: 'import { ThinkingText } from "@/components/motion/thinking-text";',
      desc:
        "Cicla frases sin que la caja cambie de ancho: un medidor invisible sostiene "
        + "la más larga, así que el botón de alrededor no salta a media frase.",
      props: [
        { name: "states", type: "readonly string[]", required: true, desc: "Las frases, en orden." },
        { name: "hold", type: "number", def: "2000", desc: "Milisegundos por frase." },
      ],
      demos: [
        {
          id: "thinking-text-basic",
          title: "Ciclando",
          code: `<ThinkingText states={["Leyendo el historial", "Buscando en el catálogo", "Redactando"]} />`,
          render: (
            <ThinkingText
              className="text-sm text-muted-foreground"
              hold={1600}
              states={["Leyendo el historial", "Buscando en el catálogo", "Redactando la respuesta"]}
            />
          ),
        },
      ],
    },
    {
      id: "toast",
      name: "Toast",
      source: "components/toast-provider.tsx",
      importLine: 'import { useToast } from "@/components/toast-provider";',
      desc:
        "La superficie de aviso de la app, montada una sola vez en el layout raíz. "
        + "El sonido se decide aquí por estado, no en cada llamada. Un toast de "
        + "error no caduca solo: 4,2 s alcanzan para «Guardado» y no para leer qué "
        + "falló y decidir qué hacer.",
      exports: ["useToast", "ToastProvider", "AnimatedToastStack", "useAnimatedToastStack"],
      props: [
        { name: "title", type: "ReactNode", required: true, desc: "" },
        { name: "description", type: "ReactNode", desc: "" },
        { name: "status", type: '"neutral" | "info" | "loading" | "success" | "error"', def: '"neutral"', desc: "Decide icono, color y sonido." },
        { name: "action", type: "{ label, onClick }", desc: "Un botón dentro del toast." },
        { name: "duration", type: "number", desc: "ms. 0 = hasta que se descarte. Los error ya son 0." },
      ],
      demos: [
        {
          id: "toast-basic",
          title: "Lánzalos",
          code: `const { toast } = useToast();

toast({ title: "Guardado", status: "success" });`,
          render: <ToastDemo />,
        },
      ],
    },
  ],
};
