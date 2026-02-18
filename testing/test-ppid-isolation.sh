#!/bin/bash
# Test script for PPID session isolation (squad-7kq)
#
# This script tests that PPID-based session tracking works correctly
# for multi-agent statusline support.

set -e

echo "=== PPID Session Isolation Test ==="
echo ""

# Test 1: Check current session setup
echo "Test 1: Current Session Setup"
echo "------------------------------"
echo "Current PPID: $PPID"

if [[ -f "/tmp/claude-session-${PPID}.txt" ]]; then
    session_id=$(cat "/tmp/claude-session-${PPID}.txt" | tr -d '\n')
    echo "✓ Session file exists: /tmp/claude-session-${PPID}.txt"
    echo "  Session ID: $session_id"

    if [[ -f ".claude/agent-${session_id}.txt" ]]; then
        agent_name=$(cat ".claude/agent-${session_id}.txt" | tr -d '\n')
        echo "✓ Agent file exists: .claude/agent-${session_id}.txt"
        echo "  Agent name: $agent_name"
    else
        echo "✗ Agent file missing: .claude/agent-${session_id}.txt"
    fi
else
    echo "✗ Session file missing: /tmp/claude-session-${PPID}.txt"
    echo "  (This is normal if statusline hasn't run yet)"
fi

echo ""

# Test 2: List all session files
echo "Test 2: All Session Files"
echo "--------------------------"
session_count=$(ls -1 /tmp/claude-session-*.txt 2>/dev/null | wc -l)
echo "Found $session_count session files in /tmp:"
ls -lh /tmp/claude-session-*.txt 2>/dev/null | awk '{print "  "$9" ("$5", "$6" "$7" "$8")"}'

echo ""

# Test 3: List all agent files
echo "Test 3: All Agent Files"
echo "-------------------------"
agent_count=$(ls -1 .claude/agent-*.txt 2>/dev/null | wc -l)
echo "Found $agent_count agent files in .claude/:"
for agent_file in .claude/agent-*.txt; do
    if [[ -f "$agent_file" ]]; then
        agent_name=$(cat "$agent_file" 2>/dev/null | tr -d '\n')
        file_size=$(stat -c %s "$agent_file" 2>/dev/null || echo "?")
        echo "  $(basename "$agent_file"): $agent_name (${file_size} bytes)"
    fi
done

echo ""

# Test 4: Check for orphaned files (session files without corresponding agent files)
echo "Test 4: Orphaned Files Check"
echo "------------------------------"
orphaned_sessions=0
for session_file in /tmp/claude-session-*.txt; do
    if [[ -f "$session_file" ]]; then
        session_id=$(cat "$session_file" 2>/dev/null | tr -d '\n')
        ppid=$(basename "$session_file" | sed 's/claude-session-//;s/.txt//')

        if [[ ! -f ".claude/agent-${session_id}.txt" ]]; then
            # Check if process still exists
            if ps -p "$ppid" > /dev/null 2>&1; then
                echo "  ⚠️  Active session without agent file:"
                echo "      Session file: $session_file (PPID: $ppid)"
                echo "      Missing: .claude/agent-${session_id}.txt"
                ((orphaned_sessions++))
            fi
        fi
    fi
done

if [[ $orphaned_sessions -eq 0 ]]; then
    echo "  ✓ No orphaned session files (all active sessions have agent files)"
else
    echo "  ✗ Found $orphaned_sessions orphaned session(s)"
fi

echo ""

# Test 5: Process isolation check
echo "Test 5: Process Isolation"
echo "--------------------------"
echo "Checking if each PPID has unique session tracking..."
declare -A ppid_to_session
conflicts=0

for session_file in /tmp/claude-session-*.txt; do
    if [[ -f "$session_file" ]]; then
        ppid=$(basename "$session_file" | sed 's/claude-session-//;s/.txt//')
        session_id=$(cat "$session_file" 2>/dev/null | tr -d '\n')

        if [[ -n "${ppid_to_session[$ppid]}" ]] && [[ "${ppid_to_session[$ppid]}" != "$session_id" ]]; then
            echo "  ✗ Conflict: PPID $ppid has multiple session IDs!"
            ((conflicts++))
        else
            ppid_to_session[$ppid]="$session_id"
        fi
    fi
done

if [[ $conflicts -eq 0 ]]; then
    echo "  ✓ No conflicts: Each PPID maps to exactly one session ID"
else
    echo "  ✗ Found $conflicts PPID conflict(s)"
fi

echo ""
echo "=== Test Summary ==="
echo "Session files: $session_count"
echo "Agent files: $agent_count"
echo "Orphaned sessions: $orphaned_sessions"
echo "PPID conflicts: $conflicts"

if [[ $orphaned_sessions -eq 0 ]] && [[ $conflicts -eq 0 ]]; then
    echo ""
    echo "✓ All checks passed!"
    exit 0
else
    echo ""
    echo "✗ Some checks failed"
    exit 1
fi
