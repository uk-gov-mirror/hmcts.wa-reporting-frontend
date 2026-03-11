# Analytics Views

## Patterns to keep

- Page templates extend `analytics/layout.njk` and render content in
  `block analyticsContent` inside a `.govuk-width-container`.
- Use GOV.UK Frontend macros for headings, tabs, summary lists, date inputs, and
  buttons; avoid raw HTML for components.
- Filters live in `analytics/partials/*-filters.njk` and shared form elements in
  `analytics/partials/shared-filters.njk`.
- Tables use the `analyticsTable` macro with `data-export-csv` and
  `data-export-filename` attributes plus the `csvDownloadButton` macro.
- Charts are rendered via
  `<div class="analytics-chart"... data-chart-config='{{ charts.<key> | safe }}'>`.
- When tabs are needed, wrap chart/table HTML with `govukTabs` panels rather
  than custom markup.
