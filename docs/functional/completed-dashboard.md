# Functional specification: Tasks completed dashboard

## Purpose
Provide analytics on completed tasks, compliance with due dates, and timing metrics.

## URL
- `/completed`

## Filters
- Shared filters: service, role category, region, location, work type, task name.
- Date range filters for completed tasks:
  - Completed from (`completedFrom`)
  - Completed to (`completedTo`)

## Sections and behaviors

### 1) Completed tasks summary
- Two summary panels:
  - "Completed tasks (today)"
  - "Completed tasks within date range"
- Each panel shows totals plus within/beyond due date counts.
- Each panel has a donut chart for within vs beyond due date.

```mermaid
flowchart LR
  Filters["Shared filters + completed range"] --> Summary["Completed summary"]
  Filters --> Timeline["Completion timeline"]
  Filters --> ByName["Completed by name"]
  Filters --> Times["Processing/handling time"]
  Filters --> Audit["Task audit (case ID)"]
  Filters --> RegionLoc["Completed by region/location"]
```

### 2) Tasks completed timeline
- Title: "Tasks completed".
- Chart: stacked bar (within vs beyond due date) plus a 7-day rolling average line.
- Chart axes: x-axis `Completed date`; y-axis `Tasks`.
- Table columns:
  - Completed date
  - Tasks
  - Within due date
  - %
  - Outside due date
  - 7-day rolling average tasks

### 3) Completed by name
- Chart: stacked horizontal bar (within vs beyond due date) by task name.
- Table columns:
  - Task name
  - Tasks
  - Within due date
  - %
  - Beyond due date
- Default table sort is Tasks descending.

### 4) Processing and handling time
- Metric selector (radio buttons):
  - Handling time: days between assignment and completion.
  - Processing time: days between creation and completion.
- Selecting a metric triggers an auto-submit for this section only.
- Displays:
  - Overall average for the selected metric (shown in the Chart tab).
  - Chart: average with upper/lower range (+/- 1 standard deviation) by completed date.
  - Chart axes: x-axis `Completed date`; y-axis `Days`.
  - Table with the same data.

### 5) Task audit
- Purpose: audit tasks by case ID.
- Form: case ID input; uses current filters and date range.
- Table columns:
  - Case ID (link to Manage Case)
  - Task name
  - Agent name
  - Completed date
  - Total assignments
  - Location
  - Status (termination process label)
  - Outcome
- Default table sort is Completed date descending.
- Empty state:
  - If no case ID, prompt user to enter one.
  - If case ID provided but no results, show "No completed tasks match this case ID."

### 6) Completed by region/location
- Tabbed tables:
  - By region and location
  - By region
  - By location
- Columns include total tasks, within due, beyond due, and average handling/processing time where available.

## Notes
- All tables include CSV export.
- Filters apply to all sections; the metric selector only changes the timing chart/table.
- Completed-task determination is based on case-insensitive `termination_reason = completed`; task `state` is not used to classify completion.
- Dates are displayed as `D Mon YYYY` in the UI, while CSV export keeps ISO `YYYY-MM-DD` date values.
