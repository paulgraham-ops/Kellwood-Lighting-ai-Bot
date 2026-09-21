# Kellwood-Lighting-ai-Bot

Instructions for agents working in this repository.

## CI minutes

GitHub Actions minutes are paid for, and on 21 September 2026 they ran out: GitHub stopped starting jobs until the account's billing was sorted. Paul's rule for every repository since then:

- **Pull requests run the quick checks only** — install, typecheck, lint and unit tests.
- **The slow browser suite (Playwright / e2e) runs in CI only on pushes to `main`**, after a merge, where a failure still shows up against the commit that caused it.
- So **run the browser suite locally before opening or merging a PR** that touches anything it covers, and say in the PR which suites you ran and that they passed. A green PR check no longer covers the browser tests.
- **Don't add** CI jobs that run slow suites on every push, or scheduled workflows, without asking Paul first.

A repository without CI yet follows the same rule the day it gets some.
