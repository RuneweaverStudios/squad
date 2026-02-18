# Epic: Guided Project Onboarding for New Users

**Type:** Epic
**Priority:** P1
**Status:** Open

## Problem

First-time SQUAD users who install the system but don't have an existing project are stuck. The IDE shows an empty state with no clear path forward. These users need guided onboarding to:
- Create their first project
- Write a Product Requirements Document (PRD)
- Initialize SQUAD task management
- Generate initial tasks
- Start working with their first agent

## Solution

Create a guided onboarding experience where a special "Project Setup Agent" walks new users through the complete project initialization process in a conversational SessionCard interface.

## User Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     ONBOARDING USER FLOW                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. IDE Detects Empty State                              │
│     └─► No projects in ~/.config/squad/projects.json             │
│                                                                 │
│  2. Show Onboarding CTA                                         │
│     ┌──────────────────────────────────────────┐               │
│     │  Welcome to SQUAD!                         │               │
│     │                                          │               │
│     │  You don't have any projects yet.        │               │
│     │                                          │               │
│     │  [🚀 Get Started with Your First Project]│               │
│     │  [📁 Import Existing Project]           │               │
│     └──────────────────────────────────────────┘               │
│                                                                 │
│  3. User Clicks "Get Started"                                   │
│     └─► Spawns onboarding tmux session                         │
│     └─► Opens SessionCard with Project Setup Agent             │
│                                                                 │
│  4. Agent Guides Through Setup                                  │
│     ┌──────────────────────────────────────────┐               │
│     │ 👋 Hi! I'm here to help you set up your │               │
│     │ first project. Let's get started!       │               │
│     │                                          │               │
│     │ What would you like to build?           │               │
│     │ ⎿ _                                      │               │
│     └──────────────────────────────────────────┘               │
│                                                                 │
│  5. Agent Creates Project Structure                             │
│     ├─► Creates ~/code/<project-name>/                         │
│     ├─► Writes CLAUDE.md with PRD                              │
│     ├─► Runs `st init`                                         │
│     └─► Adds project to SQUAD config                             │
│                                                                 │
│  6. Agent Creates Initial Tasks                                 │
│     └─► Breaks down PRD into actionable tasks                  │
│                                                                 │
│  7. Agent Offers to Start Working                               │
│     ┌──────────────────────────────────────────┐               │
│     │ ✅ Your project is ready!                │               │
│     │                                          │               │
│     │ I've created 5 tasks to get started.    │               │
│     │ Would you like me to start working on   │               │
│     │ the first one?                          │               │
│     └──────────────────────────────────────────┘               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Sub-Tasks

### Phase 1: IDE Empty State & UI

- **squad-TBD1**: Detect empty state on IDE load
  - Check if `~/.config/squad/projects.json` has any projects
  - Display onboarding CTA if empty
  - Type: task, Priority: P1

- **squad-TBD2**: Create OnboardingEmptyState component
  - Hero message: "Welcome to SQUAD!"
  - Two buttons: "Get Started" and "Import Existing"
  - Modern, friendly design
  - Type: task, Priority: P1

- **squad-TBD3**: Implement "Get Started" button handler
  - Calls `/api/onboarding/start` endpoint
  - Spawns tmux session with onboarding agent
  - Opens SessionCard in IDE
  - Type: task, Priority: P1

### Phase 2: Onboarding Agent & Session Management

- **squad-TBD4**: Create onboarding agent system prompt
  - Conversational, friendly tone
  - Guides through: idea → PRD → project structure → tasks
  - Includes examples and templates
  - Type: task, Priority: P0

- **squad-TBD5**: Create `/api/onboarding/start` endpoint
  - Spawns tmux session: `tmux-squad-onboarding-{timestamp}`
  - Launches Claude Code with onboarding prompt
  - Returns session ID to IDE
  - Type: task, Priority: P1

- **squad-TBD6**: Create onboarding slash command `/squad:onboard`
  - Can be manually triggered by users
  - Reusable for multiple projects
  - Accepts optional project name parameter
  - Type: task, Priority: P2

### Phase 3: Project Creation Workflow

- **squad-TBD7**: Agent project directory creation helper
  - Creates `~/code/<project-name>/`
  - Validates directory doesn't exist
  - Handles naming conflicts gracefully
  - Type: task, Priority: P1

- **squad-TBD8**: Agent PRD template and guidance
  - Provides structured PRD template
  - Asks clarifying questions about:
    - Project purpose
    - Target users
    - Key features
    - Tech stack preferences
  - Writes to `CLAUDE.md`
  - Type: task, Priority: P1

- **squad-TBD9**: Agent SQUAD Tasks initialization
  - Runs `st init` in project directory
  - Explains what SQUAD Tasks does
  - Shows how to use basic st commands
  - Type: task, Priority: P1

- **squad-TBD10**: Agent SQUAD config integration
  - Adds project to `~/.config/squad/projects.json`
  - Sets up project-specific settings
  - Registers project in IDE
  - Type: task, Priority: P1

### Phase 4: Task Generation & Kickoff

- **squad-TBD11**: Agent task breakdown from PRD
  - Reads PRD from CLAUDE.md
  - Creates logical task breakdown
  - Uses `st create` for each task
  - Sets appropriate priorities and dependencies
  - Type: task, Priority: P1

- **squad-TBD12**: Agent offers to start first task
  - Lists created tasks
  - Asks if user wants to start working
  - If yes, runs `/squad:start` on first ready task
  - Type: task, Priority: P2

- **squad-TBD13**: IDE auto-refreshes after onboarding
  - Polls for project creation completion
  - Automatically shows new project when ready
  - Displays success message
  - Type: task, Priority: P2

### Phase 5: Import Existing Project Flow

- **squad-TBD14**: Create "Import Existing" modal
  - File browser to select project directory
  - Checks if directory has git repo
  - Validates it's a real project
  - Type: task, Priority: P2

- **squad-TBD15**: Import existing project backend
  - Runs `st init` if no .squad exists
  - Creates basic CLAUDE.md if missing
  - Adds to SQUAD config
  - Type: task, Priority: P2

### Phase 6: Polish & Documentation

- **squad-TBD16**: Add onboarding help text and tooltips
  - Explain what each step does
  - Link to documentation
  - FAQ for common questions
  - Type: task, Priority: P3

- **squad-TBD17**: Write onboarding documentation
  - Add section to main docs
  - Record demo video
  - Create troubleshooting guide
  - Type: task, Priority: P3

- **squad-TBD18**: Add analytics/telemetry for onboarding
  - Track completion rate
  - Identify drop-off points
  - Measure time to first task
  - Type: task, Priority: P4

## Success Metrics

- **Time to first task**: < 5 minutes from install to working agent
- **Completion rate**: > 80% of users who click "Get Started" complete onboarding
- **User satisfaction**: Positive feedback on ease of setup

## Technical Notes

**Onboarding Agent Lifecycle:**
1. Spawned via special tmux session: `tmux-squad-onboarding-{timestamp}`
2. Uses dedicated onboarding system prompt (not regular agent prompt)
3. Has access to:
   - File operations (mkdir, write)
   - st commands (init, create)
   - SQUAD config modification
4. Self-terminates after successful project creation

**Session Management:**
- Onboarding sessions are tagged differently from work sessions
- IDE shows them in a special "Setup" section
- Can be reused for creating additional projects

**Error Handling:**
- If user abandons onboarding, session remains accessible
- Can resume from IDE later
- Agent prompts to continue from last step

## Dependencies

- Existing SQUAD config system (`~/.config/squad/projects.json`)
- SQUAD Tasks CLI (`st init`, `st create`)
- IDE SessionCard component
- tmux session management

## Open Questions

1. Should we support multiple onboarding sessions simultaneously?
2. Do we need a "Skip Onboarding" option for power users?
3. Should the agent offer to clone a template project (e.g., "SvelteKit starter")?
4. How do we handle users who close the browser during onboarding?

## Related Epics

- squad-xyz: IDE empty states and error handling
- squad-abc: Improved project configuration management
