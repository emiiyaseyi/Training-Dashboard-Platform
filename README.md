# Learning Intelligence Dashboard Platform

A Next.js + Postgres platform for Meristem's L&D and HR teams: training analytics, talent
programmes, survey automation, and reporting, with a growing set of HR units (Talent Acquisition,
Talent Management, Performance, Compensation & Benefits, Employee Services) alongside the original
Learning & Development core.

Live: https://meristemhr.vercel.app

## Tech stack

- **Next.js 15** (App Router) + **React 19**, TypeScript throughout
- **Prisma 5** — **Postgres** (Supabase) in production, **SQLite** for local dev
- **NextAuth (Auth.js) v5** — credential-based session auth, no external IdP
- **Tailwind CSS**, **lucide-react** icons, **Plotly.js** for charts
- **xlsx**, **pptxgenjs**, **jspdf** for Excel/PowerPoint/PDF export
- **nodemailer** for all outbound survey/report email
- Google Sheets API (service account) as an optional live data source for several modules
- Deployed on **Vercel**, with Vercel Cron driving the daily automation sweeps

## Core concepts

- **Permission system** (`src/lib/permissions.ts`): every page has a `PageKey`; each user has a
  per-page `PermissionLevel` (`none` / `view` / `export` / `admin`). Super admins bypass all
  checks. `admin`-level actions are written to the audit log. Permissions can be granted per user
  from Admin → Users, down to individual HR units.
- **Upload vs. Google Sheets sync**: most modules can be fed either by manually uploading an Excel
  file (Upload & Data) or by configuring a live Google Sheet under Admin → Live Data Source, which
  a daily cron (`/api/cron/sync-sheets`) and in-admin "Import from Sheets" actions keep in sync
  with the database. The database is always the source of truth for every report — sheets are
  either an import source or a one-way mirror, never read live by the dashboards themselves.
- **Staff Roster** (`StaffRosterRecord`) is the single directory nearly every other module resolves
  names, business units, line managers, and employment status against (`src/lib/staff-directory.ts`).
- **Audit logging**: every admin-level mutation across the platform is recorded in `AuditLogEntry`,
  viewable at Admin → Audit Log.

## What's in the platform

### Learning & Development (original core)

- **Executive Overview** — group-wide training KPIs, investment, coverage, and impact for the
  period in view.
- **Training Analytics** — training records browser with filters, cost, vendor, and attendance
  breakdowns.
- **Subscriptions** — subscription/licence spend tracking.
- **Business Units** — per-BU training investment, coverage, and headcount.
- **Capability Coverage** — training coverage against the Differentiating Capabilities taxonomy.
- **Skills & Competency Gaps** — per-role/BU gap analysis against the same capability taxonomy.
- **Yet to Attend Training** — everyone employed during the selected period (minus Meri Movers)
  with no training record yet; includes a by-Business-Unit breakdown and, for the current year, by
  join-month and by join-quarter breakdowns of who's still outstanding, plus a sortable/filterable
  staff list with Join Date/Join Month columns.
- **Talent Members** — training completion and spend for the named Talent Member roster, with
  attended/upcoming/exempted/yet-to-attend breakdowns, unioning scheduled-training and bulk-record
  attendance sources.
- **Insights** — Diagnostic / Predictive / Prescriptive narrative views over the same analytics.
- **Personal Development Plan (PDP)** — a capability-gap-driven PDP survey system with two
  independent tracks: staff self-fill (own link, prefilled from training history) and manager
  team-fill (one link per manager covering their whole team — accept/decline/add roster, then one
  page per accepted report). Admin panel to launch/track both tracks and export results.
- **Report Generation** — PDF/PowerPoint investment report generation, plus per-BU automated
  monthly report email delivery (`/api/cron/send-bu-reports`).
- **Upload & Data** — Excel upload entry point for Staff Roster, Training Data, and the other
  source files each module depends on.
- **Survey Automation** (Admin → Survey Automation) — Pre/Post-1/Post-2 training survey sends,
  reminders, and response insights, fully automated by the daily `/api/cron/send-surveys` sweep.

### HR Dashboard (`/hr`)

A separate HR-wide summary (three interchangeable layouts: Signal Board, Ledger Grid, Executive
Blocks) linking out to each unit's own section:

- **Employee Services** — headcount and workforce composition.
- **Talent Acquisition** — hiring pipeline synced from a Google Sheet ("Hires" tab): BU/role
  demographics, conversions, efficiency & velocity, financial insights, internal mobility, plus a
  **New Hire Experience Survey**: auto-matched from the Hires sheet, sent 7 days after each new
  hire's join date, daily-reminded until filled, automatically CC'ing the hire's line manager plus
  a TA-admin-configured Cc list (never the platform default Cc), with a response-insights panel.
- **Learning & Development** — mirrors the main L&D dashboard's live investment/coverage/impact
  figures.
- **Performance Management** — review/contract completion tracking.
- **Talent Management** — the TM programme: roster (`TalentMemberInfo`), promotions, internal
  mobility, strategic committee membership, and performance appraisal history, importable from a
  dedicated Google Sheet (5 tabs: Talent Members Info, TM Internal Mobility, TM Promotion, TM
  Strategic Teams, TM Performance Appraisal) via Admin → Talent Management, with a
  "Refresh from Directory" action to re-resolve the whole roster against the current Staff Roster
  after an employee-record update.
- **Compensation & Benefits** — staff loan portfolio by entity.

### Admin

- **Employees** / **Manage Records** — direct CRUD over the staff roster and training records.
- **Survey Automation** — configure and monitor Pre/Post training surveys, Custom Surveys, PDP, and
  the New Hire Experience Survey in one place.
- **Users** — user accounts and per-page/per-HR-unit permission grants.
- **Audit Log** — every admin-level action across the platform, who did it, and when.
- **Live Data Source** (Google Sheets) — spreadsheet URL and per-module tab-name configuration, plus
  manual "Import from Sheets" triggers for TA and TM data.
- **Taxonomies** — Differentiating Capabilities and Training Types (including which Training Types
  count as "Talent Member" trainings).
- **SeamlessHR sandbox** — exploratory integration against the SeamlessHR HRMS API (not wired into
  any live module yet).

## Automation (Vercel Cron)

| Schedule | Route | Does |
|---|---|---|
| Daily 07:00 | `/api/cron/send-surveys` | Sends/reminds: Pre/Post training surveys, Custom Surveys, PDP (staff + manager tracks), New Hire Experience Survey |
| Daily 08:00 | `/api/cron/send-bu-reports` | Sends each Business Unit's automated monthly report email |
| — | `/api/cron/sync-sheets` | Syncs configured Google Sheets into the database |

All cron routes are gated by a `CRON_SECRET` bearer token (Vercel sends this automatically to
scheduled invocations) and fail closed if it's unset.

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in at least AUTH_SECRET; local dev defaults to SQLite
npx prisma generate
npx prisma db push
npm run dev
```

See `.env.example` for every environment variable this app uses (database, auth, Google Sheets,
SMTP, cron secret, SeamlessHR sandbox).

### Database

- **Local dev**: SQLite (see `prisma/schema.prisma`) — no setup beyond `prisma db push`.
- **Production**: Postgres via Supabase (or any Postgres host). `DATABASE_URL` is the pooled
  connection string used at runtime; `DIRECT_URL` is the direct connection used only during
  `prisma db push` at build time (`npm run build:vercel`). There is no migrations folder — schema
  changes ship by pushing the updated `schema.prisma` and letting the next deploy's build step run
  `prisma db push --accept-data-loss`.

### Scripts

```bash
npm run dev          # local dev server
npm run build         # production build
npm run build:vercel  # production build + prisma db push (what Vercel actually runs)
npm run lint           # ESLint
npm test                # Vitest
npm run db:studio       # Prisma Studio (inspect the database)
```

## Project structure

```
src/app/              Next.js App Router pages + API routes (src/app/api/**)
src/components/        UI components, grouped by feature (admin/, hr/, charts/, slides/, ui/)
src/lib/                Business logic: analytics, permissions, survey sending, Sheets sync, exports
prisma/schema.prisma    Data model (Postgres in prod, SQLite locally)
```
