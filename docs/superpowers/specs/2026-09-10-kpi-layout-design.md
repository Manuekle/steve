# KPI header and inset plate

Approved direction: use the supplied image's layout while retaining the app's theme-aware surfaces, typography, metal finish and existing metric visuals. The user selected a theme-aware inner background.

## Design

- Place the category icon and label above the metric plate, in reading order.
- Group the value, context or delta, and optional visual inside one rounded inset.
- Use a 24px outer radius, 8px inset and 16px inner radius. Reuse background, shadow, sheen and bevel tokens in both themes.
- Retain animated numbers and the existing bar, split and sparkline renderers. Allow labels and context to wrap on narrow cards.
- Apply through the shared `KpiCard`; match dashboard, automation and skills loading placeholders to the same structure.
- Require a description or delta on every KPI. Runtime, skills, numbers, setup and knowledge provide metric-specific descriptions, including empty and unavailable states, in Spanish and English.

## Verification

Run TypeScript and targeted ESLint checks. Inspect the component catalog at desktop and mobile widths in both themes, including long labels, deltas, zero values and cards without visuals. Check the landing's compact KPI presentation.
