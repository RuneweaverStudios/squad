#!/usr/bin/env bash
#
# Get current task ID for an agent
#
# Checks BOTH tasks DB (for in_progress tasks) AND Agent Mail (for file reservations)
# to determine if an agent is actively working on a task.
#
# This provides consistent status calculation between:
#   - Statusline (.claude/statusline.sh)
#   - IDE (ide/src/lib/stores/agents.svelte.ts)
#
# Usage:
#   get-agent-task.sh AGENT_NAME
#
# Output:
#   - task_id (e.g., "jat-abc") if agent is working
#   - Empty string if agent is not working
#   - Exit code 0: Task found
#   - Exit code 1: No task found
#
# Algorithm (matches IDE logic):
#   1. Check JAT Tasks for in_progress tasks assigned to agent
#   2. Check Agent Mail for active file reservations by agent
#   3. Return task_id if found from EITHER source
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
if command -v jt &>/dev/null; then
    # Get all in_progress tasks assigned to this agent
    in_progress_task=$(jt list --status in_progress --json 2>/dev/null | \
        jq -r --arg agent "$AGENT_NAME" '.[] | select(.assignee == $agent) | .id' 2>/dev/null | \
        head -1)

    if [[ -n "$in_progress_task" ]]; then
        echo "$in_progress_task"
        exit 0
    fi
fi

# STEP 2: Check Agent Mail for active file reservations by this agent
# This matches IDE logic: agent.reservation_count > 0
# Extract task ID from reservation reason field (e.g., "jat-abc")
if command -v am-reservations &>/dev/null; then
    reservation_info=$(am-reservations --agent "$AGENT_NAME" 2>/dev/null || true)

    if [[ -n "$reservation_info" ]]; then
        # Extract task ID from "Reason:" field
        # Common patterns: "jat-abc", "task-xyz"
        task_id=$(echo "$reservation_info" | \
            grep "^Reason:" | \
            sed 's/^Reason: //' | \
            grep -oE '(jat|task)-[a-z0-9]{3}\b' | \
            head -1)

        if [[ -n "$task_id" ]]; then
            echo "$task_id"
            exit 0
        fi
    fi
fi

# No task found
exit 1
