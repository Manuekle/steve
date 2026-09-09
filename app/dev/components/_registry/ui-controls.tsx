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
import { ct } from "../_lib/catalog-i18n";
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

export function uiControls(_locale?: string): Section {
  return {
  id: "ui-controls",
  title: ct("controls.title"),
  desc: ct("controls.desc"),
  entries: [
    {
      id: "button",
      name: "Button",
      source: "components/ui/button.tsx",
      importLine: 'import { Button, buttonVariants } from "@/components/ui/button";',
      desc: ct("controls.button.desc"),
      exports: ["Button", "buttonVariants"],
      props: [
        {
          name: "variant",
          type: '"default" | "destructive" | "secondary" | "outline" | "ghost" | "link"',
          def: '"default"',
          desc: ct("controls.button.variant.desc"),
        },
        {
          name: "size",
          type: '"default" | "xs" | "sm" | "lg" | "icon" | "icon-xs" | "icon-sm" | "icon-lg"',
          def: '"default"',
          desc: ct("controls.button.size.desc"),
        },
        {
          name: "asChild",
          type: "boolean",
          def: "false",
          desc: ct("controls.button.asChild.desc"),
        },
        {
          name: "disabled",
          type: "boolean",
          desc: ct("controls.button.disabled.desc"),
        },
        {
          name: "…props",
          type: 'React.ComponentProps<"button">',
          desc: ct("controls.button.props.desc"),
        },
      ],
      notes: [
        ct("controls.button.note1"),
        ct("controls.button.note2"),
      ],
      demos: [
        {
          id: "button-variants",
          title: ct("controls.button.variants.title"),
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
          title: ct("controls.button.sizes.title"),
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
          title: ct("controls.button.icons.title"),
          desc: ct("controls.button.icons.desc"),
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
          title: ct("controls.button.states.title"),
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
      desc: ct("controls.suggestionChip.desc"),
      props: [
        { name: "size", type: '"xs" | "sm" | "default" | "lg"', def: '"sm"', desc: ct("controls.suggestionChip.size.desc") },
        { name: "...", type: "ComponentProps<typeof Button>", desc: ct("controls.suggestionChip.extra.desc") },
      ],
      demos: [
        {
          id: "suggestion-chip-basic",
          title: ct("controls.suggestionChip.demos.title"),
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
      desc: ct("controls.toggleChip.desc"),
      props: [
        { name: "selected", type: "boolean", required: true, desc: ct("controls.toggleChip.selected.desc") },
        { name: "size", type: '"xs" | "sm" | "default" | "lg"', def: '"sm"', desc: "" },
      ],
      demos: [
        {
          id: "toggle-chip-basic",
          title: ct("controls.toggleChip.demos.title"),
          desc: ct("controls.toggleChip.demos.desc"),
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
      desc: ct("controls.badge.desc"),
      exports: ["Badge", "badgeVariants"],
      props: [
        {
          name: "variant",
          type: '"default" | "secondary" | "destructive" | "outline" | "ghost" | "link"',
          def: '"default"',
          desc: ct("controls.badge.variant.desc"),
        },
        {
          name: "asChild",
          type: "boolean",
          def: "false",
          desc: ct("controls.badge.asChild.desc"),
        },
      ],
      demos: [
        {
          id: "badge-variants",
          title: ct("controls.badge.variants.title"),
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
          title: ct("controls.badge.icon.title"),
          desc: ct("controls.badge.icon.desc"),
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
      desc: ct("controls.statusBadge.desc"),
      props: [
        {
          name: "status",
          type: "StatusVariant",
          required: true,
          desc: ct("controls.statusBadge.status.desc"),
        },
        {
          name: "label",
          type: "string",
          desc: ct("controls.statusBadge.label.desc"),
        },
        {
          name: "title",
          type: "string",
          desc: ct("controls.statusBadge.title.desc"),
        },
      ],
      notes: [
        ct("controls.statusBadge.note"),
      ],
      demos: [
        {
          id: "status-badge-all",
          title: ct("controls.statusBadge.all.title"),
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
          title: ct("controls.statusBadge.custom.title"),
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
      desc: ct("controls.input.desc"),
      props: [
        { name: "type", type: 'React.HTMLInputTypeAttribute', desc: ct("controls.input.type.desc") },
        { name: "aria-invalid", type: "boolean", desc: ct("controls.input.ariaInvalid.desc") },
        { name: "…props", type: 'React.ComponentProps<"input">', desc: ct("controls.input.props.desc") },
      ],
      demos: [
        {
          id: "input-states",
          title: ct("controls.input.states.title"),
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
      desc: ct("controls.textarea.desc"),
      props: [
        { name: "…props", type: 'React.ComponentProps<"textarea">', desc: ct("controls.textarea.props.desc") },
      ],
      demos: [
        {
          id: "textarea-basic",
          title: ct("controls.textarea.title"),
          desc: ct("controls.textarea.desc2"),
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
      desc: ct("controls.switch.desc"),
      props: [
        { name: "checked", type: "boolean", required: true, desc: ct("controls.switch.checked.desc") },
        { name: "onCheckedChange", type: "(checked: boolean) => void", required: true, desc: ct("controls.switch.onCheckedChange.desc") },
        { name: "label", type: "string", required: true, desc: ct("controls.switch.label.desc") },
        { name: "disabled", type: "boolean", desc: ct("controls.switch.disabled.desc") },
      ],
      notes: [
        ct("controls.switch.note"),
      ],
      demos: [
        {
          id: "switch-states",
          title: ct("controls.switch.states.title"),
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
      desc: ct("controls.liquidSlider.desc"),
      props: [
        { name: "value", type: "number", required: true, desc: ct("controls.liquidSlider.value.desc") },
        { name: "onValueChange", type: "(value: number) => void", required: true, desc: "" },
        { name: "min", type: "number", def: "0", desc: "" },
        { name: "max", type: "number", def: "1", desc: "" },
        { name: "step", type: "number", def: "0.01", desc: "" },
        { name: "label", type: "string", required: true, desc: ct("controls.liquidSlider.label.desc") },
        { name: "disabled", type: "boolean", desc: "" },
      ],
      notes: [
        ct("controls.liquidSlider.note"),
      ],
      demos: [
        {
          id: "liquid-slider-basic",
          title: ct("controls.liquidSlider.title"),
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
      desc: ct("controls.buttonGroup.desc"),
      exports: ["ButtonGroup", "ButtonGroupSeparator", "ButtonGroupText", "buttonGroupVariants"],
      props: [
        { name: "orientation", type: '"horizontal" | "vertical"', def: '"horizontal"', desc: ct("controls.buttonGroup.orientation.desc") },
      ],
      demos: [
        {
          id: "button-group-basic",
          title: ct("controls.buttonGroup.horizontal.title"),
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
          title: ct("controls.buttonGroup.text.title"),
          code: `<ButtonGroup>
  <ButtonGroupText>senka.app/</ButtonGroupText>
  <Input defaultValue="ventas" />
  <ButtonGroupSeparator />
  <Button variant="outline">Copiar</Button>
</ButtonGroup>`,
          render: (
            <ButtonGroup>
              <ButtonGroupText>senka.app/f/</ButtonGroupText>
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
      desc: ct("controls.inputGroup.desc"),
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
          desc: ct("controls.inputGroup.align.desc"),
        },
        {
          name: "size (Button)",
          type: '"xs" | "sm" | "icon-xs" | "icon-sm"',
          def: '"xs"',
          desc: ct("controls.inputGroup.size.desc"),
        },
      ],
      demos: [
        {
          id: "input-group-basic",
          title: ct("controls.inputGroup.icon.title"),
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
          title: ct("controls.inputGroup.help.title"),
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
      desc: ct("controls.spinner.desc"),
      props: [
        { name: "size", type: "number", def: "16", desc: ct("controls.spinner.size.desc") },
        { name: "className", type: "string", desc: ct("controls.spinner.className.desc") },
      ],
      demos: [
        {
          id: "spinner-sizes",
          title: ct("controls.spinner.title"),
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
      desc: ct("controls.separator.desc"),
      props: [
        { name: "orientation", type: '"horizontal" | "vertical"', def: '"horizontal"', desc: ct("controls.separator.orientation.desc") },
        { name: "decorative", type: "boolean", def: "true", desc: ct("controls.separator.decorative.desc") },
      ],
      demos: [
        {
          id: "separator-basic",
          title: ct("controls.separator.title"),
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
}
