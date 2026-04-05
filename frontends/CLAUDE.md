<!-- OPENFLEET:START -->
# OpenFleet

# OpenFleet Commands

Post to your channel: openfleet post "<msg>"
Message parent: node /Users/twaldin/openfleet/bin/send --to-parent --sender frontend-final --message "<update>"

## Completion Protocol
When job is done: node /Users/twaldin/openfleet/bin/report-completion <job-id> --summary "<summary>"

## Blocked Task Protocol
When blocked on a task: node /Users/twaldin/openfleet/bin/task-state task update <task-id> --status blocked --blocked-on "<need>"

## Compaction Protocol
When context is heavy or told to compact:
1. Save state to ~/.openfleet/agents/frontend-final/MEMORY.md
2. Append today's key events to ~/.openfleet/agents/frontend-final/memory/YYYY-MM-DD.md
3. Post status to your channel
4. Message parent: "Compacted. State saved."
On restart: read SOUL.md, MEMORY.md, and today's log first.
<!-- OPENFLEET:END -->
