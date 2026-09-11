# Legal pages, privacy controls, and SEO

## Approved scope

Senka is operated by an individual established in Colombia, serving Latin America and the United States. The owner asked to implement the pages now and fill in identifying details later.

- Public Spanish/English legal notice, terms, privacy policy, privacy-rights procedure, and cookie policy.
- Independent optional consent for Google Analytics (public page visits) and PostHog (product screen visits).
- No tracking before consent, after rejection, or while Global Privacy Control is enabled. No session replay, form capture, account identification, or cross-site advertising features.
- Six-month, versioned browser preference; new analytics configuration requires a new choice. Preferences can be reopened from the footer or Privacy page.
- Public metadata, crawlable rendering assets, guide/legal sitemap entries, and noindex for private/auth surfaces and incomplete legal documents.

## Owner setup

1. Complete `content/entity.json`: real full name, address for legal notices, working email, phone, and tax/registration details when applicable. Do not publish a personal identification number unless legally required. `jurisdiction` is Colombia; mandatory foreign consumer/privacy rights remain unaffected.
2. Complete `content/legal-operations.json`: production hosting/database/storage providers, countries, and actual retention/backups/deletion arrangements. These cannot be inferred from installed libraries. Confirm processor agreements and international-transfer mechanisms for the actual services used.
3. Set `NEXT_PUBLIC_SITE_URL` to the canonical HTTPS domain. Keep analytics variables empty until configured. Preview deployments are noindex.
4. Optional Google Analytics: set `NEXT_PUBLIC_GA_MEASUREMENT_ID`. Turn OFF enhanced measurement (including history-based page changes, forms, outbound links and downloads), Google Signals, user-provided data collection, and advertising personalization in the property. This integration sends only explicit, sanitized public page views. Configure data retention in the provider and document it in operations.
5. Optional PostHog: set `NEXT_PUBLIC_POSTHOG_KEY` and `NEXT_PUBLIC_POSTHOG_HOST` to the project's US/EU ingestion origin. This integration uses the Capture API, not an autocapture/replay SDK. Only allowlisted screen names and a browser-session random identifier are sent. Set provider retention in the project and document it in operations.
6. Rebuild after changing public environment values. A browser choice is not a server-side audit trail or consent to customer marketing. No automatic account erasure, subject-request ticket system, or contractual acceptance audit trail is claimed by these pages.
7. Review the final documents and operating procedures with Colombian counsel, including consumer rules, tax duties, processor contracts, and requirements in destination markets. A published policy does not itself implement retention jobs, fulfill rights requests, or establish lawful international transfers.

## Operational verification

- Fresh browser: optional requests absent until acceptance; rejecting makes no analytics requests.
- Granular choice: only the selected, configured provider receives events.
- Privacy/footer: reopen, withdraw, refresh, and check another open tab.
- Expired, malformed, old-version or changed-configuration preferences default to off.
- GPC forces optional tracking off. Authentication/reset/public customer forms are never measured.
- Analytics payloads exclude query strings, fragments, customer IDs, contact details, chat text and document names. Revocation cannot recall requests already transmitted.
- Deletion/export requests go to the published contact, with proportionate identity verification and the response deadlines described on `/privacy-rights`.

## References

- Colombia: Law 1581/2012 (especially arts. 8–17 and 26), Decree 1074/2015, and Law 1480/2011 where applicable. Official legislative endpoints were unavailable during implementation; verify current consolidated wording before publishing.
- SIC: https://www.sic.gov.co/tema/proteccion-de-datos-personales
- GDPR: https://eur-lex.europa.eu/eli/reg/2016/679/oj
- California privacy rights: https://oag.ca.gov/privacy/ccpa
- Google consent: https://developers.google.com/tag-platform/security/guides/consent
- PostHog Capture API: https://posthog.com/docs/api/capture

## Scope decisions

Keep unknown identity and deployment facts explicit instead of inventing an incorporated company, EU hosting, model-training exclusions, or fixed deletion guarantees. The English policy is a translation; Spanish is the reference subject to mandatory language and consumer requirements. In-house exempt analytics from the supplied example is not implemented or claimed.

## Verification performed

- `pnpm exec vitest run lib/analytics-consent.test.ts`: nine tests covering malformed/expired consent, changed configurations, rejection, granular provider choice, minimized payloads, withdrawal during script loading, GPC, and blocked browser storage.
- `pnpm typecheck`, targeted ESLint, and `pnpm build:web`: passed. The local Node version was 26, while this project declares Node 24.
- Headless Chrome against local Next.js: all five legal routes, guide and pricing return 200, one H1 and canonical metadata; 390px layout has no horizontal overflow. Browser choice persists, another tab's reset is observed, Escape closes preferences and restores focus, English updates both content and document language, and robots/sitemap reflect the intended pages.
- With analytics unconfigured, browser emitted no Google Analytics or PostHog requests and no page exceptions. Configured-provider behavior was checked with isolated mocked transport tests; live analytics account ingestion and dashboard settings require the owner's provider configuration.
