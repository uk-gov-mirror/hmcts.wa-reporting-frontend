# Frontend specification

## Templating and layout
- Nunjucks is the server-side templating engine.
- Base layout: `src/main/views/layouts/main.njk` extends `govuk/template.njk`.
- Analytics layout: `src/main/views/analytics/layout.njk` adds GOV.UK header + service navigation and defines the page content block.
- Assets are included through `src/main/views/webpack/css.njk` and `src/main/views/webpack/js.njk`.

```mermaid
flowchart LR
  Controller["Controller"] --> ViewModel["View model"]
  ViewModel --> Nunjucks["Nunjucks templates"]
  Nunjucks --> HTML["HTML + data attributes"]
  HTML --> JS["Analytics JS (charts, AJAX)"]
  JS --> UI["Interactive dashboards"]
```

## Global Nunjucks helpers
The Nunjucks environment adds:
- Global: `manageCaseBaseUrl` (for case links)
- Filters: `formatNumber`, `extractNumericColumns`, `decorateNumericRows`

## Date display standard
- Analytics UI dates are displayed as `D Mon YYYY` (for example, `3 Mar 2020`).
- Source date values remain ISO `YYYY-MM-DD` for sorting and CSV export.
- Client-side sortable date cells keep ISO values in `data-sort-value`.
- Server-sorted priority columns include numeric `data-sort-value` metadata (`Urgent=4`, `High=3`, `Medium=2`, `Low=1`) so client-side table enhancement preserves severity ordering.
- CSV export prefers cell `data-export-value` so visible formatted dates can export as ISO.

## Key UI patterns
- GOV.UK Design System components (header, service navigation, tabs, tables, summary list, buttons, inputs).
- MOJ date picker for date inputs.
- Custom analytics multi-select component for filters.

### Analytics table macro
`macros/analytics-table.njk` wraps the GOV.UK table and:
- Detects numeric columns from header metadata.
- Adds numeric formatting and bold totals row styling.
- Supports sticky headers and sticky totals row.

### CSV export
`macros/csv-download.njk` adds a button which the JS layer uses to download the current table as CSV.

### Case links
`macros/case-link.njk` builds a link to Manage Case using `manageCaseBaseUrl` and opens in a new tab.

## JavaScript behaviors
Entry points:
- `src/main/assets/js/index.ts` (global GOV.UK/MOJ init)
- `src/main/assets/js/analytics.ts` (analytics-specific behaviors)

Script loading:
- `src/main/views/webpack/js.njk` loads the global `main` bundle on all pages.
- `src/main/views/webpack/analytics-js.njk` loads the `analytics` bundle.
- `src/main/views/analytics/layout.njk` includes `webpack/analytics-js.njk` so the analytics bundle is loaded only for analytics routes.

Key behaviors:
- Plotly charts are rendered from JSON configs in `data-chart-config` attributes.
- Sections marked with `data-ajax-initial` are refreshed by an AJAX call after initial page load.
- Initial `data-ajax-initial` section refreshes are queued with a concurrency limit of 2 in-flight requests.
- Analytics section handlers should only fetch data needed for the requested section (for example, `/users` completed section does not fetch completed-by-date rows unless the completed-by-date section is requested).
- Filter forms with `data-ajax-section` can refresh a single page section without a full reload.
- Shared-filter faceting uses section-scoped AJAX refresh of `data-section="shared-filters"` with `ajaxSection=shared-filters`, `changedFilter`, and `facetRefresh=1`.
- Faceted shared-filter refresh is triggered when a shared-filter multi-select closes after a selection change.
- Shared dashboard filter submissions clear any active URL hash (`#...`) before full-page navigation to avoid anchor-based scroll jumps after reload.
- "Reset filters" is submitted as form data (`resetFilters=1`) rather than a query-string navigation, so reset does not leave `resetFilters` in the URL.
- Server-side sorting uses hidden inputs and submits a filtered form to fetch sorted data.
- Pagination uses hidden inputs and submits filtered form to fetch the next page.
- Multi-select filters support search, select all, and dynamic summary text.
- Scroll position is stored and restored when table sorting or pagination triggers full page reloads.
- Global page initialization is owned by `index.ts`; analytics AJAX refreshes re-initialize only the replaced section scope in `src/main/assets/js/analytics/ajax.ts`.

```mermaid
sequenceDiagram
  participant User as User
  participant Form as Filter form
  participant Server as Server
  participant Section as Page section
  User->>Form: Submit filters
  Form->>Server: POST with X-Requested-With: fetch
  Server-->>Section: Partial HTML
  Section-->>User: Update section in-place
```

## Charts
- Plotly is bundled and assigned to `window.Plotly` for use by chart components.
- Base config:
  - Responsive layout
  - Modebar without lasso/select/auto-scale
  - Autosized axes with compact margins
  - Shared time-series helpers (`src/main/modules/analytics/shared/charts/timeSeries.ts`) set date-axis formatting and support common axis-title configuration (`axisTitles`) so dashboards can keep chart labels aligned with table terminology.
  - Shared time-series helpers also emit `behaviors.autoFitYAxesOnXZoom` metadata in each serialized Plotly config so the frontend can re-fit y-axes when the visible x-axis date range changes.
- Chart types:
  - Donut charts (priority and compliance)
  - Stacked bar time series
  - Stacked horizontal bar charts
  - Line charts with optional standard deviation bands
- Time-series auto-fit behavior:
  - `src/main/assets/js/analytics/charts.ts` listens for Plotly `plotly_relayout` events on charts that carry `behaviors.autoFitYAxesOnXZoom`.
  - Each rule names an axis (`y` or `y2`) and a strategy (`stacked-bar-sum`, `stacked-bar-and-line-max`, or `line-extents`).
  - On x-axis zoom or pan, the frontend recalculates visible maxima from the serialized trace data, applies padding, and relayouts the affected y-axis or y-axes.
  - On x-axis reset/autorange, the frontend restores autorange for the affected y-axis or y-axes.
- A custom scroll/pan UI is used for large category lists (open tasks by name and completed tasks by name).

## Styling (SCSS)
- GOV.UK frontend is configured via Sass modules (`@use 'govuk-frontend/dist/govuk/index'`) and MOJ frontend styles are loaded via `@use '@ministryofjustice/frontend'` (MOJ v9).
- Page width is set to 1600px via `$govuk-page-width`.
- CSS variables define chart colors aligned with GOV.UK palette.
- Shared chart colours are defined in `src/main/modules/analytics/shared/charts/colors.ts` using named colour keys (for example `purple`, `blueDark`, `blueLight`, `greyLight`, `blue`, `grey`, `green`).
- Priority bucket charts explicitly map Urgent/High/Medium/Low to `purple`/`blueDark`/`blueLight`/`greyLight`; non-priority chart semantics reuse the same blue/grey/green palette family.
- Custom styles for:
  - Analytics charts and small charts
  - Multi-select dropdown and search
  - Tab panel sizing and pagination bar
  - Sticky headers and sticky totals rows
