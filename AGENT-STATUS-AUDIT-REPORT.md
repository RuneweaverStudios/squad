# Agent Status Calculation Audit Report

**Task ID:** jat-4q8
**Agent:** SoftCliff
**Date:** 2025-11-20
**Purpose:** Audit all agent status calculation locations in the dashboard for inconsistencies

---

## Executive Summary

**Found:** 3 locations with agent status calculation logic
**Inconsistencies:** 2 files have **WRONG** priority order
**Recommendation:** Fix 2 files to match the correct logic

### Status Priority Order

**CORRECT (AgentGrid.svelte):**
1. Check if has task/locks → "working"
2. Check if < 1 minute → "live"
3. Check if < 10 minutes → "active"
4. Check if < 1 hour → "idle"
5. Otherwise → "offline"

**WRONG (AgentCard.svelte + agents.svelte.ts):**
1. Check if < 1 minute → "live" ❌ **TOO EARLY**
2. Check if has task/locks → "working"
3. Check if < 10 minutes → "active"
4. Check if < 1 hour → "idle"
5. Otherwise → "offline"

---

## Findings by File

### ✅ File 1: AgentGrid.svelte (CORRECT)

**Location:** `dashboard/src/lib/components/agents/AgentGrid.svelte:19-55`

**Status Calculation Logic:**
```javascript
function getAgentStatus(agent) {
  const hasActiveLocks = agent.reservation_count > 0;
  const hasInProgressTask = agent.in_progress_tasks > 0;

  let timeSinceActive = Infinity;
  if (agent.last_active_ts) {
    const isoTimestamp = agent.last_active_ts.includes('T')
      ? agent.last_active_ts
      : agent.last_active_ts.replace(' ', 'T') + 'Z';
    const lastActivity = new Date(isoTimestamp);
    timeSinceActive = Date.now() - lastActivity.getTime();
  }

  // Priority 1: WORKING - Has active task or locks (regardless of time)
  if (hasInProgressTask || hasActiveLocks) {
    return 'working';
  }

  // Priority 2: LIVE - Very recent activity (< 1 minute) but no task
  if (timeSinceActive < 60000) {
    return 'live';
  }

  // Priority 3: ACTIVE - Recent activity (< 10 minutes)
  if (timeSinceActive < 600000) {
    return 'active';
  }

  // Priority 4: IDLE - Within 1 hour
  if (timeSinceActive < 3600000) {
    return 'idle';
  }

  // Priority 5: OFFLINE
  return 'offline';
}
```

**Analysis:**
- ✅ **Correct priority order**
- ✅ Checks for work (task/locks) FIRST
- ✅ Then checks recency
- ✅ Comment on line 32 explicitly states: "Priority 1: WORKING - Has active task or locks (regardless of time)"

**Verdict:** **NO CHANGES NEEDED** - This is the reference implementation

---

### ❌ File 2: AgentCard.svelte (WRONG)

**Location:** `dashboard/src/lib/components/agents/AgentCard.svelte:35-77`

**Status Calculation Logic:**
```javascript
const agentStatus = $derived(() => {
  const hasActiveLocks = agent.reservation_count > 0;
  const hasInProgressTask = agent.in_progress_tasks > 0;

  let timeSinceActive = Infinity;
  if (agent.last_active_ts) {
    const isoTimestamp = agent.last_active_ts.includes('T')
      ? agent.last_active_ts
      : agent.last_active_ts.replace(' ', 'T') + 'Z';
    const lastActivity = new Date(isoTimestamp);
    timeSinceActive = Date.now() - lastActivity.getTime();
  }

  // Priority 1: LIVE - Very recent activity (< 1 minute)
  // Agent is truly responsive right now
  if (timeSinceActive < 60000) { // < 1 minute
    return 'live';
  }

  // Priority 2: WORKING - Recently working (1-10 minutes) with active task/locks
  // Agent was working very recently and has work in progress
  if (timeSinceActive < 600000 && (hasInProgressTask || hasActiveLocks)) { // < 10 minutes
    return 'working';
  }

  // Priority 3: ACTIVE - Recent activity (< 10 minutes) but no current work
  // OR has locks but not super recent
  if (timeSinceActive < 600000) { // < 10 minutes
    return 'active';
  }
  if (hasActiveLocks && timeSinceActive < 3600000) { // has locks, within hour
    return 'active';
  }

  // Priority 4: IDLE - Within 1 hour but not active
  if (timeSinceActive < 3600000) { // 1 hour
    return 'idle';
  }

  // Priority 5: OFFLINE - Over 1 hour or never active
  return 'offline';
});
```

**Problems:**
1. ❌ **Line 49-52**: Checks for "live" status (< 1 min) BEFORE checking for work
2. ❌ **Line 55-58**: Only checks for "working" if BOTH conditions met:
   - Time < 10 minutes AND
   - Has task/locks
3. ❌ **Result**: Agent with active task + locks + activity 30s ago → Shows "Live" (WRONG!)

**Impact:**
- Agents actively working on tasks show "Live" (green) instead of "Working" (blue)
- Misleading status indicator in the UI
- User sees wrong agent state

**Fix Required:**
- Swap lines 49-58 order
- Check for work (task/locks) FIRST, then check recency
- Match AgentGrid.svelte logic

---

### ❌ File 3: agents.svelte.ts (WRONG)

**Location:** `dashboard/src/lib/stores/agents.svelte.ts:154-189`

**Status Calculation Logic:**
```javascript
private getAgentStatus(agent: Agent): 'live' | 'working' | 'active' | 'idle' | 'offline' {
  const hasActiveLocks = agent.reservation_count > 0;
  const hasInProgressTask = agent.in_progress_tasks > 0;

  let timeSinceActive = Infinity;
  if (agent.last_active_ts) {
    const isoTimestamp = agent.last_active_ts.includes('T')
      ? agent.last_active_ts
      : agent.last_active_ts.replace(' ', 'T') + 'Z';
    const lastActivity = new Date(isoTimestamp);
    timeSinceActive = Date.now() - lastActivity.getTime();
  }

  // Priority 1: LIVE - Very recent activity (< 1 minute)
  if (timeSinceActive < 60000) {
    return 'live';
  }

  // Priority 2: WORKING - Recently working (1-10 minutes) with active task/locks
  if (timeSinceActive < 600000 && (hasInProgressTask || hasActiveLocks)) {
    return 'working';
  }

  // Priority 3: ACTIVE - Recent activity (< 10 minutes)
  if (timeSinceActive < 600000) {
    return 'active';
  }

  // Priority 4: IDLE - Within 1 hour
  if (timeSinceActive < 3600000) {
    return 'idle';
  }

  // Priority 5: OFFLINE
  return 'offline';
}
```

**Problems:**
1. ❌ **Line 167-170**: Checks for "live" BEFORE checking for work
2. ❌ **Line 173-176**: Only returns "working" if time < 10 min AND has work
3. ❌ **Same issue** as AgentCard.svelte - wrong priority order

**Impact:**
- Store-derived status values are incorrect
- Components using store getter methods (e.g., `agents.workingAgents`) get wrong results
- Filters and computed values based on status are wrong

**Fix Required:**
- Swap lines 167-176 order
- Check for work FIRST, then check recency
- Match AgentGrid.svelte logic

---

### ℹ️ File 4: agents/README.md (Documentation Only)

**Location:** `dashboard/src/routes/agents/README.md`

**Content:** Plain documentation about agent status states

**Analysis:**
- ✅ No code logic, just documentation
- ℹ️  Does not calculate status

**Verdict:** **NO ACTION NEEDED** - Documentation file only

---

### ℹ️ File 5: api/agents/+server.js (Backend API)

**Location:** `dashboard/src/routes/api/agents/+server.js:44-67`

**Status Calculation Logic:**
```javascript
// Determine if agent is active based on reservations or active tasks
const hasActiveReservations = agentReservations.some(r => {
  const expiresAt = new Date(r.expires_ts);
  return expiresAt > new Date() && !r.released_ts;
});

return {
  ...agent,
  reservation_count: agentReservations.length,
  task_count: agentTasks.length,
  open_tasks: openTasks,
  in_progress_tasks: inProgressTasks,
  active: hasActiveReservations || inProgressTasks > 0  // Boolean, not display status
};
```

**Analysis:**
- ℹ️  Only calculates `active` as a boolean flag
- ℹ️  Does NOT calculate display status ("live", "working", etc.)
- ✅ Provides raw data for frontend to compute display status

**Verdict:** **NO ACTION NEEDED** - Correct scope, backend doesn't compute display status

---

### ℹ️ File 6: SystemCapacityBar.svelte (No Status Calculation)

**Location:** `dashboard/src/lib/components/agents/SystemCapacityBar.svelte`

**Analysis:**
- ✅ Uses system capacity calculations from utility
- ✅ No agent status calculation logic
- ℹ️  Only displays aggregate capacity metrics

**Verdict:** **NO ACTION NEEDED** - Does not calculate agent status

---

## Summary of Inconsistencies

| File | Location | Status | Issue |
|------|----------|--------|-------|
| AgentGrid.svelte | Lines 19-55 | ✅ **CORRECT** | Reference implementation |
| AgentCard.svelte | Lines 35-77 | ❌ **WRONG** | Checks "live" before "working" |
| agents.svelte.ts | Lines 154-189 | ❌ **WRONG** | Checks "live" before "working" |
| agents/README.md | N/A | ℹ️  Documentation | No code logic |
| api/agents/+server.js | Lines 44-67 | ✅ Correct scope | Boolean only, not display status |
| SystemCapacityBar.svelte | N/A | ℹ️  No calculation | Uses utility functions |

---

## Root Cause Analysis

### Why the Bug Exists

**Likely Timeline:**
1. AgentGrid.svelte implemented first with correct logic
2. AgentCard.svelte copied similar logic but reordered priorities
3. agents.svelte.ts store copied from AgentCard (wrong version)
4. Code duplication → inconsistency propagated

**Core Problem:**
- Status calculation logic duplicated across 3 files
- No shared utility function
- Easy for copy-paste errors to introduce bugs

**Why It Matters:**
- Agents with active tasks show incorrect status
- "Live" (green, idle) vs "Working" (blue, active) have different meanings
- User sees wrong information about agent state

---

## Recommendations

### Immediate Fixes (P1 Tasks)

1. **Fix AgentCard.svelte** (Task: jat-net)
   - Move "has task/locks" check BEFORE "< 1 min" check (lines 49-58)
   - Match AgentGrid.svelte logic exactly

2. **Fix agents.svelte.ts** (Task: jat-iiy)
   - Move "has task/locks" check BEFORE "< 1 min" check (lines 167-176)
   - Match AgentGrid.svelte logic exactly

### Verification (P1 Task)

3. **Manual Testing** (Task: jat-tao)
   - Test all 5 status scenarios in live dashboard
   - Verify AgentCard and AgentGrid show consistent status
   - Screenshot evidence of correct behavior

### Future Improvements (P2+)

4. **Refactor to Shared Utility** (Future)
   - Create `src/lib/utils/agentStatus.ts` with single `getAgentStatus()` function
   - All components import from shared utility
   - Single source of truth → no duplication

5. **Add Unit Tests** (Future)
   - Test status calculation logic with various scenarios
   - Prevent regression

---

## Test Scenarios

After fixes are applied, verify these scenarios:

| Scenario | Expected Status | Current (Broken) | After Fix |
|----------|----------------|------------------|-----------|
| Agent with task + locks + active < 1min | **Working** | Live ❌ | Working ✅ |
| Agent with task + no locks + active < 1min | **Working** | Live ❌ | Working ✅ |
| Agent with no task + no locks + active < 1min | **Live** | Live ✅ | Live ✅ |
| Agent with no task + active 5min ago | **Active** | Active ✅ | Active ✅ |
| Agent with no task + active 2h ago | **Offline** | Offline ✅ | Offline ✅ |

---

## Dependencies

**This audit (jat-4q8) blocks:**
- jat-net - Fix AgentCard.svelte
- jat-iiy - Fix agents.svelte.ts store
- jat-0d5 - Apply any additional fixes (if found)

**Next Steps:**
1. Review this audit report
2. Start jat-net and jat-iiy fixes (can be done in parallel)
3. After both fixes: Run jat-tao verification
4. If no other issues found: Close jat-0d5 as not needed

---

## Acceptance Criteria ✅

- [x] Find all files that calculate agent status
- [x] Document the logic used in each location
- [x] Identify any other inconsistencies beyond AgentCard and agents.svelte.ts
- [x] Create a summary report of findings

**Files Audited:** 6 files
**Status Calculation Locations:** 3 locations
**Inconsistencies Found:** 2 files (AgentCard + store)
**Recommendation:** Fix 2 files to match AgentGrid logic

---

**Audit Complete** ✅
**Agent:** SoftCliff
**Date:** 2025-11-20
**Task:** jat-4q8
