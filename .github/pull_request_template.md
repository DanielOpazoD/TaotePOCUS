## Summary

<!-- One short paragraph: what changes and why. -->

## What changed

- [ ] Code
- [ ] Tests
- [ ] Documentation (`README`, `CHANGELOG`, ADRs, JSDoc)
- [ ] Build / CI / tooling
- [ ] Visual / UX

## Verification

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run format:check` passes
- [ ] `npm test` passes
- [ ] `npm run build` succeeds
- [ ] `npm run test:e2e` passes (only if UI flows changed)
- [ ] Manual smoke test on light + dark themes
- [ ] Keyboard navigation still works (modals trap focus, Esc closes, Tab cycles)

## Screenshots / videos

<!-- For UI changes. Include before/after if visual. -->

## Risk

<!-- What is the worst that can happen if this lands and silently breaks? -->

## ADR

<!--
  PRs that touch architectural paths (lib/repo, lib/server, lib/ai/{registry,provider},
  lib/env, lib/schemas, lib/schemas/api, app/api, proxy.ts, next.config.mjs,
  eslint.config.mjs, vitest.config.ts, tsconfig.json, .github/workflows/ci.yml)
  must either ship a new ADR under `docs/adr/` or carry the skip token
  below. CI will block the merge otherwise.

  Pick ONE:
    - Adding an ADR? Delete the `[skip-adr]` line below. The check
      will detect the new `docs/adr/NNNN-*.md` file.
    - Not an architecture change? Keep `[skip-adr]` and replace the
      placeholder with a one-line reason.
-->

[skip-adr]: <one-line reason — or DELETE this whole line if you ARE adding an ADR>

## Out of scope / follow-ups

<!-- Things you noticed but deliberately didn't fix here. Link issues. -->
