#!/usr/bin/env node
// Vendor-side Enterprise license issuer. Not part of the self-hosted app —
// see ./README.md for why this never ships to a customer.
//
// Reimplements the tiny token format from lib/license/verify.ts instead of
// importing it, deliberately: this script has to run standalone, on
// whatever machine Steve issues licenses from, without a `pnpm install` of
// the whole app or a TypeScript toolchain.
//
//   node scripts/license/issue-license.mjs generate-keypair
//   node scripts/license/issue-license.mjs issue \
//     --company "Acme Ecommerce" --email ops@acme.example \
//     --edition enterprise --maintenance-months 12 \
//     --key-id steve-2026-dev --private-key-file ./private.pem \
//     --installation-id <id the customer copied from Settings > License>

import { generateKeyPairSync, createPrivateKey, sign as cryptoSign, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) {
        args[key] = true;
      } else {
        args[key] = next;
        i++;
      }
    } else {
      args._.push(token);
    }
  }
  return args;
}

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

function cmdGenerateKeypair() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  console.log("# Public key — add this to lib/license/keys.ts under a new keyId:\n");
  console.log(publicKey.export({ type: "spki", format: "pem" }).toString());
  console.log("# Private key — keep this OUTSIDE the repo. Store it in a secrets");
  console.log("# manager or an encrypted vault; issue-license needs it via --private-key-file.\n");
  console.log(privateKey.export({ type: "pkcs8", format: "pem" }).toString());
}

function cmdIssue(args) {
  const company = args.company;
  const email = args.email;
  const edition = args.edition ?? "enterprise";
  const maintenanceMonths = Number(args["maintenance-months"] ?? 12);
  const keyId = args["key-id"];
  const privateKeyFile = args["private-key-file"];
  // Optional on purpose: a license issued without this binds to nothing, and
  // verify.ts treats an unbound license the same as one whose binding
  // matches — never a mismatch. Omit it for a quote/trial token issued
  // before the customer has even installed anything to get an id from.
  const installationId = args["installation-id"];
  const features = (args.features ?? "whatsapp,instagram,messenger,web-chat,agents,automations,knowledge-base,meta-ads,sandbox")
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);

  if (!company) fail("--company is required");
  if (!email) fail("--email is required");
  if (!keyId) fail("--key-id is required (must match an entry in lib/license/keys.ts)");
  if (!privateKeyFile) fail("--private-key-file is required — never pass the key inline");
  if (!Number.isFinite(maintenanceMonths) || maintenanceMonths <= 0) {
    fail("--maintenance-months must be a positive number");
  }

  const privateKeyPem = readFileSync(privateKeyFile, "utf-8");
  const privateKey = createPrivateKey(privateKeyPem);

  const issuedAt = new Date();
  const maintenanceUntil = new Date(issuedAt);
  maintenanceUntil.setUTCMonth(maintenanceUntil.getUTCMonth() + maintenanceMonths);

  const payload = {
    licenseId: randomUUID(),
    company,
    customerEmail: email,
    edition,
    deploymentType: "self-hosted",
    features,
    issuedAt: issuedAt.toISOString(),
    maintenanceUntil: maintenanceUntil.toISOString(),
    ...(installationId ? { installationId } : {}),
    schemaVersion: 1,
  };

  const payloadBytes = Buffer.from(JSON.stringify(payload), "utf-8");
  const signature = cryptoSign(null, payloadBytes, privateKey);
  const token = `${keyId}.${payloadBytes.toString("base64url")}.${signature.toString("base64url")}`;

  console.log("# License payload (for your records):\n");
  console.log(JSON.stringify(payload, null, 2));
  console.log("\n# License token (give this to the customer — paste into Settings > License):\n");
  console.log(token);
}

const args = parseArgs(process.argv.slice(2));
const command = args._[0];

if (command === "generate-keypair") {
  cmdGenerateKeypair();
} else if (command === "issue") {
  cmdIssue(args);
} else {
  console.log("Usage:");
  console.log("  node scripts/license/issue-license.mjs generate-keypair");
  console.log("  node scripts/license/issue-license.mjs issue --company ... --email ... --key-id ... --private-key-file ...");
  process.exit(command ? 1 : 0);
}
