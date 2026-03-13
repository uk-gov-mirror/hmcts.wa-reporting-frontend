# Data sources and data model

## Databases
The application connects to three PostgreSQL databases using Prisma clients and raw SQL:

1. Task Management analytics database (`tm`)
- Purpose: snapshot-backed analytics for work allocation tasks.
- Prisma client: `tmPrisma`.
- Config prefix: `database.tm`.

2. Caseworker reference database (`crd`)
- Purpose: caseworker profiles for user display names.
- Prisma client: `crdPrisma`.
- Config prefix: `database.crd`.

3. Location reference database (`lrd`)
- Purpose: region and court venue descriptions.
- Prisma client: `lrdPrisma`.
- Config prefix: `database.lrd`.

Connection building:
- Uses `database.<prefix>.url` when provided; otherwise builds from host/port/user/password/db_name/schema.
- Optional `schema` is passed via PostgreSQL `search_path` in the connection string.
- Prisma clients are created with `PrismaPg({ connectionString })`.

Performance review:
- The post-redesign benchmark pass and current remaining opportunities live in [docs/technical/analytics-benchmark-report.md](/Users/danlysiak/development/hmcts/expressjs-speckit-powerbi/docs/technical/analytics-benchmark-report.md).
- The redesign rationale and original review notes live in [docs/technical/analytics-query-performance-review.md](/Users/danlysiak/development/hmcts/expressjs-speckit-powerbi/docs/technical/analytics-query-performance-review.md).
- The current schema described below is the implemented post-redesign state.
- The `analytics` schema is owned in this repository through Flyway migrations under `db/migrations/tm/`.

```mermaid
flowchart TB
  App["Analytics module"] --> TMRepo["Task facts + thin repositories"]
  App --> RefSvc["Reference data services"]
  TMRepo --> TM["TM analytics DB"]
  RefSvc --> CRD["CRD DB (caseworkers)"]
  RefSvc --> LRD["LRD DB (regions/locations)"]
  TM --> Snapshots["Analytics snapshot tables (analytics.snapshot_*)"]
  Snapshots --> Dashboards["Dashboards"]
```

## Snapshot model
All analytics reads are snapshot-scoped:

- `snapshot_id = :snapshotId`

Published snapshots are immutable. The app reads one selected snapshot at a time.
The application reads these tables only; it does not apply Flyway migrations at startup.

### Snapshot metadata

#### analytics.snapshot_batches
Snapshot lifecycle metadata.

Required columns:
- `snapshot_id`
- `status`
- `started_at`
- `completed_at`
- `error_message`

#### analytics.snapshot_state
Single-row publish pointer.

Required columns:
- `published_snapshot_id`
- `published_at`
- `in_progress_snapshot_id`

## Snapshot refresh procedure
Snapshots are built and published by `analytics.run_snapshot_refresh_batch()`.

Current refresh shape:
- Full rebuild from `cft_task_db.reportable_task`.
- Creates a narrow temp staging table with only the columns and derived values needed by the app.
- Builds detached per-snapshot tables for every snapshot parent before publish.
- Loads thin row tables first, then facts, then page-scoped facet tables.
- Runs `ANALYZE` on every detached snapshot table before publish.
- Commits the detached build tables before publish, then opens a short publish transaction that only attaches those tables as partitions and updates `analytics.snapshot_state`.
- Keeps the previous published snapshot readable during the detached build phase because the live parent tables are not modified until the final attach step.

Refresh-time derived values materialised in staging:
- `wait_time_days`
- `handling_time_days`
- `processing_time_days`
- `days_beyond_due`
- `within_due_sort_value`
- `termination_reason_lower`

Refresh-time session settings:
- Baseline refresh work: `work_mem = 256MB`, `maintenance_work_mem = 1GB`
- Daily-facts aggregation temporarily uses `work_mem = 1GB`, `hash_mem_multiplier = 4`, `enable_sort = off`
- Facet aggregation temporarily uses `work_mem = 1GB`, `hash_mem_multiplier = 4`, `enable_sort = off`

Retention:
- Keeps the published snapshot, any in-progress snapshot, and the latest 3 succeeded snapshots.
- Cleans up obsolete snapshots after publish by first detaching their child tables from the live parents in a short lock-bounded step, then dropping the detached tables.
- If retention cleanup cannot get the required parent lock quickly, it logs a warning and leaves that obsolete snapshot for a later run.
- Keeps up to 100 failed batch records.

## Core analytics snapshot tables

### analytics.snapshot_open_task_rows
Thin row store for row-backed open or otherwise not-completed task views.

Used by:
- `/users` assigned table and assigned count
- `/users` assigned total and priority summary when a `User` filter is active
- `/outstanding` critical tasks table

Row population rule:
- Includes source rows where `state NOT IN ('COMPLETED', 'TERMINATED')`

Required columns:
- `snapshot_id`
- `task_id`
- `case_id`
- `task_name`
- `case_type_label`
- `jurisdiction_label`
- `role_category_label`
- `region`
- `location`
- `work_type`
- `state`
- `created_date`
- `first_assigned_date`
- `due_date`
- `major_priority`
- `assignee`
- `number_of_reassignments`

Notes:
- The `/users` assigned table adds `state = 'ASSIGNED'` on top of this table.
- Priority rank is still calculated at query-time from `major_priority`, `due_date`, and `CURRENT_DATE`.
- Child partitions also create a User Overview-specific partial index for the default assigned-table query: non-Judicial `state = 'ASSIGNED'` rows ordered by `created_date DESC NULLS LAST`.

### analytics.snapshot_completed_task_rows
Thin row store for completed-task row views.

Used by:
- `/users` completed table and completed row count
- `/completed` task audit

Row population rule:
- Includes source rows where `LOWER(termination_reason) = 'completed'`

Required columns:
- `snapshot_id`
- `task_id`
- `case_id`
- `task_name`
- `jurisdiction_label`
- `role_category_label`
- `region`
- `location`
- `work_type`
- `created_date`
- `first_assigned_date`
- `due_date`
- `completed_date`
- `handling_time_days`
- `is_within_sla`
- `termination_process_label`
- `outcome`
- `major_priority`
- `assignee`
- `number_of_reassignments`
- `within_due_sort_value`

Notes:
- Child partitions also create a User Overview-specific partial index for the default completed-table query: non-Judicial rows ordered by `completed_date DESC NULLS LAST`.

### analytics.snapshot_user_completed_facts
Assignee-aware completed-task facts for the User Overview page.

Used by:
- `/users` completed total
- `/users` completed summary
- `/users` completed by date
- `/users` completed by task name

Population rule:
- Source rows where `LOWER(termination_reason) = 'completed'` and `completed_date IS NOT NULL`
- Grouped by assignee, shared slicers, and `completed_date`

Required columns:
- `snapshot_id`
- `assignee`
- `jurisdiction_label`
- `role_category_label`
- `region`
- `location`
- `task_name`
- `work_type`
- `completed_date`
- `tasks`
- `within_due`
- `beyond_due`
- `handling_time_sum`
- `handling_time_count`
- `days_beyond_sum`
- `days_beyond_count`

Notes:
- `handling_time_sum` uses `COALESCE(handling_time_days, 0)` so null handling times remain in the task denominator for the `/users` completed-by-task-name table.
- `days_beyond_sum` uses the refresh-time `days_beyond_due` value derived from `due_date_to_completed_diff_time`, also with nulls treated as zero.
- `days_beyond_count` preserves `COUNT(*)` semantics for the `/users` completed-by-task-name average.

### analytics.snapshot_task_daily_facts
Shared daily fact table for overview, outstanding, and completed dashboards.

Used by:
- `/` service overview
- `/` task events by service
- `/outstanding` open-task charts/tables backed by daily facts
- `/users` assigned total and priority summary when no `User` filter is active
- `/completed` completed summary
- `/completed` completed timeline
- `/completed` completed by name / region / location
- `/completed` processing and handling time

Required columns:
- `snapshot_id`
- `date_role`
- `reference_date`
- `jurisdiction_label`
- `role_category_label`
- `region`
- `location`
- `task_name`
- `work_type`
- `priority`
- `task_status`
- `assignment_state`
- `sla_flag`
- `handling_time_days_sum`
- `handling_time_days_sum_squares`
- `handling_time_days_count`
- `processing_time_days_sum`
- `processing_time_days_sum_squares`
- `processing_time_days_count`
- `task_count`

Date-role semantics:
- `due`: rows with `due_date IS NOT NULL` and either open-state tasks or completed tasks
- `created`: rows with `created_date IS NOT NULL`
- `completed`: completed tasks with `completed_date IS NOT NULL`
- `cancelled`: deleted tasks with `completed_date IS NOT NULL`

Open-task classification inside daily facts:
- `open` when `state IN ('ASSIGNED', 'UNASSIGNED', 'PENDING AUTO ASSIGN', 'UNCONFIGURED')`
- `completed` when `LOWER(termination_reason) = 'completed'`
- `other` otherwise

Notes:
- `/completed` processing and handling time no longer scans row data; it reconstructs averages and population standard deviations from `sum`, `sum_squares`, and `count`.
- `/users` assigned total and priority summary read this table only when no assignee filter is active, because `snapshot_task_daily_facts` is not assignee-aware.

### analytics.snapshot_wait_time_by_assigned_date
Assigned-task wait-time facts.

Used by:
- `/outstanding` wait time by assigned date

Population rule:
- Source rows where `state = 'ASSIGNED'` and `wait_time_days IS NOT NULL`
- Grouped by shared slicers plus `first_assigned_date`

Required columns:
- `snapshot_id`
- `reference_date`
- `jurisdiction_label`
- `role_category_label`
- `region`
- `location`
- `task_name`
- `work_type`
- `total_wait_time_days_sum`
- `assigned_task_count`

### Page-scoped filter facet tables
The generic `snapshot_filter_facet_facts` table has been replaced with page-scoped facet tables so dropdowns reflect the workload each page actually uses.

Common columns:
- `snapshot_id`
- `jurisdiction_label`
- `role_category_label`
- `region`
- `location`
- `task_name`
- `work_type`
- `row_count`

User-only extra column:
- `assignee` on `analytics.snapshot_user_filter_facts` only

#### analytics.snapshot_overview_filter_facts
Facet source for `/`.

Population rule:
- Aggregated from `snapshot_task_daily_facts`
- Includes overview page workloads:
  - `date_role = 'due' AND task_status = 'open'`
  - `date_role IN ('created', 'completed', 'cancelled')`

#### analytics.snapshot_outstanding_filter_facts
Facet source for `/outstanding`.

Population rule:
- Aggregated from `snapshot_open_task_rows`

Used by:
- `/outstanding` shared filter options
- `/outstanding` critical tasks total count

#### analytics.snapshot_completed_filter_facts
Facet source for `/completed`.

Population rule:
- Aggregated from `snapshot_completed_task_rows`

#### analytics.snapshot_user_filter_facts
Facet source for `/users`.

Population rule:
- Aggregated from:
  - `snapshot_open_task_rows` where `state = 'ASSIGNED'`
  - all `snapshot_completed_task_rows`
- User Overview's Judicial exclusion is applied during this materialisation step as well as at query time.

Notes for all facet tables:
- Blank strings are normalised to `NULL` at materialisation time.
- Work type display labels are still resolved at read-time by joining `cft_task_db.work_types`.
- User Overview still applies its query-time Judicial exclusion when reading row and fact queries.

Flyway ownership note:
- The current schema shape documented in this file is the target state produced by the repository-owned Flyway migrations under `db/migrations/tm/`.
- Upstream dependencies remain external: Flyway does not create `cft_task_db.reportable_task` or `cft_task_db.work_types`.

## Reference data

### CRD: vw_case_worker_profile
Used to map assignee IDs to names.

Required columns:
- `case_worker_id`
- `first_name`
- `last_name`
- `email_id`
- `region_id`

Outstanding-specific rule:
- On `/outstanding` critical tasks, if an assignee ID exists with no CRD match, the UI shows `Judge`.

### LRD: region
Used for region descriptions.

Required columns:
- `region_id`
- `description`

### LRD: court_venue
Used for location descriptions.

Required columns:
- `epimms_id`
- `site_name`
- `region_id`

## Filter mapping
Shared filter mappings:
- Service -> `jurisdiction_label`
- Role category -> `role_category_label`
- Region -> `region`
- Location -> `location`
- Task name -> `task_name`
- Work type -> `work_type`
- User -> `assignee` (User Overview only)

Date filter mappings:
- `completedFrom` / `completedTo` -> `completed_date` in completed row / user-completed facts, or `reference_date` in completed daily facts
- `eventsFrom` / `eventsTo` -> `reference_date` in task-daily facts for created / completed / cancelled events

Scoped exclusions:
- User Overview applies `UPPER(role_category_label) <> 'JUDICIAL'` (null-safe).
- The Judicial exclusion does not apply on `/`, `/outstanding`, or `/completed`.

## Derived concepts

### Priority rank
Priority rank is calculated in SQL at read time from `major_priority` or `priority` plus `CURRENT_DATE`:

- `<= 2000 => 4`
- `< 5000 => 3`
- `= 5000` and `due_date < CURRENT_DATE => 3`
- `= 5000` and `due_date = CURRENT_DATE => 2`
- else `1`

UI label mapping:
- `4 => Urgent`
- `3 => High`
- `2 => Medium`
- `1 => Low`

### Within due date
Within due date is computed as:
- `is_within_sla = 'Yes'` when present
- otherwise `completed_date <= due_date`

### Completed-task determination
Completed-task paths use case-insensitive `termination_reason = 'completed'`.
Task `state` is not used to classify completion.

### Cancelled-event determination
Overview cancelled task events use case-insensitive `termination_reason = 'deleted'`.
The facts-backed metric stores those rows as `date_role = 'cancelled'` and `task_status = 'cancelled'`, and it does not apply an additional `state` predicate.

### User Overview task-name averages
`/users` "Completed tasks by task name" preserves the previous averages while reading facts instead of rows:

- Average handling time (days):
  - `SUM(handling_time_sum) / SUM(tasks)`
- Average days beyond due date:
  - `SUM(days_beyond_sum) / SUM(days_beyond_count)`

Those fact columns are populated so null intervals still contribute zero to the numerator while remaining in the denominator.

### Completed processing and handling time
`/completed` processing/handling time is derived from daily facts:

- Average = `sum / count`
- Population standard deviation = `sqrt((sum_squares / count) - power(sum / count, 2))`

This keeps the page facts-backed while preserving the same aggregates as the source row query.

## Caching
NodeCache caches:
- Filter options
- Caseworker profiles and names
- Regions and region descriptions
- Court venues and location descriptions

Cache TTL is configurable via `analytics.cacheTtlSeconds`.
