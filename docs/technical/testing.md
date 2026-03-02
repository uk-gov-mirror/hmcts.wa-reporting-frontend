# Testing and quality

## Test suites
- Unit tests: Jest (`src/test/unit`).
- Route tests: Jest with `jest.routes.config.js` (`src/test/routes`).
- Accessibility tests: Playwright + Axe (`src/test/a11y`).
- Functional tests: Playwright (`src/test/functional`).
- Smoke tests: Playwright (`src/test/smoke`).

## Key commands
- `yarn test` (unit tests)
- `yarn test:coverage`
- `yarn test:routes`
- `yarn test:mutation`
- `yarn test:mutation:ci`
- `yarn test:a11y`
- `yarn test:functional`
- `yarn test:smoke`
- `yarn test:ui` (Playwright UI mode)
- `yarn setup:edge` (install Edge for Playwright)

## Accessibility
- Playwright a11y tests run with `AUTH_ENABLED=false` and perform Axe checks.
- Each analytics page should have coverage in the a11y suite.

## Playwright browsers
- Functional tests run against Chromium, Firefox, WebKit, and Edge via Playwright projects.
- Smoke and a11y tests run on Chromium only.
- Install Edge with `yarn setup:edge` if you see missing `msedge` errors.

## Playwright common
- Prefer using `@hmcts/playwright-common` helpers and shared configuration in the first instance for new Playwright tests.
- Only introduce custom Playwright utilities when a requirement is not covered by the shared helpers.
- Keep new Playwright tests aligned with the shared patterns to reduce maintenance overhead.

## Coverage targets
- Project guidelines require at least 95% branch and line coverage on modified files.

## Unit test quality checklist
- Name tests as clear behavior statements (condition and expected outcome).
- Keep tests deterministic: avoid runtime clock/random/network dependencies unless explicitly controlled.
- Structure tests as Arrange/Act/Assert and keep each test focused on one primary behavior.
- Assert observable behavior and dependency contracts, not only implementation internals.
- For dependency-bound logic, include rejection/error-path tests alongside success-path tests.
- Prefer precise assertions over broad ones (for example explicit error/status checks instead of bare `toThrow()`).
- Use typed fixture builders/factories for repeated complex objects to reduce duplication and improve readability.
- Restore global state in teardown (`process.env`, timers, DOM globals, spies, and module caches where relevant).

## Assertion quality patterns
- Prefer `toHaveBeenCalledWith(...)` or `toHaveBeenNthCalledWith(...)` when call parameters/order are part of behavior.
- Avoid low-signal assertions (`toBeDefined`, `expect.any(...)` placeholders, or "was called" only checks) when stronger checks are possible.
- Prefer semantic assertions on returned structures over brittle serialization checks (for example exact JSON string equality).
- Prefer parsing URL/query outputs (`URL`/`URLSearchParams`) over substring assertions for pagination/filter links.

## Maintainability patterns
- Split large omnibus tests into focused cases to reduce failure blast radius and improve diagnostics.
- Consolidate duplicate coverage ownership so one suite is the source of truth for a module's behavior.
- Replace repeated inline fixtures with shared builders once the same shape appears in multiple tests.
- Avoid coupling to framework-private internals (such as Express stack index positions) unless no public seam exists.
- Freeze time in date-sensitive tests with `jest.useFakeTimers().setSystemTime(...)` and reset in teardown.

## Security-sensitive unit tests
- Session tests should assert security-relevant options, including cookie flags and session behavior fields.
- OIDC tests should assert explicit authorization failure semantics (error type/status/message), not only generic throws.
- Helmet tests should cover a stable set of CSP and related directives beyond a single script directive.
- CSRF tests should assert both token generation and validation wiring for enabled/default states.

## Mutation testing
- Mutation testing runs with StrykerJS against Jest unit tests (`jest.config.js`).
- Local command: `yarn test:mutation`.
- CI-friendly command: `yarn test:mutation:ci`.
- HTML report output: `reports/mutation/html/report.html`.
- Current mutation scope covers analytics shared, completed, overview, outstanding, and user-overview module TypeScript files.
- Current thresholds are `break: 80`, `low: 70`, and `high: 80`, validated by two consecutive `80.13` mutation-score runs on 14 February 2026.
- Local runtime budget for the expanded scope is typically 12-20 minutes. Keep `mutate` scope unchanged and tune Stryker concurrency only if runtime/stability degrades.
- Current setting uses `concurrency: 2` for stability; occasional worker OOM/SIGSEGV restarts may still occur during long runs.
- Surviving mutants should be triaged by business risk, and addressed with targeted unit test improvements rather than broad file exclusions.

## Linting and formatting
- `yarn lint` runs stylelint (SCSS), eslint (TS/JS), and prettier checks.
- `yarn lint:fix` runs auto-fix for ESLint and Prettier.
