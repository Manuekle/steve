# App tile charts

## Approved direction

Adapt the supplied blue tile/canvas references to Senka's existing metrics. Keep actual labels, units, filters, data sources, empty states, SEO annotations, and localization. Chat markdown and artifact renderers are outside this change.

## Integration

- The shared `TimeSeries` becomes a tiled area chart with a keyboard/pointer scrubber, four y ticks, five date labels, and continuous curve/scale interpolation.
- Shared ranked comparisons keep their readable horizontal layout for long source, model, and campaign names, with canvas tile fills and animated widths.
- Dashboard channel distribution becomes a tiled donut with a shared wedge/legend hover state and a period-independent total on hover.
- CRM source distribution becomes stacked tiled columns split by the existing contact statuses. No synthetic payment bands or membership plans are introduced.
- CRM day ranges use the existing UTC contact bucketing with 7/14/30/90 days. SEO retains its server-backed range choices. Period controls reuse Senka's native SlidingTabs component and styling.
- Use Senka's existing Card components, borders, radii, spacing and shadows. The user explicitly rejected reference-style nested trays: apply the reference only inside the plots. Inter and existing light/dark themes remain supported.

## Rendering and motion

Canvas backing stores cap DPR at 2 and resize through ResizeObserver. Animation state lives outside React renders. Springs write formatted numbers directly to text nodes. Data updates retarget from the last displayed geometry: area 460ms linear, donut 500ms exponential-out, bars 620ms cubic-out with column staggering. Drift is independent of geometry interpolation. Suspend offscreen/hidden canvases and remove observers/listeners/frames on unmount. Reduced motion jumps geometry and numbers to targets and freezes drift/glow.

Hover has a separate displayed/from/target vector per category: 180ms emphasis entry and 260ms soft return. Interpolate opacity, tile size, donut offset/shadow, and stack highlight color/glow together. Hit testing includes a donut slice's resting position to avoid flicker as it lifts away from the pointer. Rapid hover changes retarget from the on-screen state without restarting data morphs.

Single-category donuts never translate. Hover captions stay in a fixed-height, non-wrapping row so changing labels and numbers cannot push the plot downward.

## Data integrity and accessibility

Zero draws no quantity; invalid/negative geometry inputs clamp to zero. Preserve fractional currency values and caller formatting. Donut proportions use all supplied categories. Canvas is decorative; visible controls and accessible data expose values. Keyboard focus mirrors pointer hover; Escape dismisses readouts. Scrubbers use arrow/Home/End keys. Period selectors are named groups of pressed buttons.

## Verification

Test normalization, geometry, zero/small slices, interpolation interruption, and stack hit testing. Run TypeScript and targeted lint. Browser-check populated/empty/zero/fractional data, rapid retargeting, keyboard and pointer interactions, narrow layouts, DPR, themes, and reduced motion using a development-only fixture.
