# Architecture Decision Records

ADRs capture **why** non-obvious decisions were made. Each one is short,
dated, immutable. New decisions get a new file; superseded ones link
forward.

## Index

| #    | Title                                                                                 | Status                  |
| ---- | ------------------------------------------------------------------------------------- | ----------------------- |
| 0001 | [Mock authentication backed by `localStorage`](./0001-mock-auth-with-localstorage.md) | Accepted (transitional) |
| 0002 | [URL is the source of truth for view state](./0002-url-driven-state.md)               | Accepted                |
| 0003 | [Repository facade between UI and persistence](./0003-repository-facade.md)           | Accepted                |

## How to add an ADR

1. Copy the closest existing ADR as a template.
2. Numbering is sequential. No gaps.
3. Sections: Status, Date, Decider(s), Context, Decision, Consequences,
   Alternatives considered (when meaningful).
4. Once committed, the file is **immutable**. To revisit a decision,
   write a new ADR that references and supersedes the old one. Keep the
   old file in place — the historical reasoning matters.
