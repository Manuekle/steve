"use client";

// components/ui — the controls. Everything here is either a native element
// with the house recipe on it, or a thin wrapper over a Radix primitive.

import { useState } from "react";
import { HugeiconsIcon } from "@/components/icons/icon";
import {
  Add01Icon,
  Delete02Icon,
  Search01Icon,
  Settings01Icon,
} from "@hugeicons/core-free-icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonGroup, ButtonGroupSeparator, ButtonGroupText } from "@/components/ui/button-group";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import { Input } from "@/components/ui/input";
import { LiquidSlider } from "@/components/ui/liquid-slider";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { StatusBadge, type StatusVariant } from "@/components/ui/status-badge";
import { SuggestionChip } from "@/components/ui/suggestion-chip";
import { Switch } from "@/components/ui/switch";
import { ToggleChip } from "@/components/ui/toggle-chip";
import { Textarea } from "@/components/ui/textarea";
import type { Section } from "../_lib/types";

// ── Stateful demo hosts ─────────────────────────────────────────────
//
// A controlled component cannot be demoed as a bare element: it needs
// somewhere to keep the value. One tiny host per component, right here, so
// the registry entry below stays declarative.

function ToggleChipDemo() {
  const [picked, setPicked] = useState("es");
  return (
    <div className="flex flex-wrap gap-1.5">
      {[
        { id: "es", label: "Español" },
        { id: "en", label: "Inglés" },
        { id: "pt", label: "Portugués" },
      ].map((option) => (
        <ToggleChip
          key={option.id}
          selected={picked === option.id}
          onClick={() => setPicked(option.id)}
        >
          {option.label}
        </ToggleChip>
      ))}
    </div>
  );
}

function SwitchDemo() {
  const [on, setOn] = useState(true);
  const [off, setOff] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-6">
      <label className="flex items-center gap-2.5 text-sm">
        <Switch checked={on} onCheckedChange={setOn} label="Respuestas automáticas" />
        Encendido
      </label>
      <label className="flex items-center gap-2.5 text-sm">
        <Switch checked={off} onCheckedChange={setOff} label="Modo prueba" />
        Apagado
      </label>
      <label className="flex items-center gap-2.5 text-sm text-muted-foreground">
        <Switch checked disabled onCheckedChange={() => {}} label="Bloqueado" />
        disabled
      </label>
    </div>
  );
}

function SliderDemo() {
  const [value, setValue] = useState(0.4);
  return (
    <div className="flex w-full max-w-sm flex-col gap-2">
      <div className="flex items-baseline justify-between text-xs text-muted-foreground">
        <span>Temperatura</span>
        <span className="font-mono tabular-nums">{value.toFixed(2)}</span>
      </div>
      <LiquidSlider value={value} onValueChange={setValue} label="Temperatura" />
    </div>
  );
}

const STATUS_VARIANTS: readonly StatusVariant[] = [
  "pending",
  "in-progress",
  "submitted",
  "in-review",
  "success",
  "failed",
  "expired",
  "connected",
  "disconnected",
  "active",
  "paused",
  "draft",
  "error",
  "warning",
];

// ── Section ─────────────────────────────────────────────────────────

export const uiControls: Section = {
  id: "ui-controls",
  title: "Controles",
  desc:
    "components/ui — botones, campos y pastillas. Es la capa que más se repite en "
    + "la app, así que es la que menos debería reinventarse en una página nueva.",
  entries: [
    {
      id: "button",
      name: "Button",
      source: "components/ui/button.tsx",
      importLine: 'import { Button, buttonVariants } from "@/components/ui/button";',
      desc:
        "Seis variantes y ocho tamaños sobre una sola receta: mismo radio, misma "
        + "tipografía, misma transición. La profundidad es un borde hairline más un "
        + "inner highlight arriba y una sombra corta abajo. El foco es un `outline`, "
        + "no un `ring`, porque el `box-shadow` ya está gastado en la superficie.",
      exports: ["Button", "buttonVariants"],
      props: [
        {
          name: "variant",
          type: '"default" | "destructive" | "secondary" | "outline" | "ghost" | "link"',
          def: '"default"',
          desc: "Cuánto peso carga la acción. default es la principal de la pantalla.",
        },
        {
          name: "size",
          type: '"default" | "xs" | "sm" | "lg" | "icon" | "icon-xs" | "icon-sm" | "icon-lg"',
          def: '"default"',
          desc: "Las variantes icon son cuadradas; el resto crece solo en alto y padding.",
        },
        {
          name: "asChild",
          type: "boolean",
          def: "false",
          desc: "Renderiza el hijo en vez de un <button> — para un <Link> con pinta de botón.",
        },
        {
          name: "disabled",
          type: "boolean",
          desc: "Baja el contraste y corta pointer-events, no solo el cursor.",
        },
        {
          name: "…props",
          type: 'React.ComponentProps<"button">',
          desc: "Todo lo nativo pasa tal cual: type, onClick, form, aria-*.",
        },
      ],
      notes: [
        "default, destructive, secondary y outline suenan al pulsarse (data-cuelume-press). ghost y link no: son la X de cerrar y el «ver más», y sonarlos es como se acaba silenciando la app entera.",
        "El SVG dentro se dimensiona solo a 16px salvo que le pases una clase size-*.",
      ],
      demos: [
        {
          id: "button-variants",
          title: "Variantes",
          code: `<Button>Guardar</Button>
<Button variant="destructive">Eliminar</Button>
<Button variant="secondary">Duplicar</Button>
<Button variant="outline">Cancelar</Button>
<Button variant="ghost">Ver más</Button>
<Button variant="link">Documentación</Button>`,
          render: (
            <>
              <Button>Guardar</Button>
              <Button variant="destructive">Eliminar</Button>
              <Button variant="secondary">Duplicar</Button>
              <Button variant="outline">Cancelar</Button>
              <Button variant="ghost">Ver más</Button>
              <Button variant="link">Documentación</Button>
            </>
          ),
        },
        {
          id: "button-sizes",
          title: "Tamaños",
          code: `<Button size="xs">xs</Button>
<Button size="sm">sm</Button>
<Button size="default">default</Button>
<Button size="lg">lg</Button>`,
          render: (
            <>
              <Button size="xs">xs</Button>
              <Button size="sm">sm</Button>
              <Button size="default">default</Button>
              <Button size="lg">lg</Button>
            </>
          ),
        },
        {
          id: "button-icons",
          title: "Con icono y solo icono",
          desc: "Un botón que es solo un icono necesita aria-label: el SVG va oculto al lector.",
          code: `<Button><HugeiconsIcon icon={Add01Icon} size={16} />Nuevo agente</Button>
<Button variant="outline" size="icon-sm" aria-label="Ajustes">
  <HugeiconsIcon icon={Settings01Icon} size={16} />
</Button>`,
          render: (
            <>
              <Button>
                <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={1.75} />
                Nuevo agente
              </Button>
              <Button variant="destructive" size="sm">
                <HugeiconsIcon icon={Delete02Icon} size={14} strokeWidth={1.75} />
                Eliminar
              </Button>
              <Button variant="outline" size="icon-xs" aria-label="Ajustes">
                <HugeiconsIcon icon={Settings01Icon} size={12} strokeWidth={1.75} />
              </Button>
              <Button variant="outline" size="icon-sm" aria-label="Ajustes">
                <HugeiconsIcon icon={Settings01Icon} size={16} strokeWidth={1.75} />
              </Button>
              <Button variant="outline" size="icon" aria-label="Ajustes">
                <HugeiconsIcon icon={Settings01Icon} size={16} strokeWidth={1.75} />
              </Button>
              <Button variant="outline" size="icon-lg" aria-label="Ajustes">
                <HugeiconsIcon icon={Settings01Icon} size={18} strokeWidth={1.75} />
              </Button>
            </>
          ),
        },
        {
          id: "button-states",
          title: "Estados",
          code: `<Button disabled>Guardando</Button>
<Button variant="secondary" disabled>
  <Spinner /> Procesando
</Button>`,
          render: (
            <>
              <Button disabled>Deshabilitado</Button>
              <Button variant="secondary" disabled>
                <Spinner />
                Procesando
              </Button>
              <Button variant="outline" disabled>
                Deshabilitado
              </Button>
            </>
          ),
        },
      ],
    },
    {
      id: "suggestion-chip",
      name: "SuggestionChip",
      source: "components/ui/suggestion-chip.tsx",
      importLine: 'import { SuggestionChip } from "@/components/ui/suggestion-chip";',
      desc:
        "La pastilla de arranque de una conversación: el estado vacío del chat, "
        + "los dos asistentes y las opciones de seguimiento de un turno. Es un "
        + "Button outline con la superficie del chip encima, así que el radio, el "
        + "foco y el disabled vienen del sistema.",
      props: [
        { name: "size", type: '"xs" | "sm" | "default" | "lg"', def: '"sm"', desc: "xs para las opciones dentro de un turno." },
        { name: "...", type: "ComponentProps<typeof Button>", desc: "Todo lo del Button: disabled, onClick, asChild." },
      ],
      demos: [
        {
          id: "suggestion-chip-basic",
          title: "Tamaños y disabled",
          code: `<SuggestionChip>¿Cuántos leads entraron hoy?</SuggestionChip>
<SuggestionChip size="xs">Sí</SuggestionChip>
<SuggestionChip disabled>Mientras responde</SuggestionChip>`,
          render: (
            <>
              <SuggestionChip>¿Cuántos leads entraron hoy?</SuggestionChip>
              <SuggestionChip size="xs">Sí</SuggestionChip>
              <SuggestionChip disabled>Mientras responde</SuggestionChip>
            </>
          ),
        },
      ],
    },
    {
      id: "toggle-chip",
      name: "ToggleChip",
      source: "components/ui/toggle-chip.tsx",
      importLine: 'import { ToggleChip } from "@/components/ui/toggle-chip";',
      desc:
        "La pastilla que está elegida o no: el idioma del brief, la plantilla al "
        + "crear un agente, el filtro de opciones de un paso de formulario. "
        + "`aria-pressed` sale de `selected`, no del que llama — las tres copias "
        + "a mano que sustituye no lo ponían todas.",
      props: [
        { name: "selected", type: "boolean", required: true, desc: "Marca el estado y escribe aria-pressed." },
        { name: "size", type: '"xs" | "sm" | "default" | "lg"', def: '"sm"', desc: "" },
      ],
      demos: [
        {
          id: "toggle-chip-basic",
          title: "Una sola elección",
          desc: "Pulsa: solo una queda marcada.",
          code: `<ToggleChip selected={picked === option.id} onClick={() => setPicked(option.id)}>
  {option.label}
</ToggleChip>`,
          render: <ToggleChipDemo />,
        },
      ],
    },
    {
      id: "badge",
      name: "Badge",
      source: "components/ui/badge.tsx",
      importLine: 'import { Badge, badgeVariants } from "@/components/ui/badge";',
      desc:
        "Pastilla de etiqueta, no de estado — para eso está StatusBadge. Monocroma "
        + "salvo destructive, que es el único acento.",
      exports: ["Badge", "badgeVariants"],
      props: [
        {
          name: "variant",
          type: '"default" | "secondary" | "destructive" | "outline" | "ghost" | "link"',
          def: '"default"',
          desc: "El peso visual de la etiqueta.",
        },
        {
          name: "asChild",
          type: "boolean",
          def: "false",
          desc: "Para renderizar la pastilla como <a>; los hovers [a&] se activan solos.",
        },
      ],
      demos: [
        {
          id: "badge-variants",
          title: "Variantes",
          code: `<Badge>Beta</Badge>
<Badge variant="secondary">Borrador</Badge>
<Badge variant="destructive">Vencido</Badge>
<Badge variant="outline">v0.25.2</Badge>`,
          render: (
            <>
              <Badge>Beta</Badge>
              <Badge variant="secondary">Borrador</Badge>
              <Badge variant="destructive">Vencido</Badge>
              <Badge variant="outline">v0.25.2</Badge>
              <Badge variant="ghost">Ghost</Badge>
              <Badge variant="link">Link</Badge>
            </>
          ),
        },
        {
          id: "badge-icon",
          title: "Con icono",
          desc: "El SVG se dimensiona solo a 12px dentro de la pastilla.",
          code: `<Badge variant="secondary">
  <HugeiconsIcon icon={Search01Icon} />
  Indexando
</Badge>`,
          render: (
            <Badge variant="secondary">
              <HugeiconsIcon icon={Search01Icon} strokeWidth={1.75} />
              Indexando
            </Badge>
          ),
        },
      ],
    },
    {
      id: "status-badge",
      name: "StatusBadge",
      source: "components/ui/status-badge.tsx",
      importLine: 'import { StatusBadge } from "@/components/ui/status-badge";',
      desc:
        "La única pastilla de estado de la app: un pastel por estado, icono de línea "
        + "y etiqueta. Las siete variantes de la especificación más siete alias "
        + "propios del producto que reutilizan los mismos colores.",
      props: [
        {
          name: "status",
          type: "StatusVariant",
          required: true,
          desc: "pending · in-progress · submitted · in-review · success · failed · expired, más connected · disconnected · active · paused · draft · error · warning.",
        },
        {
          name: "label",
          type: "string",
          desc: "Pisa la etiqueta del diccionario. Solo cuando una pantalla necesita otra palabra.",
        },
        {
          name: "title",
          type: "string",
          desc: "Texto de hover para el detalle que haría la pastilla ilegible de largo.",
        },
      ],
      notes: [
        "Traduce con useT() contra las claves badge.<variant>, así que necesita el I18nProvider del layout raíz.",
      ],
      demos: [
        {
          id: "status-badge-all",
          title: "Todas las variantes",
          code: '<StatusBadge status="success" />',
          render: (
            <>
              {STATUS_VARIANTS.map((status) => (
                <StatusBadge key={status} status={status} />
              ))}
            </>
          ),
        },
        {
          id: "status-badge-label",
          title: "Etiqueta propia",
          code: '<StatusBadge status="warning" label="Plan gratuito" title="Catálogo parcial" />',
          render: <StatusBadge status="warning" label="Plan gratuito" title="Catálogo parcial" />,
        },
      ],
    },
    {
      id: "input",
      name: "Input",
      source: "components/ui/input.tsx",
      importLine: 'import { Input } from "@/components/ui/input";',
      desc:
        "El <input> nativo con la receta de campo: fondo hundido, borde de 1px y "
        + "foco por `outline`. En foco el fondo sube a --card, que es la señal de "
        + "«esto está activo» sin gastar la sombra.",
      props: [
        { name: "type", type: 'React.HTMLInputTypeAttribute', desc: "Nativo. file trae su propio estilo de botón." },
        { name: "aria-invalid", type: "boolean", desc: "Pinta el borde en destructive y añade la sombra de error." },
        { name: "…props", type: 'React.ComponentProps<"input">', desc: "Todo lo nativo pasa tal cual." },
      ],
      demos: [
        {
          id: "input-states",
          title: "Estados",
          code: `<Input placeholder="nombre@empresa.com" />
<Input defaultValue="Hola" />
<Input aria-invalid placeholder="Requerido" />
<Input disabled placeholder="Bloqueado" />`,
          render: (
            <div className="grid w-full max-w-md gap-3">
              <Input placeholder="nombre@empresa.com" />
              <Input defaultValue="Agente de ventas" />
              <Input aria-invalid placeholder="Este campo es obligatorio" />
              <Input disabled placeholder="Bloqueado" />
            </div>
          ),
        },
      ],
    },
    {
      id: "textarea",
      name: "Textarea",
      source: "components/ui/textarea.tsx",
      importLine: 'import { Textarea } from "@/components/ui/textarea";',
      desc:
        "Misma receta que Input, con field-sizing-content: crece con lo escrito en "
        + "vez de quedarse en una caja fija con scroll.",
      props: [
        { name: "…props", type: 'React.ComponentProps<"textarea">', desc: "Nativo. rows sigue funcionando si quieres fijar el alto." },
      ],
      demos: [
        {
          id: "textarea-basic",
          title: "Autogrow",
          desc: "Escribe varias líneas: la caja crece sola.",
          code: '<Textarea placeholder="Instrucciones del agente…" />',
          render: (
            <div className="w-full max-w-md">
              <Textarea placeholder="Instrucciones del agente…" />
            </div>
          ),
        },
      ],
    },
    {
      id: "switch",
      name: "Switch",
      source: "components/ui/switch.tsx",
      importLine: 'import { Switch } from "@/components/ui/switch";',
      desc:
        "Interruptor on/off. El recorrido del pulgar y el doble rebote viven en "
        + ".t-toggle (globals.css); el componente pone la caja, los colores y el "
        + "cableado accesible.",
      props: [
        { name: "checked", type: "boolean", required: true, desc: "Controlado siempre — no hay estado interno." },
        { name: "onCheckedChange", type: "(checked: boolean) => void", required: true, desc: "El nuevo valor, ya invertido." },
        { name: "label", type: "string", required: true, desc: "Nombre accesible: el control no tiene texto propio." },
        { name: "disabled", type: "boolean", desc: "Baja a 40 % y cambia el cursor." },
      ],
      notes: [
        "La animación de apagado solo se arma tras el primer clic (.is-init): si no, cada switch de la página tiembla al hidratar.",
      ],
      demos: [
        {
          id: "switch-states",
          title: "Estados",
          code: `const [on, setOn] = useState(true);

<Switch checked={on} onCheckedChange={setOn} label="Respuestas automáticas" />`,
          render: <SwitchDemo />,
        },
      ],
    },
    {
      id: "liquid-slider",
      name: "LiquidSlider",
      source: "components/ui/liquid-slider.tsx",
      importLine: 'import { LiquidSlider } from "@/components/ui/liquid-slider";',
      desc:
        "Slider cuyo pulgar es una gota: persigue al puntero, se estira con la "
        + "velocidad y deja cola. Debajo hay un <input type=\"range\"> real e "
        + "invisible, que es lo que mantiene teclado y lectores funcionando.",
      props: [
        { name: "value", type: "number", required: true, desc: "Controlado." },
        { name: "onValueChange", type: "(value: number) => void", required: true, desc: "" },
        { name: "min", type: "number", def: "0", desc: "" },
        { name: "max", type: "number", def: "1", desc: "" },
        { name: "step", type: "number", def: "0.01", desc: "" },
        { name: "label", type: "string", required: true, desc: "Nombre accesible: la pista no lleva texto." },
        { name: "disabled", type: "boolean", desc: "" },
      ],
      notes: [
        "Un salto de más de 40px re-siembra la superficie líquida, para que un clic en el otro extremo no muestre la gota cruzando la pista.",
      ],
      demos: [
        {
          id: "liquid-slider-basic",
          title: "Arrástralo",
          code: `const [value, setValue] = useState(0.4);

<LiquidSlider value={value} onValueChange={setValue} label="Temperatura" />`,
          render: <SliderDemo />,
        },
      ],
    },
    {
      id: "button-group",
      name: "ButtonGroup",
      source: "components/ui/button-group.tsx",
      importLine: 'import { ButtonGroup, ButtonGroupSeparator, ButtonGroupText } from "@/components/ui/button-group";',
      desc:
        "Cose varios botones en un solo bloque: quita los radios interiores y los "
        + "bordes duplicados. Funciona con Button, Select y campos.",
      exports: ["ButtonGroup", "ButtonGroupSeparator", "ButtonGroupText", "buttonGroupVariants"],
      props: [
        { name: "orientation", type: '"horizontal" | "vertical"', def: '"horizontal"', desc: "Vertical apila y cose por arriba/abajo." },
      ],
      demos: [
        {
          id: "button-group-basic",
          title: "Horizontal y vertical",
          code: `<ButtonGroup>
  <Button variant="outline">Día</Button>
  <Button variant="outline">Semana</Button>
  <Button variant="outline">Mes</Button>
</ButtonGroup>`,
          render: (
            <>
              <ButtonGroup>
                <Button variant="outline">Día</Button>
                <Button variant="outline">Semana</Button>
                <Button variant="outline">Mes</Button>
              </ButtonGroup>
              <ButtonGroup orientation="vertical">
                <Button variant="outline" size="sm">Arriba</Button>
                <Button variant="outline" size="sm">Medio</Button>
                <Button variant="outline" size="sm">Abajo</Button>
              </ButtonGroup>
            </>
          ),
        },
        {
          id: "button-group-text",
          title: "Con texto y separador",
          code: `<ButtonGroup>
  <ButtonGroupText>steve.app/</ButtonGroupText>
  <Input defaultValue="ventas" />
  <ButtonGroupSeparator />
  <Button variant="outline">Copiar</Button>
</ButtonGroup>`,
          render: (
            <ButtonGroup>
              <ButtonGroupText>steve.app/f/</ButtonGroupText>
              <Input defaultValue="ventas" className="w-32" />
              <ButtonGroupSeparator />
              <Button variant="outline">Copiar</Button>
            </ButtonGroup>
          ),
        },
      ],
    },
    {
      id: "input-group",
      name: "InputGroup",
      source: "components/ui/input-group.tsx",
      importLine: 'import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput, InputGroupText } from "@/components/ui/input-group";',
      desc:
        "Un campo con cosas pegadas: icono delante, botón detrás, ayuda debajo. El "
        + "anillo de foco lo pinta el grupo, no el control — el grupo es el que "
        + "tiene el radio.",
      exports: [
        "InputGroup",
        "InputGroupAddon",
        "InputGroupButton",
        "InputGroupText",
        "InputGroupInput",
        "InputGroupTextarea",
      ],
      props: [
        {
          name: "align (Addon)",
          type: '"inline-start" | "inline-end" | "block-start" | "block-end"',
          def: '"inline-start"',
          desc: "Dónde se pega el añadido. Los block-* apilan y convierten el grupo en columna.",
        },
        {
          name: "size (Button)",
          type: '"xs" | "sm" | "icon-xs" | "icon-sm"',
          def: '"xs"',
          desc: "El botón interior es un Button ghost recortado para caber en la fila.",
        },
      ],
      demos: [
        {
          id: "input-group-basic",
          title: "Icono y botón",
          code: `<InputGroup>
  <InputGroupAddon>
    <HugeiconsIcon icon={Search01Icon} />
  </InputGroupAddon>
  <InputGroupInput placeholder="Buscar contactos…" />
  <InputGroupAddon align="inline-end">
    <InputGroupButton>Filtrar</InputGroupButton>
  </InputGroupAddon>
</InputGroup>`,
          render: (
            <div className="w-full max-w-md">
              <InputGroup>
                <InputGroupAddon>
                  <HugeiconsIcon icon={Search01Icon} strokeWidth={1.75} />
                </InputGroupAddon>
                <InputGroupInput placeholder="Buscar contactos…" />
                <InputGroupAddon align="inline-end">
                  <InputGroupButton>Filtrar</InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
            </div>
          ),
        },
        {
          id: "input-group-block",
          title: "Ayuda debajo",
          code: `<InputGroup>
  <InputGroupInput placeholder="webhook" />
  <InputGroupAddon align="block-end">
    <InputGroupText>Se llamará en cada mensaje entrante.</InputGroupText>
  </InputGroupAddon>
</InputGroup>`,
          render: (
            <div className="w-full max-w-md">
              <InputGroup>
                <InputGroupInput placeholder="https://…/webhook" />
                <InputGroupAddon align="block-end">
                  <InputGroupText className="text-xs">
                    Se llamará en cada mensaje entrante.
                  </InputGroupText>
                </InputGroupAddon>
              </InputGroup>
            </div>
          ),
        },
      ],
    },
    {
      id: "spinner",
      name: "Spinner",
      source: "components/ui/spinner.tsx",
      importLine: 'import { Spinner } from "@/components/ui/spinner";',
      desc: "El icono Loading03 girando, con role=\"status\" y nombre accesible ya puestos.",
      props: [
        { name: "size", type: "number", def: "16", desc: "En px." },
        { name: "className", type: "string", desc: "Para el color: hereda currentColor por defecto." },
      ],
      demos: [
        {
          id: "spinner-sizes",
          title: "Tamaños y color",
          code: `<Spinner />
<Spinner size={24} className="text-muted-foreground" />`,
          render: (
            <>
              <Spinner />
              <Spinner size={20} className="text-muted-foreground" />
              <Spinner size={28} className="text-destructive" />
            </>
          ),
        },
      ],
    },
    {
      id: "separator",
      name: "Separator",
      source: "components/ui/separator.tsx",
      importLine: 'import { Separator } from "@/components/ui/separator";',
      desc: "Una línea de 1px en --border. Decorativa por defecto, así que no aparece en el árbol de accesibilidad.",
      props: [
        { name: "orientation", type: '"horizontal" | "vertical"', def: '"horizontal"', desc: "La vertical necesita un padre con altura." },
        { name: "decorative", type: "boolean", def: "true", desc: "En false se anuncia como separador real." },
      ],
      demos: [
        {
          id: "separator-basic",
          title: "Horizontal y vertical",
          code: `<Separator />
<Separator orientation="vertical" />`,
          render: (
            <div className="w-full max-w-sm">
              <p className="text-sm">Canales</p>
              <Separator className="my-3" />
              <div className="flex h-5 items-center gap-3 text-xs text-muted-foreground">
                WhatsApp
                <Separator orientation="vertical" />
                Instagram
                <Separator orientation="vertical" />
                Web
              </div>
            </div>
          ),
        },
      ],
    },
  ],
};
