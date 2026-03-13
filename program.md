# Instant Writer Pro — Autonomous Improvement Program

This is a self-improvement program for Instant Writer Pro, inspired by [karpathy/autoresearch](https://github.com/karpathy/autoresearch). An AI agent reads this file and autonomously fixes bugs, improves code quality, and iterates — keeping improvements and discarding failures.

## Project Overview

Instant Writer Pro is a WYSIWYG page editor built with **React + TypeScript + Vite + Tauri**. It features multi-page editing, pagination/reflow, PDF export, drag-and-drop, QR codes, table of contents, bullet overlays, and more.

### Architecture

| File | Lines | Role |
|---|---|---|
| `App.tsx` | ~5500 | Main app: state, formatting, export, shapes, PDF |
| `components/Editor.tsx` | ~3500 | ContentEditable editor: keyboard, selection, paste |
| `utils/pagination.ts` | ~1700 | Page reflow engine: split, pull-up, overflow |
| `components/Toolbar.tsx` | ~1400 | Formatting toolbar UI |
| `components/ImageOverlay.tsx` | ~900 | Image resize/crop overlay |
| `components/BulletOverlay.tsx` | ~500 | Bullet/list overlay |
| `components/BlockContextMenu.tsx` | ~500 | Right-click context menu |
| `constants.ts` | ~400 | Paper sizes, font lists, defaults |
| `types.ts` | ~60 | TypeScript type definitions |
| `utils/fontUtils.ts` | ~100 | Font loading utilities |
| `utils/autoLog.ts` | ~180 | Auto-logging utility |
| `utils/patternDetector.ts` | ~200 | Pattern detection |
| `utils/structureScanner.ts` | ~190 | Document structure scanner |
| `utils/tableMerge.ts` | ~75 | Table cell merge logic |

---

## Scope Rules

### What you CAN modify
- Any `.tsx` or `.ts` file in the project root, `components/`, `utils/`, or `services/`
- You can add new files in `utils/` or `components/` if needed

### What you CANNOT modify
- `package.json`, `package-lock.json` — no dependency changes
- `vite.config.ts`, `tsconfig.json` — build config is fixed
- `src-tauri/` — Rust/Tauri backend is out of scope
- `node_modules/` — never touch
- `index.html` — fixed entry point

---

## Evaluation Criteria

For every change, you MUST verify success using these steps:

### Automated (MUST ALL PASS)
1. **Build**: `npm run build` — must exit code 0
2. **No regressions**: The change must not break existing functionality

### Visual (when applicable)
3. **Browser check**: If the change affects UI rendering, open `http://localhost:5173` in the browser and visually confirm the change works correctly
4. **PDF export**: If the change affects export, test by exporting a sample document

### Decision Rule
- ✅ Build passes AND improvement confirmed → **KEEP** (commit, log)
- ❌ Build fails → **DISCARD** (git reset, log as crash, try different approach)
- ⚠️ Build passes but change seems risky → **KEEP with note** (commit, log with warning)

---

## Bug Backlog

Priority-ordered list of known issues. Pick the highest-priority unfixed item.

### P0 — Critical
_(Empty — add critical bugs here as they are discovered)_

### P1 — Important
1. **`as any` type safety** — ~25 instances of `as any` casts across `App.tsx`, `pagination.ts`, `BorderModal.tsx`, `TOCModal.tsx`. Each one hides a potential runtime error. Fix by adding proper types.
2. **`@ts-ignore` suppression** — 2 instances in `App.tsx` (lines ~972-974) and 1 in `fontUtils.ts` (line 67). Investigate and fix with proper typing.
3. **Bundle size warning** — Production bundle is 930KB. Consider code-splitting `App.tsx` (5500 lines) into smaller modules.

### P2 — Nice to Have
4. **Console.log cleanup** — Debug `console.log/warn/error` statements scattered across 7 files (`App.tsx`, `DragHandle.tsx`, `ExportModal.tsx`, `ImageOverlay.tsx`, `Editor.tsx`, `fontUtils.ts`, `autoLog.ts`). Remove debug-only logs, keep intentional error handling.
5. **App.tsx decomposition** — At 5500 lines, `App.tsx` is a monolith. Extract logical subsystems into separate files/hooks (e.g., PDF export, shape management, formatting logic).

---

## Improvement Backlog

Priority-ordered list of improvements. Pick the highest-priority item.

### Code Quality
1. **Extract PDF export logic** from `App.tsx` into `utils/pdfExport.ts`
2. **Extract shape/drawing logic** from `App.tsx` into `utils/shapeManager.ts`
3. **Extract formatting logic** from `App.tsx` into `utils/formatting.ts`
4. **Add proper TypeScript interfaces** for style objects instead of `as any` casts
5. **Consistent error handling** — replace bare `console.error` with a structured error reporter

### Performance
6. **Memoize expensive computations** — look for repeated DOM queries in hot paths
7. **Lazy-load heavy modals** — QRCodeModal, ExportModal, etc. don't need to load at startup

---

## Experiment Loop

LOOP FOREVER:

1. **Read the current state**: Check `results.tsv` and recent git history for context
2. **Pick an item**: Choose the highest-priority unfixed item from Bug Backlog or Improvement Backlog
3. **Plan the change**: Think through the approach before coding
4. **Implement**: Make the code changes
5. **git commit**: `git add -A && git commit -m "experiment: <description>"`
6. **Verify**: Run `npm run build`
7. **Evaluate** results:
   - If build **succeeds** → extract result, compare with baseline
   - If build **fails** → run `npm run build 2>&1 | tail -30` to see errors
8. **Record** in `results.tsv`:
   ```
   <commit_hash>\t<build_status>\t<description>
   ```
9. **Keep or discard**:
   - ✅ **Better**: Keep the commit, update backlog
   - ❌ **Worse/crash**: `git reset --hard HEAD~1`, log as discard/crash
10. **Move to next item** → GO TO step 1

### Rules
- **NEVER STOP** — continue until manually interrupted
- **One change at a time** — never combine multiple fixes in one experiment
- **Small diffs** — prefer surgical, minimal changes
- **Simplicity wins** — if a change adds complexity without clear benefit, discard it
- **Don't break what works** — if unsure, be conservative

---

## Logging Format

### results.tsv columns (tab-separated)
```
commit	build	status	description
```

- `commit`: short git hash (7 chars)
- `build`: `pass` or `fail`
- `status`: `keep`, `discard`, or `crash`
- `description`: short text of what was tried

### Example
```
commit	build	status	description
a1b2c3d	pass	keep	baseline
b2c3d4e	pass	keep	replaced as-any cast in BorderModal with proper type
c3d4e5f	fail	crash	attempted to extract PDF export (missing import)
d4e5f6g	pass	discard	added memoization to toolbar (no measurable improvement)
```

---

## Getting Started

When prompted to begin, do the following setup:

1. **Verify build**: `npm run build` — confirm it passes
2. **Create branch**: `git checkout -b autofix/<tag>` (use today's date, e.g. `mar13`)
3. **Initialize results.tsv**: Create file with header row only
4. **Run baseline**: Commit current state, log as baseline in results.tsv
5. **Begin the loop**: Start with the highest-priority bug

Then say: _"Setup complete. Starting autonomous improvement loop."_ and begin.
