# Category badge color

Approved direction: soft but visible tinted backgrounds, with colored text and icons.

## Scope

- Automation list: step badges use the same type hues as canvas nodes.
- Step picker and properties panel: icon tiles carry the matching step hue.
- Agents: capability chips share their colors between cards and the picker.
- Channels: shared badges distinguish Web, WhatsApp, Instagram, forms and voice.

## Implementation

`CategoryBadge` owns category foreground/background styles for light, dark and increased-contrast appearances. An absent hue falls back to neutral tokens. Step hues live in `workflow-step-meta.ts`; capability hues live alongside capability metadata. Labels and icons continue to identify categories independently of color. Existing unconfigured-capability warning treatment remains distinct.

## Verification

Run TypeScript and targeted ESLint checks. Render all step, capability and channel badges in the development component catalog; check foreground/background contrast, wrapping and screenshots in both themes. Authenticated page verification requires a browser session.
