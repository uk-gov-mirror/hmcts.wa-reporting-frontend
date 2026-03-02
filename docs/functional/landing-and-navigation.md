# Functional specification: Landing and navigation

## Analytics default page
URL: `/`

Purpose:
- Provide the default Overview dashboard as the analytics entry point.

Content:
- Page title: "Service performance overview".
- Shows the Overview dashboard sections directly.

## Global navigation
All analytics pages share a common header and service navigation (GOV.UK header + service nav).

Navigation items:
- Overview
- Tasks outstanding
- Tasks completed
- User overview
- Sign out

The navigation highlights the current page by comparing the request path to the navigation URL.

## Shared filters (applies to most dashboards)
The shared filter block appears on all dashboard pages. It provides multi-select filters for:
- Service
- Role category
- Region
- Location
- Work type
- Task name
- User (only on User overview)

Behavior:
- Filters are multi-select dropdowns with search and "select all".
- Shared filters are faceted: each filter's available options are constrained by the current selections in the other shared filters.
- When selections change inside a shared-filter multi-select, closing that dropdown triggers an AJAX refresh of the shared-filter section only (no full-page navigation).
- During facet refresh, the filter being edited remains authoritative while other shared filters are canonicalised to compatible values; incompatible selections are removed.
- Selecting all items is normalized to "All" to avoid storing large filter values.
- Filters can be reset via a "Reset filters" button which clears persisted filter cookies.
- Reset uses a form submit flag (`resetFilters=1`) and does not persist a `resetFilters` query parameter in the browser URL.
- Filters are persisted in a signed cookie and re-applied on subsequent visits.
- Submitting shared filters clears any active tab hash fragment from the URL before navigation so the page does not jump to a previous anchor position after reload.

Additional filters by dashboard:
- Completed tasks and User overview include date range filters for completedFrom/completedTo.
- Overview includes a date range for eventsFrom/eventsTo (applied to created/completed task events by service; cancelled is retained in backend aggregation but hidden in the UI).

## Charts and tables
- Most sections offer tabbed views: "Chart" and "Data table".
- Charts are rendered with Plotly using GOV.UK aligned colors.
- Data tables are available for accessibility and CSV export.

CSV export:
- Each table includes a "Download CSV" button.
- CSV content is built client-side from the visible table.

## Sorting and pagination
- Some tables support server-side sorting using column headers.
- Critical tasks and User overview tables support pagination.
- Sort and pagination state is stored in hidden inputs in the filter form and sent with each request.
- Backend pagination is hard-capped to the first 500 matching rows. Page requests beyond this capped window are clamped to the last allowed page.

## Partial refresh (AJAX sections)
- Each dashboard is composed of sections that can refresh independently using AJAX.
- Initial page load renders placeholders; sections are refreshed client-side to reduce initial load time.
- When a filter is submitted with `X-Requested-With: fetch`, the server returns the relevant partial only.
- Each partial has a `data-section` ID that ties the response to the correct HTML fragment.

## Error and empty states
- If a partial fails to load via AJAX, the UI falls back to a full page submission.
- Certain sections show empty-state messages (for example, task audit without a case ID).
