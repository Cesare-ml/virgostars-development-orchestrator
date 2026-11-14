#!/usr/bin/env bash
# Used by .github/workflows/fleet-queue.yml.
#   fleet-publish.sh queue   QUEUE_JSON   -> force-publish queue.json as the single commit of branch agent-queue
#   fleet-publish.sh archive LEDGER_DIR   -> remove claim folders expired > 6h from agent-ledger (history keeps them)
# Needs GITHUB_TOKEN and GITHUB_REPOSITORY. Never touches any other branch.
set -euo pipefail
mode=${1:?mode}; arg=${2:?path}
remote="${FLEET_REMOTE:-https://github.com/${GITHUB_REPOSITORY:?}.git}"
auth=(-c "http.extraheader=AUTHORIZATION: basic $(printf 'x-access-token:%s' "${GITHUB_TOKEN:?}" | base64 -w0)")
id=(-c user.name=fleet-queue -c user.email=41898282+github-actions[bot]@users.noreply.github.com)
here=$(cd "$(dirname "$0")/.." && pwd)

case $mode in
  queue)
    d=$(mktemp -d); git -C "$d" init -q -b agent-queue
    cp "$arg" "$d/queue.json"
    printf '# agent-queue\n\nqueue.json is rebuilt every ~20 minutes by the Fleet queue workflow. Read-only for agents (AGENT_START.md §1).\n' > "$d/README.md"
    git -C "$d" add queue.json README.md
    git -C "$d" "${id[@]}" commit -q -m "queue: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    git -C "$d" "${auth[@]}" push -q -f "$remote" agent-queue
    ;;
  archive)
    for attempt in 1 2 3; do
      git -C "$arg" "${auth[@]}" fetch -q --depth 1 origin agent-ledger
      git -C "$arg" reset -q --hard origin/agent-ledger
      mapfile -t old < <(node "$here/scripts/archive-ledger.mjs" "$arg")
      [ ${#old[@]} -eq 0 ] && { echo "archive: nothing expired"; exit 0; }
      git -C "$arg" rm -r -q -- "${old[@]}"
      git -C "$arg" "${id[@]}" commit -q -m "ledger: archive ${#old[@]} claim folders expired > 6h"
      if git -C "$arg" "${auth[@]}" push -q origin HEAD:agent-ledger; then echo "archive: removed ${#old[@]}"; exit 0; fi
      echo "archive: ledger moved, retrying ($attempt)"; sleep $((attempt * 5))
    done
    echo "archive: gave up this run"; exit 0
    ;;
  *) echo "unknown mode $mode" >&2; exit 2;;
esac
