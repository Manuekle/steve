# Team Page Design

## Goal

Add a public `/team` page for Senka that presents the team with a clear,
editorial visual language inspired by Y Combinator: direct, restrained,
human, and focused on people rather than decoration.

## Scope

- Add public Next.js route at `app/team/page.tsx`.
- Add page component under `app/team/_components/`.
- Reuse `MarketingShell`, public page header patterns, grain/reveal utilities,
  metadata helpers, and existing design tokens.
- Keep all people data as visible placeholders until real team content exists.
- Do not add database models, CMS integration, filters, profile routes, or
  external image dependencies.

## Visual Direction

- Warm white/light surface, soft black text, hairline borders, and restrained
  red accent.
- Hero eyebrow uses Geist Mono with a technical `TEAM / SENKA` label.
- Main headline uses Cooper for warmth and personality.
- Section headings use Saans for the product's established display voice.
- Body copy uses Inter for legibility.
- Metadata such as role, location, and social labels uses Geist Mono.
- Large negative space and asymmetric editorial rhythm; avoid generic cards,
  gradients, and excessive motion.

## Page Structure

1. Shared marketing shell with public navigation and footer.
2. Hero section with eyebrow, Cooper headline, and concise mission paragraph.
3. Featured placeholder profile with initials avatar, name, role, and bio.
4. Responsive team grid with five additional placeholder profiles.
5. Mission block explaining what the team is building.
6. Hiring/contact CTA linking to the existing contact destination.

## Placeholder Content

Use clearly marked content such as `Nombre del equipo`, `Co-founder`, and
`Perfil próximamente`. Initials avatars are CSS-only and do not imply real
photography. Keep placeholder data in one typed local array so replacement is
mechanical when real content arrives.

## Responsive and Accessibility Requirements

- Three columns on large screens, two on medium screens, one on small screens.
- Featured profile stacks cleanly on small screens.
- Use semantic `main`, `section`, `article`, headings, and navigation links.
- Every profile link has descriptive accessible text.
- Initials avatars are decorative when adjacent text already identifies a
  person; otherwise provide equivalent accessible text.
- Preserve visible keyboard focus and AA text contrast.
- Respect existing reduced-motion behavior from shared reveal utilities.

## Metadata

Add Spanish title and description through `marketingMetadata` with canonical
path `/team`.

## Verification

- Run `pnpm typecheck`.
- Run `pnpm lint`.
- Run `pnpm build:web` if time permits; existing unrelated worktree changes
  must remain untouched.
