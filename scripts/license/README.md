# License issuing — vendor side only

`issue-license.mjs` signs Enterprise license tokens. It is checked into this
repository because the *verifier* (`lib/license/verify.ts`) has to ship with
every self-hosted install, and the issuer shares its token format — but the
issuer itself is not something a customer runs.

The distinction that matters: this script needs the **private** key; every
self-hosted install only ever holds the matching **public** key
(`lib/license/keys.ts`). Having this file in the repo does not hand out the
ability to mint valid licenses — that ability lives entirely in whoever holds
the private key file, which is never committed and never shipped.

## One-time setup

```bash
node scripts/license/issue-license.mjs generate-keypair
```

Add the printed public key to `lib/license/keys.ts` under a new `keyId`
(e.g. `"steve-2026"`). Store the private key in a secrets manager or an
encrypted vault outside this repository — losing it means re-keying every
future license; leaking it means anyone can mint valid Enterprise licenses.

## Issuing a license

Ask the customer for their installation id first — **Settings › Enterprise
license** shows it (and lets them copy it) even with no license loaded yet,
because generating it doesn't depend on having one. Binding a license to it
is what makes the license unique to that install instead of a file anyone
could copy elsewhere:

```bash
node scripts/license/issue-license.mjs issue \
  --company "Acme Ecommerce" \
  --email ops@acme.example \
  --edition enterprise \
  --maintenance-months 12 \
  --key-id steve-2026 \
  --installation-id <the id they sent you> \
  --private-key-file /path/to/private.pem
```

Prints the payload (keep it for records — support, renewals, audits) and the
signed token. The token is what the customer pastes into **Settings ›
Enterprise license** in their self-hosted install; `POST /api/license`
verifies it against the public key baked into their build before persisting
it.

`--installation-id` is optional — omit it for a quote or trial token issued
before the customer has installed anything to get an id from. An unbound
license is treated the same as a matching one (see
`lib/license/verify.ts#deriveLicenseInfo`): binding is a signal for support
conversations, not a lock. A self-hosted install has to keep working even if
someone copies its license file elsewhere, and even if it's reinstalled from
scratch and gets a new installation id of its own — that's the same
offline-first, never-block guarantee `maintenanceUntil` gets, applied here.

`--edition` accepts any string — `enterprise` today, and whatever a future
Partner/OEM tier is named tomorrow, without any change to this script or to
`lib/license/verify.ts`. See `docs/commercial-licensing.md` for how that
extensibility is meant to be used.
