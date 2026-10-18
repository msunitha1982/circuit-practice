# CLAUDE.md

Circuit Practice Generator: a static website (TypeScript, Vite, deployed to GitHub Pages) that generates unlimited circuit-analysis practice problems, each with an SVG diagram, a checked answer box, and several worked solution methods.

**`SPEC.md` is the source of truth.** Read the relevant sections before starting work. If the spec is wrong, unclear or conflicts with what you find, stop and ask. Do not silently deviate. When a decision is settled, record it in `docs/decisions.md` and tell me so the spec can be updated.

## Current milestone

**M2 Generator and gallery.** Work only on this milestone. Update this line when a gate passes and I confirm. (M1 Foundations gate passed and confirmed 2026-10-18.)

## Hard rules

1. Never use `Math.random()`. All randomness goes through the seeded RNG in `src/core`.
2. No answer is ever hand-coded. Every answer, number and solution step derives from the solver output.
3. All number formatting, engineering prefixes and unit parsing go through the one formatter module in `src/core`. No ad hoc `toFixed` in feature code.
4. All circuit values are complex numbers. DC is frequency 0. Do not add a separate real-only code path.
5. Components, solution methods and question types are plugin entries. Adding one must never require editing core logic.
6. The electrical model and the layout are separate. The solver never sees coordinates. The renderer never does arithmetic.
7. The same seed and settings must always produce byte-identical output.
8. Do not add features from later milestones. Interfaces they will need must not be blocked, but do not build them.
9. Do not add dependencies without saying why. Prefer none. KaTeX and the UI library chosen in `docs/decisions.md` are the expected ones.
10. Never hand-edit generated output to make a test pass. Fix the cause.

## Definition of done (every change)

Before saying a task is finished, run and report the result of:

- Type check (strict, no `any` without a comment explaining why)
- Unit tests
- The seed sweep for any area you touched, once it exists

Every milestone adds its own tests. Every confirmed bug gets a regression test that pins its seed. Never delete or weaken a test to get green. If a test is wrong, explain why and ask first.

After finishing each step, invoke the reviewer subagent. Include its verdict in your report word for word. A step is not done while the reviewer has BLOCKING problems open.

## Working style

- Start each milestone with a short plan (modules, files, order, how you will test it) and wait for my OK before writing code.
- Build in small steps. After each step, show me what exists and how to see it, in plain words. I do not read the code, so tests and visible results are how I verify your work.
- Say clearly what is finished, what is partial, and what you are unsure about. Do not claim something works unless you ran it.
- Keep explanations of circuit behavior consistent with the spec: passive sign convention, terminal a to terminal b reference direction, ANSI symbols by default.
- Keep user-facing strings in one place so they can be translated later.

## Repo layout

```
src/core        circuit model, component registry, seeded RNG, formatter
src/solver      complex MNA solver and self-checks
src/generate    grid, series/parallel, template generators; validity rules; filters
src/layout      layout checks, label placement
src/render      SVG symbols, schematic renderer, layers, export
src/questions   question builders, answer checking, mistake detection
src/methods     one folder per solution method
src/ui          settings, problem page, solution page, worksheet export
tests/          unit and fixture tests
scripts/        seed sweep, gallery generation
docs/           decisions.md and notes
```

Create folders when a milestone needs them, not before.

## Commands

Fill these in as soon as they exist, and keep them current:

- Install: `npm install`
- Dev server: `npm run dev`
- Type check: `npm run typecheck`
- Tests: `npm test`
- Seed sweep: `npm run sweep` (not yet: arrives with the generator in M2)
- Gallery: `npm run gallery` (not yet: M2)
- Build: `npm run build` (runs the type check first)
- Node version: 24 (`.nvmrc`). CI uses `npm ci`.
- Deploy: manual only until M7 (GitHub Actions → "Deploy to GitHub Pages" → Run workflow)
