#!/usr/bin/env bash
# Comprehensive end-to-end test of Agent Mail bash tools
# Demonstrates: registration, messaging, file reservations, search, and acknowledgments

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Use a test database
export AGENT_MAIL_DB="/tmp/test-agent-mail.db"
rm -f "$AGENT_MAIL_DB"

echo "════════════════════════════════════════════════════════════"
echo "Agent Mail Workflow Test"
echo "Database: $AGENT_MAIL_DB"
echo "════════════════════════════════════════════════════════════"
echo ""

echo "1. Register three agents..."
./am-register --name Alice --program claude-code --model sonnet-4.5 --task "Frontend development"
./am-register --name Bob --program cursor --model gpt-4 --task "Backend development"
./am-register --name Carol --program aider --model claude-3 --task "Testing and QA"
echo ""

echo "2. List all agents..."
./am-agents
echo ""

echo "3. Alice reserves frontend files for task bd-101..."
./am-reserve "src/components/**" --agent Alice --ttl 7200 --reason "bd-101" --exclusive
echo ""

echo "4. Bob tries to reserve same files (should fail)..."
./am-reserve "src/components/**" --agent Bob --ttl 3600 --reason "bd-102" 2>&1 || echo "(Expected conflict)"
echo ""

echo "5. Bob reserves backend files instead..."
./am-reserve "api/**" --agent Bob --ttl 7200 --reason "bd-102" --exclusive
echo ""

echo "6. Carol reserves test files (shared lock)..."
./am-reserve "tests/**" --agent Carol --ttl 7200 --reason "bd-103" --shared
echo ""

echo "7. List all active reservations..."
./am-reservations
echo ""

echo "8. Alice sends project kickoff message..."
./am-send "[bd-101] Starting frontend refactor" \
  "I'm beginning work on the component refactor. Will update in a few hours." \
  --from Alice --to Bob,Carol --thread bd-101 --importance high --ack
echo ""

echo "9. Bob sends backend update..."
./am-send "[bd-102] API changes ready" \
  "The new REST endpoints are implemented. Please review when you have time." \
  --from Bob --to Alice --cc Carol --thread bd-102 --importance normal
echo ""

echo "10. Check Bob's inbox (should have 1 message)..."
./am-inbox Bob
echo ""

echo "11. Bob marks Alice's message as read and acknowledges it..."
./am-inbox Bob --thread bd-101 --mark-read
./am-ack 1 --agent Bob
echo ""

echo "12. Check Alice's inbox..."
./am-inbox Alice
echo ""

echo "13. Alice replies to Bob's message..."
./am-reply 2 "Great work on the API! I'll review it tomorrow." --agent Alice
echo ""

echo "14. Carol checks her inbox..."
./am-inbox Carol
echo ""

echo "15. Search for messages about 'API'..."
./am-search "API"
echo ""

echo "16. Search within thread bd-102..."
./am-search "review" --thread bd-102
echo ""

echo "17. Check Alice's status..."
./am-whoami --agent Alice
echo ""

echo "18. Alice finishes work and releases her reservation..."
./am-release "src/components/**" --agent Alice
echo ""

echo "19. Now Bob can reserve frontend files..."
./am-reserve "src/components/**" --agent Bob --ttl 3600 --reason "bd-104"
echo ""

echo "20. List final reservations..."
./am-reservations
echo ""

echo "21. Carol sends test completion message..."
./am-send "[bd-103] Tests passing" \
  "All tests are green. Good work team!" \
  --from Carol --to Alice,Bob --thread bd-103 --importance high
echo ""

echo "22. Final inbox check for Alice..."
./am-inbox Alice --unread
echo ""

echo "════════════════════════════════════════════════════════════"
echo "✓ Workflow test complete!"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "Summary of tested functionality:"
echo "  ✓ Agent registration (am-register)"
echo "  ✓ Agent listing (am-agents)"
echo "  ✓ File reservations with conflict detection (am-reserve)"
echo "  ✓ Exclusive and shared locks"
echo "  ✓ Message sending with threading (am-send)"
echo "  ✓ Inbox management and filtering (am-inbox)"
echo "  ✓ Message acknowledgment (am-ack)"
echo "  ✓ Message replies (am-reply)"
echo "  ✓ Full-text search (am-search)"
echo "  ✓ Agent identity check (am-whoami)"
echo "  ✓ Reservation release (am-release)"
echo "  ✓ Reservation listing (am-reservations)"
echo ""
echo "Test database: $AGENT_MAIL_DB"
echo "Inspect with: sqlite3 $AGENT_MAIL_DB"
