# Development Guidelines

## Core Principles

### I. Code Quality Is Non-Negotiable

Changes must be maintainable: no new duplication, keep cognitive load flat, idiomatic TypeScript, modular routes, and GOV.UK-compliant UI. Lint, formatting, and type errors block merge; behavior changes require tests. Use existing naming patterns: match file, class, function, and route names to nearby modules; avoid new abbreviations unless already established.

### II. Tests Define Release Readiness

Every feature ships with appropriate unit tests for edge cases and error
paths, route tests for Express endpoints, automated accessibility coverage (Playwright + AxeUtils), and
smoke tests for unmocked happy paths. Tests act as living documentation for intended behavior.

### III. GOV.UK Experience Consistency

GOV.UK Design System patterns (https://design-system.service.gov.uk) are the preferred option in every flow.
Pages use GOV.UK Frontend macros, typography, spacing tokens, and colour palette;
bespoke styling is only allowed when no pattern exists. Content follows the GOV.UK style guide and
interactive states retain ≥ WCAG AA contrast.

### IV. Unit Test Quality And Maintainability Standards

Unit tests must remain clear, deterministic, and resistant to implementation-only refactors.
For all non-trivial test changes, apply these mandatory standards:

- Assert behavior and collaborator contracts at module boundaries (for example `toHaveBeenCalledWith(...)` for dependency calls).
- Cover both happy paths and rejection/error paths for dependency-bound logic (`mockRejectedValue`, thrown error, or equivalent).
- Use explicit negative-path assertions (error type/status/message); avoid broad `toThrow()` with no expectation.
- Freeze time for time-sensitive logic (`jest.useFakeTimers().setSystemTime(...)`) and restore timer state during teardown.
- Avoid coupling tests to framework/private internals (for example Express `_router.stack` indexes, middleware arity heuristics, private method access) unless no public seam exists and the reason is documented in the test.
- Extract repeated large fixtures into typed builders/factories once duplication appears across scenarios.
- Prefer high-signal assertions; avoid low-value checks such as `toBeDefined`, `expect.any(...)` stand-ins, or "was called" assertions without argument/outcome checks when stronger assertions are available.
- For security-sensitive modules (session, OIDC, helmet, CSRF), assert the full security-relevant configuration contract, not a single field.
- Keep tests focused: one behavior per test where practical, avoiding large omnibus cases that obscure failure diagnosis.

## Active Technologies

- TypeScript on Node.js + Express 5, Nunjucks/express-nunjucks, govuk-frontend components, Plotly for charts, axios for API data fetch, Prisma for database integration.
- Playwright smoke/functional tests with @hmcts/playwright-common (shared Playwright config and helpers).
- GOV.UK Design System using the `govuk-frontend` library; refer to https://design-system.service.gov.uk/ for official documentation and usage.

## Subagents (When Available)

Use subagents to parallelise work that can be done independently, then consolidate findings in the main thread. Good fit examples:

- Broad discovery across multiple areas (e.g., one agent scans `docs/`, another scans `src/main/modules/analytics/`, another scans `src/test/`).
- Multi-file refactors with independent scopes (e.g., controller/service/viewModel updates vs. Nunjucks template changes).
- Test coverage work (e.g., one agent identifies missing tests or coverage gaps, another drafts unit/route/a11y tests).
- Investigations that benefit from parallel tracks (e.g., one agent reproduces or runs tests, another inspects recent specs or config).
- Documentation sync tasks (e.g., one agent updates `docs/`, another updates code/tests to match).
- Verification orchestration (e.g., if CI/tooling allows safe parallel runs, delegate lint/tests/build to separate agents and aggregate results).

For verification after code changes, use subagents by default and run independent checks in parallel:

- Spawn one subagent each for `yarn lint`, `yarn test:coverage`, `yarn test:routes`, `yarn build`, and `yarn build:server`.
- Run these checks in parallel unless a concrete dependency requires sequencing.
- Treat `yarn build` as the frontend asset build only. Use `yarn build:server` for the server TypeScript compile. If the change affects packaged runtime output or `yarn start`, also run `yarn build:prod`.

## Project Structure

```text
docs/
  functional/
  technical/
src/
  main/
    modules/
    routes/
    views/
    assets/
    public/
    resources/
  test/
    unit/
    functional/
    a11y/
    smoke/
    playwright/
      auth/
config/
prisma/
scripts/
```

## Key commands

- `yarn test:unit`
- `yarn test` (repository wrapper; locally delegates to `yarn test:unit`, currently exits early when `CI=true`)
- `yarn test:coverage`
- `yarn test:routes`
- `yarn test:mutation`
- `yarn lint`
- `yarn build` (frontend assets)
- `yarn build:server` (server TypeScript)
- `yarn build:prod` (production assets + static copy)
- Add dependencies with `yarn add` (or `yarn add -D` for dev deps) to ensure the latest versions are pulled in.

## Implementation Guidance

- Analytics pages live under `src/main/modules/analytics/<page>/` with `controller.ts`, `service.ts`, `page.ts`, `viewModel.ts`, and optional `visuals/` for charts/data fetchers. Purpose — `controller.ts`: HTTP entrypoint and route wiring; `service.ts`: data access orchestration; `page.ts`: async composition and fallbacks; `viewModel.ts`: shape data for templates; `visuals/`: chart builders and data fetchers.
- Register new page routes in `src/main/modules/analytics/index.ts` and keep rendering in the page controller (`res.render('analytics/<page>/index')`).
- Nunjucks templates for analytics pages live under `src/main/views/analytics/<page>/index.njk`, with per-page partials in `src/main/views/analytics/<page>/partials/` and shared filters in `src/main/views/analytics/partials/shared-filters.njk`.
- Where Nunjucks macros exist, they should be preferred over pure HTML.
- Shared analytics helpers belong in `src/main/modules/analytics/shared/` (filters, services, viewModels, charts, cache, repositories); reuse before adding new helpers.
- Before researching or planning a change, review the relevant `docs/` specifications and use them as the starting point for understanding current behavior, data flows, and constraints.
- When changing code or behavior, update the corresponding `docs/` files to keep the specifications in sync with the implementation. Dependency-only upgrades must not add or change `docs/`.
- Documentation updates for implementation changes must keep `docs/` as the latest specification of the application. Carry forward only durable, important context needed for future work (for example final behavior, rules/constraints, dependencies, and operational considerations such as migrations/backfills/rollback).
- Do not consider implementation work complete until this documentation handoff is committed in `docs/` (or, if no existing page fits, in a new linked document under `docs/` and indexed from `docs/README.md`). This requirement does not apply to dependency-only upgrades. Do not require changelog-style detail such as exhaustive file-change listings.
- When changing the analytics SQL end state through Flyway migrations, keep `db/current-state/tm-analytics-schema.sql` synchronised with the same final schema, helper, and stored procedure definitions so the repository has one consistent current-state bootstrap script.
- For AJAX section refreshes (e.g., user overview sorting), follow the established pattern: add a `data-section` wrapper around the section partial, submit `ajaxSection` with `X-Requested-With: fetch`, render the specific partial in the controller when the header/section is present, and send URL-encoded form data (including `_csrf`) so `csurf` can validate it.
- Add or update tests under `src/test/` following existing unit/functional/a11y/smoke patterns for the change. Branch and line coverage per file should be at least 95%.
- For changes in mutation-sensitive analytics logic (for example `shared/` helpers, analytics aggregations, repository filter/query composition, and view-model calculations), run focused mutation testing during development using `yarn test:mutation --mutate <source-file>` and, when helpful, `--testFiles <matching-test-file>` to validate the changed unit tests kill mutants in that area.
- Mandatory for non-documentation changes: the final step after any code/config/runtime SQL change is to run `yarn lint`, `yarn test:coverage`, `yarn test:routes`, `yarn build`, and `yarn build:server`; do not consider work complete unless all five pass and coverage for files modified as part of the task is above the mandated 95%. If the change affects packaged runtime output or `yarn start`, also run `yarn build:prod`.
- `yarn build:prod` rewrites `src/main/views/webpack/{css.njk,js.njk,analytics-js.njk}` as generated verification artifacts; those file changes must not be committed unless the asset-manifest generation itself is being intentionally changed.
- Documentation-only exception: when all changed files are documentation files (for example `*.md` under repo root or `docs/`) and no executable code, configuration, SQL, assets, or tests are changed, the mandatory verification commands are not required.
- Any changes which impact these Development Guidelines should be accompanied with changes to the Development Guidelines.

# ExecPlans

When writing complex features or significant refactors, use an ExecPlan (as described in PLANS.md) from design to implementation.

- ExecPlans may be treated as working artifacts and can remain uncommitted, but important, durable outcomes must be transferred into committed `docs/` before the related code change is considered complete.
- Transfer only what helps future contributors understand and evolve the current system state (for example behavior, constraints, dependencies, and operations guidance). Omit transient planning artifacts such as task breakdowns, discarded options, or per-file edit logs unless they are operationally relevant.

## Repo Skills

This repository includes reusable Codex skills under `skills/`.

### Available skills

- `yarn-dependency-upgrades`: Upgrade dependencies with Yarn 4 for single, multiple, all-package, and CVE-driven flows. Includes precedence-based remediation for `yarn-audit-known-issues` findings and resolution fallback guidance. (file: `skills/yarn-dependency-upgrades/SKILL.md`)
