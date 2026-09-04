#!/usr/bin/env bash
# One verified dump of this installation's Postgres, kept off the database host.
#
# The counterpart to deploy/roles/backup for anyone not running the Ansible
# path: a managed Postgres (Supabase, Neon, RDS) whose provider's own backups
# you cannot inspect, or do not want to be your only copy.
#
#   ./scripts/backup-postgres.sh
#
# Reads the connection string from $WORKFLOW_POSTGRES_URL, or from the first
# file in $ENV_FILES that defines it. It is never echoed — it carries the
# database password.
#
#   BACKUP_DIR            where dumps go            (default ~/steve-backups)
#   BACKUP_RETENTION      how many to keep          (default 14)
#   BACKUP_OFFSITE_DIR    copy each dump here too   (see "Offsite")
#   BACKUP_OFFSITE_COMMAND  run this with the dump path as $1
#   BACKUP_POSTGRES_URL   dump through this instead (see "Which connection")
#   PG_DUMP               path to a specific pg_dump
#   ENV_FILES             colon-separated overrides (default .env.prod:.env.local:.env)
#
# ── Which connection ─────────────────────────────────────────────────────────
#
# Not the pooler. A dump through Supabase's pooler died after fifteen minutes
# with `SSL error: unexpected eof while reading` partway through reading
# triggers: pg_dump holds one long session and issues many statements, which is
# the shape a pooler is least suited to, and Supabase says to use the direct
# connection for exactly this. So when the configured string points at
# `*.pooler.supabase.com`, this rewrites it to `db.<ref>.supabase.co` — same
# password, user `postgres` rather than `postgres.<ref>`. Set
# BACKUP_POSTGRES_URL to override, or on any other provider the string is used
# unchanged.
#
# One caveat that decides the tool below: Supabase's direct host is IPv6-only
# on projects without the IPv4 add-on. Docker Desktop has no IPv6 by default,
# so a containerised pg_dump cannot reach it — verified, "Network is
# unreachable". Hence a host pg_dump first.
#
# ── Offsite ──────────────────────────────────────────────────────────────────
#
# A dump on the same laptop as nothing else is still one disk away from being
# no backup at all: lose the machine and you lose both it and your access to
# the thing it was protecting. So there are two ways out, and neither hardcodes
# a provider or wants a credential this script has any business holding.
#
#   BACKUP_OFFSITE_DIR      a directory — iCloud Drive, Dropbox, a mounted
#                           external disk. Copied there and pruned to the same
#                           retention. Zero setup on a Mac.
#   BACKUP_OFFSITE_COMMAND  anything else, invoked with the dump path as "$1":
#                           `aws s3 cp`, rclone, restic, scp, your own script.
#
# What a synced folder does and does not buy, plainly: it protects against
# losing the machine, which is the risk here. It does not protect against a bad
# write, because sync propagates deletions and corruption too. Object storage
# with versioning is the stronger answer when the data justifies it.
#
# A failed offsite step never deletes the local dump and never rewrites
# history — it logs and exits non-zero, so a scheduled run that stopped copying
# is visible instead of silently local-only.
#
# ── Which pg_dump ────────────────────────────────────────────────────────────
#
# pg_dump refuses to dump a server newer than itself, and Homebrew's
# postgresql@16 cannot touch Supabase's 17.x at all. This looks for a new
# enough one on the host (`brew install libpq` puts a current one in a keg-only
# prefix, where it shadows nothing) and falls back to a `postgres:17` container
# when there is none — fine for any database Docker can actually reach.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$HOME/steve-backups}"
BACKUP_RETENTION="${BACKUP_RETENTION:-14}"
ENV_FILES="${ENV_FILES:-.env.prod:.env.local:.env}"
IMAGE="postgres:17"

log() { printf '%s  %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
fail() { log "ERROR: $*"; exit 1; }

# ── the connection string ────────────────────────────────────────────────────
url="${BACKUP_POSTGRES_URL:-${WORKFLOW_POSTGRES_URL:-}}"
if [ -z "$url" ]; then
  IFS=: read -r -a candidates <<< "$ENV_FILES"
  for name in "${candidates[@]}"; do
    file="$REPO/$name"
    [ -f "$file" ] || continue
    line="$(grep -m1 '^WORKFLOW_POSTGRES_URL=' "$file" 2>/dev/null || true)"
    value="${line#WORKFLOW_POSTGRES_URL=}"
    value="${value%\"}"; value="${value#\"}"
    if [ -n "$value" ]; then
      url="$value"
      log "connection string from ${name}"
      break
    fi
  done
fi
[ -n "$url" ] || fail "no connection string in the environment or in ${ENV_FILES}"

if [ -z "${BACKUP_POSTGRES_URL:-}" ] && [[ "$url" == *pooler.supabase.com* ]]; then
  ref="$(printf '%s' "$url" | sed -nE 's|^[a-z]+://postgres\.([a-z0-9]+):.*|\1|p')"
  if [ -n "$ref" ]; then
    url="$(printf '%s' "$url" | sed -E "s|://postgres\.[a-z0-9]+:|://postgres:|; s|@[^/]*/|@db.${ref}.supabase.co:5432/|")"
    log "rewrote the pooler string to the direct host (db.${ref}.supabase.co)"
  fi
fi
host="$(printf '%s' "$url" | sed -E 's|.*@([^/?]*).*|\1|')"
log "target ${host}"

mkdir -p "$BACKUP_DIR"; chmod 700 "$BACKUP_DIR"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
target="$BACKUP_DIR/steve-${stamp}.dump"
partial="${target}.partial"
cleanup() { rm -f "$partial" "${envfile:-}"; }
trap cleanup EXIT

# ── pick a pg_dump ───────────────────────────────────────────────────────────
pgdump=""
for candidate in \
  "${PG_DUMP:-}" \
  /opt/homebrew/opt/libpq/bin/pg_dump \
  /usr/local/opt/libpq/bin/pg_dump \
  /opt/homebrew/opt/postgresql@17/bin/pg_dump \
  "$(command -v pg_dump 2>/dev/null || true)"; do
  [ -n "$candidate" ] && [ -x "$candidate" ] || continue
  major="$("$candidate" --version | sed -nE 's/.* ([0-9]+)\..*/\1/p')"
  if [ -n "$major" ] && [ "$major" -ge 17 ]; then pgdump="$candidate"; break; fi
done

# Only what the app owns. `postgres` on a managed instance also carries the
# provider's schemas — Supabase keeps auth, storage and realtime there — which
# this app does not own and must not haul around in its backups.
schemas=(--schema=steve --schema=workflow --schema=credits)

if [ -n "$pgdump" ]; then
  log "dumping with $("$pgdump" --version)"
  PGCONNECT_TIMEOUT=30 "$pgdump" "$url" --format=custom --no-owner --no-acl \
    "${schemas[@]}" --file="$partial" 2>&1 | sed 's/^/  /' || fail "pg_dump failed"
  restore=$(dirname "$pgdump")/pg_restore
  "$restore" --list "$partial" >/dev/null 2>&1 || fail "the dump is not a readable archive"
else
  # No host client new enough. Works wherever Docker can reach the database —
  # not Supabase's IPv6-only direct host.
  command -v docker >/dev/null 2>&1 || fail "no pg_dump >= 17 on the host and no docker; run: brew install libpq"
  docker info >/dev/null 2>&1 || fail "the Docker daemon is not running — start Docker Desktop; today's backup was skipped"
  log "no host pg_dump >= 17; falling back to ${IMAGE}"
  envfile="$(mktemp)"; chmod 600 "$envfile"
  # An env-file, not `-e`: the password would otherwise sit in `ps` output.
  printf 'PGURL=%s\n' "$url" > "$envfile"
  docker run --rm --env-file "$envfile" -v "$BACKUP_DIR:/out" \
    -e "OUTFILE=/out/$(basename "$partial")" "$IMAGE" \
    sh -c 'pg_dump "$PGURL" --format=custom --no-owner --no-acl --schema=steve --schema=workflow --schema=credits --file="$OUTFILE"' \
    2>&1 | sed 's/^/  /' || fail "pg_dump failed"
  docker run --rm -v "$BACKUP_DIR:/out" "$IMAGE" \
    pg_restore --list "/out/$(basename "$partial")" >/dev/null 2>&1 \
    || fail "the dump is not a readable archive"
fi

mv "$partial" "$target"; chmod 600 "$target"
trap - EXIT; cleanup
log "wrote $(basename "$target") ($(du -h "$target" | cut -f1))"

# ── offsite ──────────────────────────────────────────────────────────────────
offsite_failed=0
offsite_done=0

if [ -n "${BACKUP_OFFSITE_DIR:-}" ]; then
  if mkdir -p "$BACKUP_OFFSITE_DIR" 2>/dev/null; then
    # A temp name then a rename, so a copy interrupted by a closing lid or a
    # sync client cannot leave a truncated file wearing a finished name.
    tmp="$BACKUP_OFFSITE_DIR/.$(basename "$target").partial"
    if cp "$target" "$tmp" 2>/dev/null && mv "$tmp" "$BACKUP_OFFSITE_DIR/$(basename "$target")"; then
      chmod 600 "$BACKUP_OFFSITE_DIR/$(basename "$target")" 2>/dev/null || true
      log "copied offsite to ${BACKUP_OFFSITE_DIR}"
      offsite_done=1
      while IFS= read -r old_remote; do
        rm -f "$old_remote" && log "pruned offsite $(basename "$old_remote")"
      done < <(ls -1 "$BACKUP_OFFSITE_DIR"/steve-*.dump 2>/dev/null | sort -r | tail -n "+$((BACKUP_RETENTION + 1))")
    else
      rm -f "$tmp" 2>/dev/null || true
      log "ERROR: could not copy to ${BACKUP_OFFSITE_DIR}"
      offsite_failed=1
    fi
  else
    log "ERROR: ${BACKUP_OFFSITE_DIR} does not exist and could not be created"
    offsite_failed=1
  fi
fi

if [ -n "${BACKUP_OFFSITE_COMMAND:-}" ]; then
  log "running the offsite command"
  if "${BACKUP_OFFSITE_COMMAND}" "$target" 2>&1 | sed 's/^/  /'; then
    log "offsite command finished"
    offsite_done=1
  else
    log "ERROR: the offsite command failed"
    offsite_failed=1
  fi
fi

if [ "$offsite_done" -eq 0 ] && [ "$offsite_failed" -eq 0 ]; then
  log "WARNING: no offsite destination configured — this dump exists only on this machine"
fi

# ── retention ────────────────────────────────────────────────────────────────
# `sort -r | tail -n +N`, not `sort | head -n -N`: the negative-count form of
# head is a GNU extension, and macOS ships BSD head where it errors — quietly,
# because the failing pipeline only feeds the loop and `set -e` never sees it.
# That exact bug silently disabled retention in the Ansible role.
removed=0
while IFS= read -r old; do
  rm -f "$old"; log "pruned $(basename "$old")"; removed=$((removed + 1))
done < <(ls -1 "$BACKUP_DIR"/steve-*.dump 2>/dev/null | sort -r | tail -n "+$((BACKUP_RETENTION + 1))")
kept="$(ls -1 "$BACKUP_DIR"/steve-*.dump 2>/dev/null | wc -l | tr -d ' ')"
log "done — ${kept} kept, ${removed} pruned, retention ${BACKUP_RETENTION}"

# Last, so a failed copy still leaves a good local dump and a pruned directory
# behind it. Non-zero because a backup that quietly stopped leaving the machine
# is the failure you find out about at the worst moment.
[ "$offsite_failed" -eq 0 ] || exit 1
