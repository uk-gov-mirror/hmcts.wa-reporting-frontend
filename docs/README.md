# Documentation index

This folder contains business, functional, and technical specifications for the Task Management Report (wa-reporting-frontend) application. The documents are written to be detailed enough to rebuild the application from scratch.

## How to use this documentation
- Start with the business context and glossary to understand the domain language.
- Read the functional specs for each dashboard to understand user-facing behavior.
- Use the technical specs for architecture, data sources, UI behavior, security, config, and operations.

## Document map

### Business
- docs/business-context.md
- docs/glossary.md

### Functional
- docs/functional/landing-and-navigation.md
- docs/functional/overview-dashboard.md
- docs/functional/outstanding-dashboard.md
- docs/functional/completed-dashboard.md
- docs/functional/user-overview-dashboard.md

### Technical
- docs/technical/architecture.md
- docs/technical/data-sources.md
- docs/technical/frontend.md
- docs/technical/security.md
- docs/technical/configuration-and-ops.md
- docs/technical/testing.md

## Source of truth
The specifications are derived from the current codebase and configuration under:
- src/main (server, routes, modules, views, assets)
- config (application configuration and environment mappings)
- prisma (database client setup)
- package.json (scripts and dependencies)

