# Agent Instructions — Jungle Editor

This file contains mandatory instructions for any AI agent (GitHub Copilot, Codex, Claude, or other) working on this repository.

## Golden Rule: Always Run Tests

**After every code change, you MUST run the E2E test suite:**

```bash
npm run test:e2e
```

This runs all Playwright E2E tests that verify the core editing workflows still work. If any test fails, you must fix the regression before finishing your task. Never disable or skip tests unless the user explicitly asks you to.

## Test Suite Overview

The E2E tests in `e2e/` cover these critical user flows:

| Test File | What It Verifies |
|-----------|-----------------|
| `e2e/01-open-video.spec.ts` | User can import a video file into the media bin |
| `e2e/02-add-to-timeline.spec.ts` | User can add imported media onto the timeline as clips |
| `e2e/03-cut-clip.spec.ts` | User can split/cut a clip using toolbar button or cut tool |
| `e2e/04-render-export.spec.ts` | User can open export dialog, run export, and see completion |

## When to Add New Tests

If you implement a new user-facing feature, you must also add a Playwright E2E test for it in `e2e/`. Follow the existing naming convention: `NN-feature-name.spec.ts`.

## Quick Reference

```bash
# Run all E2E tests (starts dev server automatically)
npm run test:e2e

# Run with Playwright UI for debugging
npm run test:e2e:ui

# Run type checking + E2E tests together
npm test

# Type check only
npm run type-check
```

## What to Check Before Completing Any Task

1. **TypeScript compiles cleanly**: `npm run type-check` passes with zero errors
2. **E2E tests pass**: `npm run test:e2e` — all tests green
3. **No `data-testid` attributes were removed** — they are required for testing
4. **New interactive UI elements have `data-testid`** — all buttons, inputs, panels
