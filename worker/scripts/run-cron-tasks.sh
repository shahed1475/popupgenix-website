#!/bin/sh
# Runs the lead_finder and research task processors back to back via `docker compose run`.
# Invoked on a schedule (e.g. a VPS crontab entry) — no long-running process, no restart
# policy, just two batch invocations per tick. lead_finder runs first so any leads it merges
# have already auto-enqueued their `research` agent_tasks before the research pass runs.
#
# Intentionally does not `set -e` / chain with `&&`: task:research should still get its turn
# even if task:lead_finder's invocation itself fails (e.g. transient DB connectivity), since
# the two process independent task_type queues.
#
# Usage (from a crontab entry, absolute path since cron's PATH is minimal):
#   */15 * * * * sh /home/ubuntu/apps/drickly/worker/scripts/run-cron-tasks.sh >> /home/ubuntu/apps/drickly/worker/cron.log 2>&1

REPO_ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
cd "$REPO_ROOT" || exit 1

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] cron tick start"
docker compose run --rm drickly-worker npm run task:lead_finder
docker compose run --rm drickly-worker npm run task:research
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] cron tick done"
