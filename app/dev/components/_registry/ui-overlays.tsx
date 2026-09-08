"use client";

// components/ui — todo lo que se abre encima: diálogos, menús, tooltips.
// Casi todos son un envoltorio fino sobre Radix, así que la API real es la de
// Radix; lo que aporta el envoltorio es la superficie, la animación de entrada
// (`t-dropdown`, `t-dialog` en globals.css) y el cue de sonido.

import { useState } from "react";
import { HugeiconsIcon } from "@/components/icons/icon";
import {
  Copy01Icon,
  Delete02Icon,
  MoreHorizontalIcon,
  PencilEdit02Icon,
} from "@hugeicons/core-free-icons";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Beam } from "@/components/ui/beam";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ErrorBanner } from "@/components/ui/error-banner";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Input } from "@/components/ui/input";
import { Orb } from "@/components/ui/orb";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { OrbState } from "@/components/ui/orb";
import type { Section } from "../_lib/types";

// ── Hosts con estado ────────────────────────────────────────────────

function CollapsibleDemo() {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="w-full max-w-md">
      <CollapsibleTrigger asChild>
        <Button variant="outline" size="sm">
          {open ? "Ocultar" : "Ver"} la carga útil
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <pre className="mt-2 rounded-lg border border-border bg-muted/60 p-3 font-mono text-[11px]">
{`{ "channel": "whatsapp", "from": "+34…" }`}
        </pre>
      </CollapsibleContent>
    </Collapsible>
  );
}

function ErrorBannerDemo() {
  const [visible, setVisible] = useState(true);
  return visible ? (
    <ErrorBanner
      message="No se pudo guardar el agente."
      detail="upstream timeout tras 30 s"
      onRetry={() => {}}
      onDismiss={() => setVisible(false)}
      className="w-full max-w-lg"
    />
  ) : (
    <Button variant="outline" size="sm" onClick={() => setVisible(true)}>
      Volver a mostrar
    </Button>
  );
}

/**
 * cmdk selects its first row as soon as the list mounts and scrolls that row
 * into view — which, on a page this tall, yanks the reader from the top of the
 * catalog down to here. So the inline variant mounts on demand; the palette
 * below is the shape the app actually ships (ModelPicker) and only mounts when
 * it is opened anyway.
 */
function CommandInlineDemo() {
  const [mounted, setMounted] = useState(false);

  if (!mounted) {
    return (
      <Button variant="outline" size="sm" onClick={() => setMounted(true)}>
        Montar el buscador
      </Button>
    );
  }

  return (
    <div className="w-full max-w-md overflow-hidden rounded-xl border border-border">
      <Command>
        <CommandInput placeholder="Buscar…" />
        <CommandList>
          <CommandEmpty>Sin resultados.</CommandEmpty>
          <CommandGroup heading="Ir a">
            <CommandItem>
              Panel
              <CommandShortcut>⌘1</CommandShortcut>
            </CommandItem>
            <CommandItem>
              Conversaciones
              <CommandShortcut>⌘2</CommandShortcut>
            </CommandItem>
            <CommandItem>Automatizaciones</CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Acciones">
            <CommandItem>Crear agente</CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </div>
  );
}

function CommandDialogDemo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Abrir la paleta
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen} title="Paleta de comandos">
        <CommandInput placeholder="Buscar…" />
        <CommandList>
          <CommandEmpty>Sin resultados.</CommandEmpty>
          <CommandGroup heading="Ir a">
            <CommandItem>Panel</CommandItem>
            <CommandItem>Conversaciones</CommandItem>
            <CommandItem>Automatizaciones</CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Acciones">
            <CommandItem>Crear agente</CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}

const ORB_STATES: readonly OrbState[] = [
  "working",
  "searching",
  "solving",
  "listening",
  "connecting",
  "weaving",
  "composing",
  "breathing",
  "shaping",
];

// ── Sección ─────────────────────────────────────────────────────────

export const uiOverlays: Section = {
  id: "ui-overlays",
  title: "Capas y menús",
  desc:
    "Diálogos, menús y avisos. La superficie es siempre --popover con "
    + "--shadow-float; la animación de entrada vive en globals.css para que un "
    + "menú nuevo no tenga que volver a inventarla.",
  entries: [
    {
      id: "dialog",
      name: "Dialog",
      source: "components/ui/dialog.tsx",
      importLine: 'import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";',
      desc:
        "Panel modal para editar algo. Radix pone el foco atrapado, el scroll lock "
        + "y el Escape; el envoltorio pone la superficie, la ✕ y el cue de apertura.",
      exports: [
        "Dialog",
        "DialogTrigger",
        "DialogPortal",
        "DialogOverlay",
        "DialogContent",
        "DialogHeader",
        "DialogFooter",
        "DialogTitle",
        "DialogDescription",
        "DialogClose",
        "useDialogOpenCue",
      ],
      props: [
        { name: "open / onOpenChange", type: "boolean / (open: boolean) => void", desc: "Controlado. Sin ellos el Trigger lo maneja solo." },
        { name: "showCloseButton", type: "boolean", def: "true", desc: "En DialogContent. Apágalo cuando el pie ya tenga un Cancelar." },
      ],
      notes: [
        "Un diálogo de edición necesita key={editing?.id ?? \"new\"} en el sitio de la llamada, o reabre con los datos del anterior.",
        "DialogTitle es obligatorio para Radix: si no lo quieres visible, ponlo en sr-only.",
      ],
      demos: [
        {
          id: "dialog-basic",
          title: "Editar algo",
          code: `<Dialog>
  <DialogTrigger asChild>
    <Button variant="outline">Editar agente</Button>
  </DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Editar agente</DialogTitle>
      <DialogDescription>Cambia el nombre con el que responde.</DialogDescription>
    </DialogHeader>
    <Input defaultValue="Agente de ventas" />
    <DialogFooter>
      <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
      <Button>Guardar</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>`,
          render: (
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline">Editar agente</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Editar agente</DialogTitle>
                  <DialogDescription>Cambia el nombre con el que responde.</DialogDescription>
                </DialogHeader>
                <Input defaultValue="Agente de ventas" />
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="outline">Cancelar</Button>
                  </DialogClose>
                  <Button>Guardar</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          ),
        },
      ],
    },
    {
      id: "alert-dialog",
      name: "AlertDialog",
      source: "components/ui/alert-dialog.tsx",
      importLine: 'import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";',
      desc:
        "El Dialog para decisiones que no se deshacen. No se cierra al hacer clic "
        + "fuera y siempre tiene exactamente dos salidas.",
      exports: [
        "AlertDialog",
        "AlertDialogTrigger",
        "AlertDialogContent",
        "AlertDialogHeader",
        "AlertDialogFooter",
        "AlertDialogTitle",
        "AlertDialogDescription",
        "AlertDialogAction",
        "AlertDialogCancel",
      ],
      notes: [
        "Para el borrado normal la app usa components/confirm-dialog.tsx, que ya envuelve esto con el texto y el botón destructivo puestos.",
      ],
      demos: [
        {
          id: "alert-dialog-basic",
          title: "Confirmar un borrado",
          code: `<AlertDialog>
  <AlertDialogTrigger asChild>
    <Button variant="destructive">Eliminar</Button>
  </AlertDialogTrigger>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>¿Eliminar el agente?</AlertDialogTitle>
      <AlertDialogDescription>
        Se borran también sus conversaciones. No se puede deshacer.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancelar</AlertDialogCancel>
      <AlertDialogAction>Eliminar</AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>`,
          render: (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive">Eliminar</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Eliminar el agente?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Se borran también sus conversaciones. No se puede deshacer.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction>Eliminar</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ),
        },
      ],
    },
    {
      id: "dropdown-menu",
      name: "DropdownMenu",
      source: "components/ui/dropdown-menu.tsx",
      importLine: 'import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";',
      desc: "El menú de los tres puntos. Incluye checkbox, radio y submenús.",
      exports: [
        "DropdownMenu",
        "DropdownMenuTrigger",
        "DropdownMenuContent",
        "DropdownMenuGroup",
        "DropdownMenuLabel",
        "DropdownMenuItem",
        "DropdownMenuCheckboxItem",
        "DropdownMenuRadioGroup",
        "DropdownMenuRadioItem",
        "DropdownMenuSeparator",
        "DropdownMenuShortcut",
        "DropdownMenuSub",
        "DropdownMenuSubTrigger",
        "DropdownMenuSubContent",
      ],
      props: [
        { name: "variant (Item)", type: '"default" | "destructive"', def: '"default"', desc: "destructive tiñe texto e icono, y el hover." },
        { name: "inset (Item, Label)", type: "boolean", desc: "Sangra a la izquierda para alinear con items que llevan check." },
      ],
      demos: [
        {
          id: "dropdown-basic",
          title: "Acciones de fila",
          code: `<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button variant="ghost" size="icon-sm" aria-label="Acciones">
      <HugeiconsIcon icon={MoreHorizontalIcon} size={16} />
    </Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent align="start">
    <DropdownMenuLabel>Agente</DropdownMenuLabel>
    <DropdownMenuItem>Editar<DropdownMenuShortcut>⌘E</DropdownMenuShortcut></DropdownMenuItem>
    <DropdownMenuItem>Duplicar</DropdownMenuItem>
    <DropdownMenuSeparator />
    <DropdownMenuItem variant="destructive">Eliminar</DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>`,
          render: (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Acciones">
                  <HugeiconsIcon icon={MoreHorizontalIcon} size={16} strokeWidth={1.75} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuLabel>Agente</DropdownMenuLabel>
                <DropdownMenuItem>
                  <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={1.75} />
                  Editar
                  <DropdownMenuShortcut>⌘E</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <HugeiconsIcon icon={Copy01Icon} strokeWidth={1.75} />
                  Duplicar
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive">
                  <HugeiconsIcon icon={Delete02Icon} strokeWidth={1.75} />
                  Eliminar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ),
        },
      ],
    },
    {
      id: "context-menu",
      name: "ContextMenu",
      source: "components/ui/context-menu.tsx",
      importLine: 'import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuLabel, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu";',
      desc: "El mismo menú, abierto con clic derecho sobre una zona.",
      exports: [
        "ContextMenu",
        "ContextMenuTrigger",
        "ContextMenuContent",
        "ContextMenuItem",
        "ContextMenuLabel",
        "ContextMenuSeparator",
      ],
      demos: [
        {
          id: "context-menu-basic",
          title: "Clic derecho en la zona",
          code: `<ContextMenu>
  <ContextMenuTrigger>…</ContextMenuTrigger>
  <ContextMenuContent>
    <ContextMenuItem>Marcar como leído</ContextMenuItem>
    <ContextMenuItem variant="destructive">Archivar</ContextMenuItem>
  </ContextMenuContent>
</ContextMenu>`,
          render: (
            <ContextMenu>
              <ContextMenuTrigger className="grid h-24 w-full max-w-sm place-items-center rounded-xl border border-dashed border-border text-xs text-muted-foreground">
                Clic derecho aquí
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuLabel>Conversación</ContextMenuLabel>
                <ContextMenuItem>Marcar como leída</ContextMenuItem>
                <ContextMenuItem>Asignar a humano</ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem variant="destructive">Archivar</ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          ),
        },
      ],
    },
    {
      id: "select",
      name: "Select",
      source: "components/ui/select.tsx",
      importLine: 'import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";',
      desc:
        "Desplegable de una sola opción. El disparador comparte la receta de campo "
        + "con Input, así que un Select y un Input en la misma fila se alinean.",
      exports: [
        "Select",
        "SelectTrigger",
        "SelectValue",
        "SelectContent",
        "SelectGroup",
        "SelectLabel",
        "SelectItem",
        "SelectSeparator",
        "SelectScrollUpButton",
        "SelectScrollDownButton",
      ],
      props: [
        { name: "size (Trigger)", type: '"default" | "sm"', def: '"default"', desc: "h-9 y h-8 — los mismos altos que Button." },
        { name: "value / onValueChange", type: "string / (value: string) => void", desc: "Controlado; si no, defaultValue." },
      ],
      demos: [
        {
          id: "select-basic",
          title: "Con grupos",
          code: `<Select defaultValue="opus">
  <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
  <SelectContent>
    <SelectGroup>
      <SelectLabel>Anthropic</SelectLabel>
      <SelectItem value="opus">Claude Opus 5</SelectItem>
    </SelectGroup>
  </SelectContent>
</Select>`,
          render: (
            <>
              <Select defaultValue="opus">
                <SelectTrigger className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Anthropic</SelectLabel>
                    <SelectItem value="opus">Claude Opus 5</SelectItem>
                    <SelectItem value="sonnet">Claude Sonnet 5</SelectItem>
                  </SelectGroup>
                  <SelectSeparator />
                  <SelectGroup>
                    <SelectLabel>Google</SelectLabel>
                    <SelectItem value="gemini">Gemini</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Select defaultValue="es">
                <SelectTrigger size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="es">Español</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                </SelectContent>
              </Select>
            </>
          ),
        },
      ],
    },
    {
      id: "command",
      name: "Command",
      source: "components/ui/command.tsx",
      importLine: 'import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator, CommandShortcut } from "@/components/ui/command";',
      desc:
        "Lista filtrable sobre cmdk. Suelta es un buscador embebido; dentro de "
        + "CommandDialog es la paleta de comandos (⌘K).",
      exports: [
        "Command",
        "CommandDialog",
        "CommandInput",
        "CommandList",
        "CommandEmpty",
        "CommandGroup",
        "CommandItem",
        "CommandShortcut",
        "CommandSeparator",
      ],
      notes: [
        "Al montarse, cmdk selecciona su primera fila y la lleva a la vista con scrollIntoView. Dentro de una página larga eso arrastra el scroll hasta la lista: por eso aquí el buscador embebido se monta a mano.",
      ],
      demos: [
        {
          id: "command-dialog",
          title: "Como paleta",
          desc: "La forma que usa la app: CommandDialog sobre el mismo Command.",
          code: `<CommandDialog open={open} onOpenChange={setOpen} title="Paleta de comandos">
  <CommandInput placeholder="Buscar…" />
  <CommandList>
    <CommandEmpty>Sin resultados.</CommandEmpty>
    <CommandGroup heading="Ir a">
      <CommandItem>Panel</CommandItem>
    </CommandGroup>
  </CommandList>
</CommandDialog>`,
          render: <CommandDialogDemo />,
        },
        {
          id: "command-inline",
          title: "Embebido",
          desc: "Móntalo y escribe para filtrar.",
          code: `<Command>
  <CommandInput placeholder="Buscar…" />
  <CommandList>
    <CommandEmpty>Sin resultados.</CommandEmpty>
    <CommandGroup heading="Ir a">
      <CommandItem>Panel<CommandShortcut>⌘1</CommandShortcut></CommandItem>
    </CommandGroup>
  </CommandList>
</Command>`,
          render: <CommandInlineDemo />,
        },
      ],
    },
    {
      id: "tooltip",
      name: "Tooltip",
      source: "components/ui/tooltip.tsx",
      importLine: 'import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";',
      desc:
        "Etiqueta corta al pasar por encima. El TooltipProvider ya está montado en "
        + "el layout raíz, así que no hace falta volver a envolver.",
      exports: ["Tooltip", "TooltipTrigger", "TooltipContent", "TooltipProvider"],
      props: [
        { name: "side (Content)", type: '"top" | "right" | "bottom" | "left"', def: '"top"', desc: "" },
        { name: "sideOffset (Content)", type: "number", desc: "Separación del disparador, en px." },
      ],
      notes: [
        "Un tooltip no es un nombre accesible: un botón de solo icono necesita además su aria-label.",
      ],
      demos: [
        {
          id: "tooltip-basic",
          title: "Cuatro lados",
          code: `<Tooltip>
  <TooltipTrigger asChild><Button variant="outline">Arriba</Button></TooltipTrigger>
  <TooltipContent>Se envía en cuanto entra el mensaje</TooltipContent>
</Tooltip>`,
          render: (
            <>
              {(["top", "right", "bottom", "left"] as const).map((side) => (
                <Tooltip key={side}>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="sm">{side}</Button>
                  </TooltipTrigger>
                  <TooltipContent side={side}>Se envía al entrar el mensaje</TooltipContent>
                </Tooltip>
              ))}
            </>
          ),
        },
      ],
    },
    {
      id: "hover-card",
      name: "HoverCard",
      source: "components/ui/hover-card.tsx",
      importLine: 'import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";',
      desc: "Como el tooltip, pero con sitio para contenido: una ficha de contacto, un resumen.",
      exports: ["HoverCard", "HoverCardTrigger", "HoverCardContent"],
      demos: [
        {
          id: "hover-card-basic",
          title: "Ficha al pasar",
          code: `<HoverCard>
  <HoverCardTrigger asChild><Button variant="link">@ventas</Button></HoverCardTrigger>
  <HoverCardContent>…</HoverCardContent>
</HoverCard>`,
          render: (
            <HoverCard>
              <HoverCardTrigger asChild>
                <Button variant="link">Agente de ventas</Button>
              </HoverCardTrigger>
              <HoverCardContent className="w-64">
                <p className="text-sm font-medium">Agente de ventas</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  WhatsApp e Instagram · 1.284 conversaciones este mes.
                </p>
              </HoverCardContent>
            </HoverCard>
          ),
        },
      ],
    },
    {
      id: "collapsible",
      name: "Collapsible",
      source: "components/ui/collapsible.tsx",
      importLine: 'import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";',
      desc: "Abrir y cerrar un bloque. Es la base de Reasoning y de Tool.",
      exports: ["Collapsible", "CollapsibleTrigger", "CollapsibleContent"],
      demos: [
        {
          id: "collapsible-basic",
          title: "Abrir un detalle",
          code: `const [open, setOpen] = useState(false);

<Collapsible open={open} onOpenChange={setOpen}>
  <CollapsibleTrigger asChild><Button variant="outline" size="sm">Ver</Button></CollapsibleTrigger>
  <CollapsibleContent>…</CollapsibleContent>
</Collapsible>`,
          render: <CollapsibleDemo />,
        },
      ],
    },
    {
      id: "error-banner",
      name: "ErrorBanner",
      source: "components/ui/error-banner.tsx",
      importLine: 'import { ErrorBanner } from "@/components/ui/error-banner";',
      desc:
        "La única forma en que una pantalla dice «eso no funcionó». Traduce el error "
        + "en el render, no al guardarlo, para que cambiar de idioma lo re-renderice "
        + "en el nuevo. Suena solo cuando aparece, no cuando ya estaba.",
      props: [
        { name: "error", type: "UiError | null", desc: "Lo que falló. Se traduce con uiErrorMessage." },
        { name: "messageKey", type: "string | null", desc: "Atajo de error={{ messageKey }} para fallos locales." },
        { name: "message", type: "string | null", desc: "Una frase ya final. Último recurso: no se re-traduce." },
        { name: "detail", type: "string", desc: "Contexto técnico, en pequeño y debajo." },
        { name: "onRetry", type: "() => void", desc: "Añade el botón de reintentar." },
        { name: "onDismiss", type: "() => void", desc: "Añade la ✕." },
      ],
      demos: [
        {
          id: "error-banner-basic",
          title: "Con reintento y descarte",
          code: `<ErrorBanner
  error={error}
  onRetry={reload}
  onDismiss={() => setError(null)}
/>`,
          render: <ErrorBannerDemo />,
        },
      ],
    },
    {
      id: "orb",
      name: "Orb",
      source: "components/ui/orb.tsx",
      importLine: 'import { Orb } from "@/components/ui/orb";',
      desc:
        "La entrada única de la app a thinking-orbs: la esfera que dice qué verbo "
        + "está haciendo el agente. Resuelve el tema sola, se congela bajo "
        + "prefers-reduced-motion y se pausa fuera de pantalla.",
      props: [
        { name: "state", type: "OrbState", required: true, desc: "working · searching · solving · listening · connecting · weaving · composing · breathing · shaping." },
        { name: "size", type: "20 | 64", def: "20", desc: "20 va en línea con el texto; 64 es para una pantalla vacía." },
        { name: "decorative", type: "boolean", def: "true", desc: "Oculto al lector de pantalla: al lado siempre hay una etiqueta que ya nombra el estado." },
      ],
      demos: [
        {
          id: "orb-states",
          title: "Los nueve estados",
          code: '<Orb state="weaving" />',
          render: (
            <div className="grid w-full grid-cols-3 gap-4 sm:grid-cols-5">
              {ORB_STATES.map((state) => (
                <div key={state} className="flex flex-col items-center gap-1.5">
                  <Orb state={state} />
                  <span className="font-mono text-[10.5px] text-muted-foreground">{state}</span>
                </div>
              ))}
            </div>
          ),
        },
        {
          id: "orb-large",
          title: "Tamaño 64",
          code: '<Orb state="connecting" size={64} />',
          render: <Orb state="connecting" size={64} />,
        },
      ],
    },
    {
      id: "beam",
      name: "Beam",
      source: "components/ui/beam.tsx",
      importLine: 'import { Beam } from "@/components/ui/beam";',
      desc:
        "El halo metálico alrededor de un control. Envuelve al hijo en un <div> "
        + "propio, así que lo posicional va en `style`, no en `className` — el "
        + "paquete inyecta su CSS después de Tailwind y gana por orden.",
      props: [
        { name: "size", type: '"sm" | "md" | "line" | "pulse-inner" | "pulse-outside"', def: '"pulse-outside"', desc: "pulse-outside es la de la casa: florece por fuera en vez de trazar el borde." },
        { name: "colorVariant", type: '"colorful" | "mono" | "ocean" | "sunset"', desc: "Pisa el metal por tema. Normalmente no se toca." },
        { name: "strength", type: "number", def: "0.55", desc: "0–1. En botones va bajo para que sea un tinte, no un espectáculo." },
        { name: "active", type: "boolean", def: "true", desc: "Se desvanece en vez de desmontarse: el envoltorio carga el layout." },
        { name: "borderRadius", type: "number", desc: "Solo si el hijo esconde su propio radio." },
      ],
      notes: [
        "Necesita un hijo opaco con su propio borde de 1px y sitio para desbordar: cualquier overflow:hidden por encima recorta el halo.",
      ],
      demos: [
        {
          id: "beam-button",
          title: "Sobre un botón",
          code: `<Beam strength={0.5}>
  <Button variant="outline">Conectar WhatsApp</Button>
</Beam>`,
          surface: "page",
          render: (
            <div className="p-4">
              <Beam strength={0.5}>
                <Button variant="outline">Conectar WhatsApp</Button>
              </Beam>
            </div>
          ),
        },
      ],
    },
  ],
};
