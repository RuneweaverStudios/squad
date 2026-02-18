# Arkagent.io Implementation Plan

## Overview

Fork SQUAD into a cloud-native SaaS product using CMSaasStarter as the foundation, then transplant components from SQUAD (task management) and Flush (messaging).

**Domain:** arkagent.io
**Tech Stack:** SvelteKit + Supabase + Stripe + Cloudflare Pages
**Template:** [CMSaasStarter](https://github.com/scosman/CMSaasStarter)

---

## Phase 1: Foundation (Clone + Configure)

### 1.1 Clone and Rename
- [ ] Clone CMSaasStarter to `~/code/arkagent`
- [ ] Update `package.json` name to `arkagent`
- [ ] Update all branding references (site name, meta tags)
- [ ] Update `src/config.ts` with arkagent.io details

### 1.2 Supabase Setup
- [ ] Create new Supabase project "arkagent-prod"
- [ ] Create "arkagent-dev" project for development
- [ ] Run initial migration from CMSaasStarter
- [ ] Configure auth providers (Google, GitHub OAuth)
- [ ] Set up custom SMTP for transactional emails

### 1.3 Stripe Setup
- [ ] Create Stripe account for arkagent
- [ ] Define pricing tiers (Free, Pro, Team)
- [ ] Configure products and prices in Stripe
- [ ] Set up webhook endpoints
- [ ] Configure billing portal

### 1.4 Cloudflare Setup
- [ ] Add arkagent.io to Cloudflare
- [ ] Create Pages project linked to repo
- [ ] Configure environment variables
- [ ] Deploy and verify base template works

### 1.5 Branding
- [ ] Design logo (ark + agent concept)
- [ ] Choose color scheme (DaisyUI theme)
- [ ] Update favicon and OG images
- [ ] Customize marketing copy

**Milestone:** Base SaaS running at arkagent.io with auth + payments working

---

## Phase 2: Multi-Tenancy (Organizations)

### 2.1 Database Schema
```sql
-- Organizations table
CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  owner_id uuid REFERENCES auth.users NOT NULL,
  created_at timestamptz DEFAULT now(),
  settings jsonb DEFAULT '{}'::jsonb
);

-- Organization members
CREATE TABLE organization_members (
  organization_id uuid REFERENCES organizations ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  invited_at timestamptz DEFAULT now(),
  accepted_at timestamptz,
  PRIMARY KEY (organization_id, user_id)
);

-- Link profiles to current org
ALTER TABLE profiles ADD COLUMN current_organization_id uuid REFERENCES organizations;
```

### 2.2 RLS Policies
- [ ] Organizations: members can read, owners can update
- [ ] Organization members: admins can manage
- [ ] All future tables scoped by organization_id

### 2.3 UI Updates
- [ ] Org switcher in sidebar/header
- [ ] Org settings page
- [ ] Invite members flow
- [ ] Onboarding: create first org after signup

**Milestone:** Users can create orgs, invite members, switch between orgs

---

## Phase 3: Task System (Port from SQUAD)

### 3.1 Database Schema
```sql
-- Tasks table (from SQUAD schema)
CREATE TABLE tasks (
  id text PRIMARY KEY,  -- e.g., "ark-abc123"
  organization_id uuid REFERENCES organizations NOT NULL,
  title text NOT NULL,
  description text,
  type text CHECK (type IN ('bug', 'feature', 'task', 'chore', 'epic')),
  status text CHECK (status IN ('triage', 'open', 'in_progress', 'blocked', 'closed')),
  priority integer DEFAULT 2,
  labels text[] DEFAULT '{}',
  assignee_id uuid REFERENCES auth.users,
  parent_id text REFERENCES tasks(id),  -- For epics
  created_by uuid REFERENCES auth.users NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  closed_at timestamptz,
  closed_reason text,
  feedback_meta jsonb  -- For client submissions: {submitter_email, element_selector, screenshot_url, user_agent, url}
);

-- Task dependencies
CREATE TABLE task_dependencies (
  task_id text REFERENCES tasks(id) ON DELETE CASCADE,
  depends_on text REFERENCES tasks(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, depends_on)
);

-- Task ID sequence per org
CREATE TABLE task_sequences (
  organization_id uuid PRIMARY KEY REFERENCES organizations,
  last_number integer DEFAULT 0
);
```

### 3.2 API Endpoints
- [ ] `GET /api/tasks` - List tasks (with filters)
- [ ] `POST /api/tasks` - Create task
- [ ] `GET /api/tasks/[id]` - Get task details
- [ ] `PATCH /api/tasks/[id]` - Update task
- [ ] `DELETE /api/tasks/[id]` - Delete task
- [ ] `GET /api/tasks/ready` - Get ready tasks (no blockers)
- [ ] `POST /api/tasks/[id]/dependencies` - Manage deps

### 3.3 UI Components (Port from SQUAD)
- [ ] Task list view with filters
- [ ] Task detail drawer/page
- [ ] Task creation form
- [ ] Kanban board view (optional)
- [ ] Epic tree view

**Milestone:** Full task management working, parity with SQUAD Tasks

---

## Phase 4: Messaging System (Port from Flush)

### 4.1 Database Schema
Copy from Flush migrations:
- [ ] `messages` table (adapt for task comments)
- [ ] `message_attachments` table
- [ ] `message_reactions` table
- [ ] Add `task_id` FK to messages for task-scoped threads

### 4.2 Real-time Subscriptions
- [ ] Supabase Realtime for new messages
- [ ] Typing indicators (optional)
- [ ] Read receipts

### 4.3 UI Components (Port from Flush)
- [ ] Message thread component
- [ ] Message composer with attachments
- [ ] Emoji reactions
- [ ] Integrate into task detail view

**Milestone:** Task comments with real-time updates, file attachments, reactions

---

## Phase 5: Client Portal

### 5.1 Client Access Model
```sql
-- Client tokens for portal access
CREATE TABLE client_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations NOT NULL,
  token text UNIQUE NOT NULL,  -- Public token for widget
  name text NOT NULL,  -- e.g., "Production Widget"
  allowed_origins text[],  -- CORS origins
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz,
  settings jsonb DEFAULT '{}'::jsonb  -- Custom fields, labels, etc.
);

-- Client submissions (before becoming tasks)
-- OR just use tasks with status='triage' and feedback_meta populated
```

### 5.2 Embeddable Widget
- [ ] Build widget as standalone JS bundle
- [ ] Element picker (DOM selector tool)
- [ ] Screenshot capture (html2canvas or similar)
- [ ] Form: title, description, type, email
- [ ] Submit to `/api/widget/submit`

### 5.3 Widget API
- [ ] `POST /api/widget/submit` - Create triage task
- [ ] `GET /api/widget/config/[token]` - Widget config
- [ ] CORS handling for allowed origins

### 5.4 Client Dashboard (Optional)
- [ ] Public page: `/portal/[org-slug]`
- [ ] Client can view their submissions
- [ ] Client can add comments
- [ ] No login required (email-based lookup)

**Milestone:** Clients can submit feedback via widget, view status

---

## Phase 6: Agent Integration (Optional/Future)

### 6.1 Agent Registration
- [ ] API keys for programmatic access
- [ ] Agent status tracking
- [ ] Task assignment via API

### 6.2 Signals/Webhooks
- [ ] Webhook on task status change
- [ ] Webhook on new comment
- [ ] Integration with SQUAD local (sync tasks)

---

## File Structure

```
arkagent/
├── src/
│   ├── routes/
│   │   ├── (marketing)/         # From CMSaasStarter
│   │   ├── (admin)/             # Dashboard
│   │   │   ├── account/         # Profile, settings
│   │   │   ├── billing/         # Stripe portal
│   │   │   ├── org/             # Org settings, members
│   │   │   ├── tasks/           # Task management
│   │   │   │   ├── +page.svelte       # List view
│   │   │   │   ├── [id]/+page.svelte  # Detail view
│   │   │   │   └── new/+page.svelte   # Create task
│   │   │   └── settings/        # User settings
│   │   ├── (client)/            # Client portal
│   │   │   └── portal/[slug]/   # Public submission view
│   │   ├── api/
│   │   │   ├── tasks/           # Task CRUD
│   │   │   ├── messages/        # Comments
│   │   │   ├── widget/          # Widget endpoints
│   │   │   └── stripe/          # Webhooks
│   │   └── auth/
│   ├── lib/
│   │   ├── components/
│   │   │   ├── tasks/           # Task UI components
│   │   │   ├── messages/        # Messaging components
│   │   │   └── common/          # Shared components
│   │   ├── stores/
│   │   └── supabase.ts
├── supabase/
│   └── migrations/
├── widget/                      # Embeddable widget
│   ├── src/
│   │   ├── widget.ts
│   │   ├── element-picker.ts
│   │   └── screenshot.ts
│   ├── vite.config.ts
│   └── dist/
│       └── arkagent-widget.js
└── static/
```

---

## Pricing Tiers (Draft)

| Tier | Price | Limits |
|------|-------|--------|
| **Free** | $0/mo | 1 project, 100 tasks, 2 team members |
| **Pro** | $19/mo | 5 projects, unlimited tasks, 10 members |
| **Team** | $49/mo | Unlimited projects, unlimited tasks, unlimited members, priority support |

---

## Timeline Estimate

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| Phase 1: Foundation | 1 week | None |
| Phase 2: Multi-Tenancy | 1 week | Phase 1 |
| Phase 3: Task System | 1-2 weeks | Phase 2 |
| Phase 4: Messaging | 1 week | Phase 3 |
| Phase 5: Client Portal | 1-2 weeks | Phase 3 |
| Phase 6: Agent Integration | TBD | Phase 3 |

**MVP (Phases 1-3):** ~3-4 weeks
**Full Product (Phases 1-5):** ~6-8 weeks

---

## Immediate Next Steps

1. Clone CMSaasStarter → `~/code/arkagent`
2. Create Supabase project
3. Configure and deploy base template
4. Create epic in SQUAD for tracking
