#!/usr/bin/env bash
# Install (or remove) the daily backup as a launchd agent on this Mac.
#
#   ./scripts/install-backup-agent.sh            # daily at 13:30 local
#   ./scripts/install-backup-agent.sh --at 03:30 # a different hour
#   ./scripts/install-backup-agent.sh --status
#   ./scripts/install-backup-agent.sh --run      # run it now, through launchd
#   ./scripts/install-backup-agent.sh --uninstall
#
# The default hour is the middle of the day on purpose. A laptop is usually
# asleep at 03:00 and launchd will not wake it, so an overnight schedule quietly
# turns into "whenever the lid next opens". Backing up while the machine is
# already awake is the version that actually runs daily.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LABEL="dev.steve.backup"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
TEMPLATE="$REPO/scripts/launchd/${LABEL}.plist.template"
RETENTION="${BACKUP_RETENTION:-14}"
AT="13:30"
ACTION="install"

while [ $# -gt 0 ]; do
  case "$1" in
    --at) AT="$2"; shift 2 ;;
    --status) ACTION="status"; shift ;;
    --run) ACTION="run"; shift ;;
    --uninstall) ACTION="uninstall"; shift ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

[ "$(uname -s)" = "Darwin" ] || { echo "launchd is macOS only; on Linux use deploy/roles/backup" >&2; exit 1; }

case "$ACTION" in
  status)
    launchctl list | grep -E "PID|$LABEL" || echo "not loaded"
    echo
    [ -f "$HOME/steve-backups/backup.log" ] && tail -20 "$HOME/steve-backups/backup.log" || echo "(no log yet)"
    exit 0 ;;
  run)
    launchctl kickstart -p "gui/$(id -u)/$LABEL"
    echo "started; watch: tail -f ~/steve-backups/backup.log"
    exit 0 ;;
  uninstall)
    launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
    rm -f "$PLIST"
    echo "removed. Dumps in ~/steve-backups were left alone."
    exit 0 ;;
esac

hour="${AT%%:*}"; minute="${AT##*:}"
[[ "$hour" =~ ^[0-9]{1,2}$ && "$minute" =~ ^[0-9]{1,2}$ ]] || { echo "--at wants HH:MM" >&2; exit 2; }

mkdir -p "$HOME/Library/LaunchAgents" "$HOME/steve-backups"
chmod 700 "$HOME/steve-backups"

sed -e "s|__REPO__|$REPO|g" \
    -e "s|__HOME__|$HOME|g" \
    -e "s|__RETENTION__|$RETENTION|g" \
    -e "s|__HOUR__|$((10#$hour))|g" \
    -e "s|__MINUTE__|$((10#$minute))|g" \
    "$TEMPLATE" > "$PLIST"

# bootout first so re-running this picks up an edited plist rather than
# silently keeping the loaded one.
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"

echo "installed ${LABEL} — daily at ${hour}:${minute} local, keeping ${RETENTION}"
echo "  plist:  $PLIST"
echo "  dumps:  $HOME/steve-backups"
echo "  log:    $HOME/steve-backups/backup.log"
echo "  status: ./scripts/install-backup-agent.sh --status"
