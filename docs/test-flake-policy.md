# Test flake policy

Short document with the policy + the registry of known flakes. Goal: when a test fails on CI, you know whether to rerun, retry, or stop and debug — without having to dig.

## Triage rules

| Symptom                                          | Action                                                                                                |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Test fails first time in CI, passes locally      | Rerun the failing job once via `gh run rerun <id> --failed`.                                          |
| Test fails twice in a row in CI (after rerun)    | Escalate — investigate. Don't merge over it.                                                          |
| Test is in this doc's "Known flakes" table below | Vitest `{ retry: 2 }` handles it OR Playwright's built-in retry config. Don't add to PR-body excuses. |
| Test fails consistently after a code change      | It's not a flake — your change broke something. Fix the cause.                                        |

## Don't

- **Don't add to PR title:** "merge despite flake". CI noise is corrosive. Either retry it or fix it.
- **Don't `test.skip` permanently** without a follow-up linked. Lost coverage is worse than a 5-minute rerun.
- **Don't expand the known-flakes list casually.** Each entry is a small admission of timing fragility — accumulating them masks real regressions.

## Known flakes (May-2026)

| Test                                                                                                            | Class                                                     | Mitigation in place                                                    | Reproduce                                                                 |
| --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `tests/AISuggestionsPanel.test.tsx > "calls the translate endpoint, displays diff, and applies the suggestion"` | happy-dom render race on `getByRole("textbox")`           | `it("...", { retry: 2 }, ...)` — three attempts in CI                  | ~1 in 12 CI runs; near-zero locally                                       |
| `e2e/admin.spec.ts > "Admin flow > admin smoke — login, tab routing, Backup pre-flight visible"`                | Playwright "element detached" during admin tab transition | Playwright's default `retries: 2` in `playwright.config.ts` handles it | Was flaky in PR #144 era; not observed in PRs #145-156 chain. Watch list. |

## Adding a new flake to this list

If a test starts flaking and you can't fix the root cause immediately:

1. **First**, try to fix it. Most flakes are real timing issues that the test exposes.
2. If the fix isn't quick, add `{ retry: 2 }` to the failing test (Vitest) or rely on Playwright's `retries` (already 2 in this repo).
3. Add a row to the "Known flakes" table above with:
   - Test path + name
   - Class of flake (timing race, race condition, network mock, etc.)
   - Mitigation in place
   - Rough reproduce frequency
4. Open a follow-up issue/task for the underlying fix.

## Removing from the list

A test stays in this table for 3 months (12 weeks). If no instance has been reported in CI over that window, remove the row + drop the `{ retry: 2 }` annotation. If it's still flaking, escalate to a real fix.
