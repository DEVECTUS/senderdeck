# Workspace reference and verification — 9 November 2026

The requested reference is TREG's app screens and connection experience, not its account routing or credentials.

Reference: https://github.com/superdesigndev/treg at 6dabc01ad4938d894f5b3f0c9d8bf99dc68343ad.
Reviewed ConnectionsPage.vue, DashboardNavigation.vue, dashboard.css and the connection controller. The live app redirected to a sign-in dialog; no TREG account was connected or modified.

REA 6.7.0 was run locally with analyze-javascript-application against the reference frontend, selecting src/state/connections.js and src/state/connectionsComputed.js. It parsed both files (3,255 AST nodes, no parse failures). Evidence ID: ev_2546e0115c6b6dd9640c9a01e2c00e3a9f0d7148923169460ba31b00defb92b4. This is static source analysis; it does not prove live provider behavior. The remaining 104 files were outside that analysis selection. Full local evidence: C:/Users/barsham/.codex/tmp/treg-rea-analysis.json.

Adopted patterns: compact top navigation with selected pills and account menu; muted background and white bordered surfaces; small headings; Connected and Add a connection sections; searchable provider tiles and category filters; connection method and requirements before provider authorisation; explicit brand and asset selection in the existing Meta wizard.

The UI was implemented in SenderDeck's existing React components, with a shared stylesheet across the authenticated workspace and related setup screens. Provider OAuth, callback validation, scopes, stored account ownership, publishing and reply approvals remain in the existing service. No popup polling or capability options are presented unless the backend supports them. LinkedIn remains a requirements route while approval is pending. No scheduling or planning functionality was introduced.

Validation: TypeScript; existing 326 unit tests; 26 rendered route tests; read-only local browser preview with synthetic accounts. Browser checks cover connected rows, search/category filtering, Instagram setup, account menu and responsive layout. No live provider authorisation or public post is part of this visual change.
