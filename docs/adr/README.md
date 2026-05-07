# Architecture Decision Records

ADRs capture **why** non-obvious decisions were made. Each one is short,
dated, immutable. New decisions get a new file; superseded ones link
forward.

## Index

| #    | Title                                                                                          | Status                                                 |
| ---- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| 0001 | [Mock authentication backed by `localStorage`](./0001-mock-auth-with-localstorage.md)          | Accepted (auth surface partly superseded by 0007)      |
| 0002 | [URL is the source of truth for view state](./0002-url-driven-state.md)                        | Accepted                                               |
| 0003 | [Repository facade between UI and persistence](./0003-repository-facade.md)                    | Accepted (extended by 0004 and 0006)                   |
| 0004 | [Firebase as primary persistence (feature-flagged)](./0004-firebase-as-primary-persistence.md) | Accepted (parallel option; production runs Netlify DB) |
| 0005 | [Observability with Sentry](./0005-observability-with-sentry.md)                               | Accepted                                               |
| 0006 | [Netlify Database dual-write with staged migration](./0006-netlify-database-dual-write.md)     | Accepted (write contract superseded by 0011)           |
| 0007 | [Server-side session for Server Actions authorization](./0007-server-side-session.md)          | Accepted                                               |
| 0008 | [Canonical `description` field, deprecate the trio](./0008-canonical-description-field.md)     | Accepted (superseded by 0010)                          |
| 0009 | [Uniform catalog UI: single header, single grid](./0009-uniform-catalog-ui.md)                 | Accepted                                               |
| 0010 | [Drop the legacy narrative trio](./0010-drop-legacy-narrative-trio.md)                         | Accepted                                               |
| 0011 | [Stage 4 partial: DB-authoritative writes](./0011-stage-4-partial-db-authoritative-writes.md)  | Accepted (supersedes write contract of 0006)           |
| 0012 | [Unified role resolution: `resolveRole()`](./0012-unified-role-resolution.md)                  | Accepted                                               |

## How to add an ADR

1. Copy the closest existing ADR as a template.
2. Numbering is sequential. No gaps.
3. Sections: Status, Date, Decider(s), Context, Decision, Consequences,
   Alternatives considered (when meaningful).
4. Once committed, the file is **immutable**. To revisit a decision,
   write a new ADR that references and supersedes the old one. Keep the
   old file in place — the historical reasoning matters.
