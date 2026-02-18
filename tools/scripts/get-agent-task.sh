#!/usr/bin/env bash
#
# Get current task ID for an agent
#
# Checks tasks DB for in_progress tasks assigned to an agent.
#
# Usage:
#   get-agent-task.sh AGENT_NAME
#
# Output:
#   - task_id (e.g., "squad-abc") if agent is working
#   - Empty string if agent is not working
#   - Exit code 0: Task found
#   - Exit code 1: No task found
#
# Examples:
#   # Get task ID for agent
#   task_id=$(./scripts/get-agent-task.sh FreeMarsh)
#
#   # Check if agent is working
#   if ./scripts/get-agent-task.sh FreeMarsh >/dev/null; then
#       echo "Agent is working"
#   fi
#

set -euo pipefail

# Check arguments
if [[ $# -ne 1 ]]; then
    echo "Usage: $0 AGENT_NAME" >&2
    exit 2
fi

AGENT_NAME="$1"

# STEP 1: Check tasks DB for in_progress tasks assigned to this agent
# This matches IDE logic: agent.in_progress_tasks > 0
if command -v st &>/dev/null; then
    # Get all in_progress tasks assigned to this agent
    in_progress_task=$(st list --status in_progress --json 2>/dev/null | \
        jq -r --arg agent "$AGENT_NAME" '.[] | select(.assignee == $agent) | .id' 2>/dev/null | \
        head -1)

    if [[ -n "$in_progress_task" ]]; then
        echo "$in_progress_task"
        exit 0
    fi
fi

# No task found
exit 1
