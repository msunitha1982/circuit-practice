# Circuit Practice Generator: Project Spec

Last updated: Oct 17, 2026

## Purpose and goals

This project is a free static website that generates unlimited circuit-analysis practice problems on demand. Every problem comes with a professional diagram, a checked answer box, and several fully worked solution methods.

**Audience.** Introductory to intermediate students first (resistive DC circuits, Kirchhoff's laws, nodal and mesh analysis). Settings unlock advanced material (AC phasors, op amps, transients) for students further along. Teachers are a second audience and need printable worksheets with answer keys.

**Goals**

- Generate a new, valid, well-posed circuit problem every time, never from a fixed problem set.
- Make every part of the page (question text, diagram, answer box, solutions) adapt to the generated circuit automatically.
- Show multiple solution methods for every problem, so students learn why different approaches agree.
- Be trustworthy enough to study from: no wrong answer keys, no ambiguous diagrams.
- Run entirely in the browser on GitHub Pages (a `.github.io` site) with no backend.

**Non-goals**

- Not a general circuit editor or simulator. Students do not draw circuits.
- No accounts, server-side grading, or leaderboards.
- No tracking or analytics by default.

**Principles that decide trade-offs**

1. Correctness beats features. A smaller site with no wrong answers beats a larger one with a few.
2. One source of truth. Generate the circuit, solve it, then derive the question, answer, diagram and solutions from that one solved model.
3. Reproducibility. Every problem is fully determined by a short seed plus the settings.
4. Extensibility. Components, methods, question types and topics are plugins, so adding one never means rewriting the core.
5. Learning first. Clarity of explanation outranks visual flash and feature count.
6. Accessible and mobile-friendly from the start, not retrofitted.

## Architecture overview

Everything flows one way: generate a circuit, solve it, check it, then derive every part of the page from the solved result.

```
Settings + seed --> Generator --> Solver --> Checks
                        ^                       |
                        |                       |  any failure: re-roll with the next seed
                        +-----------------------+
                                                |
                                                |  all checks pass
                                                v
                  SOLVED CIRCUIT (single source of truth, read only)
        nodes, components, layout, complex V / I / P for every part
                 |                    |                     |
                 v                    v                     v
         Question builder      Diagram renderer      Solution methods
         (question text,       (SVG schematic,       (nodal, mesh,
          answer box,           question view,        reduction in v1;
          tolerance check)      plus solution         each a collapsible
                                layers)               plugin)
                 |                    |                     |
                 +--------------------+---------------------+
                                      |
                                      v
                 Web page: settings, problem, answer box, solutions
```

A failed check re-rolls the seed, so a student never sees a bad circuit. The question builder, renderer and solution methods only read the solved circuit and never do their own arithmetic, which keeps the answer, diagram and solutions in agreement by construction.

**Module responsibilities**

| Module | Responsibility | Depends on |
| --- | --- | --- |
| core | Circuit model, component registry, seeded RNG, number and unit formatter | Nothing |
| solver | Complex MNA solve, KCL and power-balance self-checks | core |
| generate | Builds valid circuits from settings and seed, applies filters | core, solver, layout |
| layout | Layout checks, label placement | core |
| render | SVG symbols, schematic, layers, export | core, layout |
| questions | Question builders, answer checking, mistake detection | core, solver |
| methods | Solution method plugins producing step data | core, solver |
| ui | Settings, problem page, solution page, worksheet export | All of the above |

## Circuit data model

Every circuit is one in-memory graph of nodes and components, and every other module reads only from it. All numeric values are complex numbers from day one, so AC and DC share one engine.

| Entity | Fields | Notes |
| --- | --- | --- |
| Node | id, label (A, B, C), isGround | Exactly one ground per circuit. Labels are what the diagram and question text show. |
| Component | id, type, name (R1, V2), terminals [a, b, ...], params | `params` is type-specific: value, gain, control reference, polarity. |
| Solution | node voltages, branch currents, per-component V, I, P | Complex values. Attached by the solver, never hand-edited. |
| Layout | node grid positions, component orientation | Produced by the generator or template. Kept separate from the electrical model. |
| Problem | seed, settings, circuit, question, answer | The unit that is shared, saved and tested. |

**Rules**

- Values are complex. DC is the case with frequency 0 (capacitor open, inductor short). AC uses impedances: R, jωL, 1/(jωC).
- Sign convention is part of the model. Each two-terminal component has a reference direction from terminal a to terminal b. Voltage is V(a) − V(b). Current is positive when flowing a to b through the component. The passive sign convention is stated once on the site and applied everywhere.
- Electrical model and layout are separate. The solver never sees coordinates, and the renderer never does arithmetic.

**Component plugin interface**

A component type is one entry that supplies all of the following. Adding a new part means adding one entry, not editing the core.

1. Type id, display name, and terminal count.
2. Stamp: how it contributes to the solver matrix, including any extra unknown it needs (a branch current for voltage sources and inductors).
3. Symbol: how it draws between its terminals, in ANSI and IEC styles, in four orientations.
4. Label and value formatting, including units.
5. Validity rules the generator must respect (for example, no loop made only of ideal voltage sources).
6. Optional: nonlinear linearization, so diodes and transistors can be solved by iteration later.

**Initial component set (v1):** resistor, independent voltage source, independent current source, ground, wire. **Reserved in the interface for later:** capacitor, inductor, dependent sources (all four types), ideal op amp, diode, switch, transformer.

## Circuit generation

The generator turns settings and a seed into a valid circuit with a clean layout, then hands it to the solver. Three generation strategies share one validity check and one filter.

**Seeded randomness.** All randomness comes from one seeded generator (for example mulberry32 or sfc32), never `Math.random()`. The same seed and settings must always produce the identical problem, on any device. This enables shareable links, bug reports ("seed 48213 is wrong"), worksheets (a list of seeds) and repeatable tests.

**Strategies**

| Strategy | How it works | Best for | Limit |
| --- | --- | --- | --- |
| Template slots | Hand-drawn topology with slots for component type, value and orientation | Bridges, ladders, op amp stages, filters, anything needing a specific look | Variety limited to the template library |
| Grid-based | Nodes on an m×n grid. Each grid edge randomly becomes a resistor, source, wire or nothing, subject to rules | Nodal and mesh problems with many loops | Tends toward ladder and mesh shapes. Needs rules against dangling parts |
| Recursive series/parallel | A block is one component, or a series or parallel combination of sub-blocks. Layout is a recursive measure-and-place pass | Equivalent resistance, dividers, Thevenin and Norton | Cannot produce non-series-parallel circuits such as bridges |

The v1 build uses grid-based generation as the main engine, recursive series/parallel for reduction and divider topics, and a small set of hand-made templates.

**Validity rules (hard rejects)**

- The circuit is connected, has exactly one ground, and has no floating nodes.
- Every source is in a closed loop. No loop consists only of ideal voltage sources. No cut set consists only of ideal current sources.
- No dangling single components and no components shorted by wires.
- At least one source is present, and the quantity being asked about is not trivially zero.
- Layout passes the quality check: sensible aspect ratio, no overlapping labels, no crossing wires without a clear non-junction.

**Nice numbers (soft filter)**

- Component values come from friendly sets by default: integers, or the E12 series. Advanced settings allow messy values.
- Generate, solve, then reject circuits whose answers are too ugly or extreme. Defaults: answers representable in 3 significant figures or fewer, no current below 0.1 mA or above 1 A, no voltage above 100 V.
- Where a topology allows it, work backward: choose target voltages and currents first, then derive resistor values, for clean answers on small circuits.
- If a generated circuit fails any check, silently re-roll with the next seed in the sequence. The student never sees a rejected circuit.

**Difficulty mapping.** Difficulty controls the number of nodes and loops, number of sources, whether supernodes or supermeshes are forced, and whether values are friendly or messy. The exact numbers per level are an open decision (see Open decisions).

## Solver

The solver uses modified nodal analysis (MNA) over complex numbers and produces the ground truth for every node voltage and branch current. No answer is ever hand-coded.

**Method**

1. Assign one unknown per non-ground node voltage, plus one extra unknown for each element that needs its current as a variable (voltage sources, inductors, op amp outputs, controlled-source references).
2. Each component stamps its contribution into a matrix equation **A·x = z**, using the stamp defined by its plugin entry.
3. Solve by Gaussian elimination with partial pivoting on complex numbers. Circuits at this scale are small, so a hand-written solver of roughly 30 to 60 lines is enough and avoids a dependency.
4. Derive every component's voltage, current and power from the solution and attach it to the circuit.

**Requirements**

- Complex arithmetic throughout. DC mode is frequency 0. AC mode uses one angular frequency per circuit (single-frequency steady state in v1 of AC).
- Detect and report singular or ill-conditioned matrices (condition number above a set threshold). The generator treats these as rejects.
- Supernodes and supermeshes are handled naturally by MNA. The solution layer explains them separately (see Solutions).
- Round-off is controlled: compare to tolerances, never exact equality.

**Nonlinear and dynamic extensions (not v1)**

- Diodes and transistors: Newton iteration. Linearize each device around the current estimate, re-stamp, re-solve, repeat until the change is below tolerance. The component interface already reserves the hook.
- Transients: first-order and second-order step responses solved analytically for time-domain answers, with the same circuit model supplying the parameters.
- Frequency response and Bode data: sweep the AC solve over a frequency range.

**Built-in self-checks.** After every solve, the solver verifies KCL at every node and power balance (total power supplied equals total power absorbed) within tolerance. A failed check marks the problem invalid and triggers a re-roll.

## Questions and answer checking

The question builder picks what to ask from the already-solved circuit, so the question text, the answer box and the expected answer always match the circuit that is drawn.

**Question types**

| Type | Student gives | Status |
| --- | --- | --- |
| Numeric | One number with units, for example "find I3" or "find V at node B" | v1 |
| Multiple choice | One of several options, with distractors built from plausible mistakes (sign flip, wrong resistor omitted) | v1 |
| Solve for a component | A value for an unknown R or source that satisfies a stated condition | Later |
| Complex answer | Magnitude and phase, or real and imaginary parts | With AC |
| Set up the equations | Equations for the circuit (optional practice mode, see below) | Optional, later |

**Answer box behavior**

- The label, unit and number of fields come from the question, for example "I3 (mA)" or "|V| and phase (°)".
- Accepts engineering prefixes and unit text: "2.5 mA", "0.0025 A", "2.5e-3" all match.
- Default tolerance is 1% relative, with a small absolute floor for answers near zero. Tolerance is a setting.
- Sign is graded. The diagram must therefore mark the assumed current directions and voltage polarities the question refers to, so a correct answer is never marked wrong by an ambiguous reference.
- Wrong-answer feedback goes beyond "incorrect": detect the common mistakes (sign flipped, off by a factor of 1000, forgot a parallel branch) by comparing to the answers those mistakes would produce, and say which one it looks like.

**Central formatting.** One module owns engineering notation, prefixes, significant figures and unit parsing. Labels, answers and solution text all go through it so formatting is consistent everywhere.

**Optional mode: set up the equations.** A practice mode where the student writes the KVL or KCL equations instead of a final number.

- Checking uses the known solution: substitute the true voltages and currents into the student's equation and see whether both sides match within tolerance. This accepts every algebraically equivalent form.
- For a system of N unknowns, require that the submitted equations are all satisfied by the true solution and are linearly independent (full-rank coefficient matrix).
- Coefficient extraction (evaluate with one variable set to 1 and the rest to 0) powers specific feedback such as "the R2 term has the wrong sign."
- Input must be beginner-friendly: a structured fill-in template with sign dropdowns and click-a-loop-on-the-diagram entry. Free-form typing is an advanced option.
- This mode is not in v1. The architecture must not block it.

## Diagrams

Diagrams are SVG drawn from the circuit model. SVG is resolution-independent, so "high resolution" is automatic and printing is crisp. The question diagram is a plain static figure. Interactivity exists only in the solution view.

**Symbol library**

- Each symbol is defined once, drawn between two terminal points, and rotates in 90° steps. Labels stay upright and readable after rotation.
- Symbols expose their terminals. The wire router connects terminal to terminal only, so symbols never know about wires.
- Standard: ANSI/IEEE (zigzag resistor) by default, IEC (rectangle) as a setting.
- v1 symbols: resistor, independent voltage source, independent current source, ground, junction dot. Reserved: dependent sources (diamond), capacitor, inductor, op amp with optional power pins, diode, transistor, transformer, switch.

**Professional-quality rules**

- One grid unit, one stroke width, one body length for all components.
- Junction dots only where three or more wires meet. A crossing without a dot reads as no connection.
- Labels combine name and value ("R₁ = 4.7 kΩ") with real subscripts, placed beside the component away from the circuit interior, with a collision check and fallback (shrink, move, or regenerate).
- Polarity marks (+ and −) on sources and on any voltage being asked about. Current arrows sit on the wire.
- Node labels (A, B, C) and an explicit ground symbol for nodal questions.
- The element the question is about is highlighted (colored outline), and any replaced part (Thevenin) is boxed with a dashed line.
- Layout checker rejects extreme aspect ratios, sparse layouts, and label overlaps. A rejected layout re-rolls the circuit.

**Question view versus solution view**

| | Question view | Solution view |
| --- | --- | --- |
| Source | Circuit model | Same circuit model |
| Layers | Base schematic, labels, polarity marks | Base layers plus highlight, annotation, animation layers |
| Interaction | None | Hover or tap a component for V, I, P and its equations. Step-driven highlights. Optional current-flow and voltage-shading overlays |

**Structure for interactivity.** Every component, wire segment and node gets an ID and data attribute. Layers are separate SVG groups so any layer can be toggled. Interactivity is event handlers and class toggles, with no redraw. Touch devices get a tap equivalent for every hover feature, and keyboard access for all of it.

**Output**

- Download as SVG and PNG.
- Print theme: black on white, driven by CSS variables. Light and dark themes share the same variables.
- Text is real SVG `<text>`. Fonts are embedded so subscripts, Ω and μ render identically in every browser.
- Scales to the container with a minimum readable text size on phones. On narrow screens the diagram sticks to the top while solution steps scroll beneath it.

## Solutions

Every problem shows every applicable solution method, each with a detailed explanation, so students see why different approaches agree. Methods are plugins, and each method's output is structured data, not prose.

**Method plugin interface**

1. `applies(circuit, question)`: whether this method can handle the circuit. Mesh needs a planar circuit. Series-parallel reduction needs a circuit that actually reduces. Nodal and superposition work on any linear circuit.
2. `solve(circuit, question)`: returns an ordered list of step objects.
3. `cost`: the number of equations or operations, used for the comparison section.

**Step object.** Each step carries the explanation text (a template filled from circuit data), the equation (rendered with KaTeX), the components and nodes involved, and any diagram changes. The same object drives the text, the highlights and the equation rendering, so the three cannot drift apart.

**Contents of every method**

1. Overview: the idea in one or two sentences, and when it is a good choice.
2. Setup: reference node or loop directions, labeled unknowns, with the diagram updated to show those choices.
3. Equations: written for this specific circuit, each term tied to its component.
4. Solving: algebra at a depth set by the difficulty setting (full elimination for beginners, "solving gives..." for advanced).
5. Back-substitution: getting the quantity actually asked for.
6. Sanity check: KCL at a node or power balance.

**Special cases get their own explanation steps.** Supernodes, supermeshes and dependent sources are where students get lost. Each is an explicit step, for example: "Because a voltage source connects these two nodes, we treat them as one supernode and add a constraint equation."

**Methods by milestone**

| Method | Phase |
| --- | --- |
| Nodal analysis | v1 |
| Mesh analysis | v1 |
| Series-parallel reduction (equivalent resistance, dividers) | v1 |
| Superposition | Next |
| Source transformation | Next |
| Thevenin and Norton | Next |
| Phasor and impedance methods | With AC |

**Comparison section.** After the individual solutions, a short generated section states which method is least work for this circuit, for example "Nodal needed 2 equations and mesh needed 3." It teaches the skill of choosing a method.

**Page layout**

- All applicable methods are always present. Each is a collapsible section. The first is open by default and the others collapsed, with an Expand all control. Open and closed state is remembered locally.
- The final answer and sanity check show at the top, above the methods.
- Solutions can be revealed progressively: step by step, tied to the hint system, so a student can peek at only the first step.

**Solution-view interactivity**

- Hover or tap a component: its V, I, P, and which equations it appears in.
- Trace a loop or node: the equation builds term by term, and each term lights up its component.
- Step through with next and back: the diagram reflects the current step (collapsed series and parallel combinations, Thevenin replacement, one source at a time for superposition).
- Optional overlays: animated current flow with density proportional to current, and wires shaded by node potential with a non-color cue for colorblind users.
- A "Why this sign?" toggle shows the assumed polarity and direction marks and explains how they produce each term's sign.

## Settings and customization

Settings define a problem's constraints. The settings object plus a seed fully determines the problem, so both go into the shareable link.

| Setting | Options | Phase |
| --- | --- | --- |
| Topic | Series-parallel reduction, KVL, KCL, nodal, mesh; later superposition, Thevenin and Norton, dividers, max power transfer | v1 covers the first five |
| Difficulty | Beginner, intermediate, advanced, mapped to circuit size, source count, supernode or supermesh forcing, value friendliness | v1 |
| Components allowed | Resistors, independent voltage sources, independent current sources; later capacitors, inductors, dependent sources, op amps, diodes, transistors | v1 has the first three |
| Question type | Numeric, multiple choice; later solve-for-component, equation setup | v1 has the first two |
| Value style | Friendly integers, E12 standard values, or unrestricted | v1 |
| Symbol standard | ANSI or IEC | v1 |
| Imaginary unit | j or i (AC only) | With AC |
| Answer format | Engineering notation or plain decimal, significant figures, tolerance | v1 |
| Solution depth | Full algebra or condensed | v1 |
| Seed | Auto-generated, or typed to reproduce a problem | v1 |

**Presets.** Named bundles of settings, for example "Exam 1 review" or "Mesh analysis drill," shareable by link. Teachers use these to assign a consistent practice set. A preset is a settings object encoded in the URL.

**Shareable links.** The URL encodes settings and seed, for example `?topic=nodal&diff=2&seed=48213`. Opening the link reproduces the exact problem, diagram and solutions.

**Worksheet export.** A worksheet is a preset plus a list of seeds. Export a print-friendly page of N problems with an answer key, using the print theme.

**Persistence.** With no backend, settings, streaks and history live in `localStorage`. Provide export and import of history as a file, since browser storage can be cleared.

**Settings UI.** Defaults give a working beginner problem with zero configuration. Advanced options sit behind an expandable panel. Every control works on a phone.

## v1 scope

v1 is the resistive DC core done to a high standard, with an architecture that does not block anything later. Launching small and trustworthy beats launching large with a few wrong answers.

**In v1**

- Resistive DC circuits with independent voltage and current sources.
- Topics: series-parallel reduction, KVL, KCL, nodal analysis, mesh analysis.
- Generation: grid-based engine, recursive series/parallel for reduction, and a few hand-made templates (including at least one bridge).
- Solver: complex-valued MNA, with self-checks on every problem.
- Question types: numeric and multiple choice, with unit-aware, tolerance-based answer checking and common-mistake feedback.
- Diagrams: ANSI symbols (IEC as a setting), polarity marks, node labels, ground, highlight of the target element, SVG and PNG download, print theme.
- Solutions: nodal, mesh and series-parallel reduction, each collapsible, with a comparison section, a sanity check and a "why this sign" explanation. Interactive hover or tap for component details in the solution view.
- Settings: topic, difficulty, components, value style, symbol standard, answer format, seed, presets, shareable links.
- Worksheet export with answer key.
- Accessibility, mobile layout, and a "report this problem" button that pre-fills a GitHub issue with the seed.
- Automated test suite and a gallery page (see Correctness and testing).

**Architected for, not built in v1**

The interfaces for these exist and are tested with a stub, but no user-facing feature ships.

- Capacitors, inductors, AC phasor analysis, complex answers.
- Dependent sources and ideal op amps.
- Superposition, source transformation, Thevenin and Norton as full solution methods.
- Set-the-equations practice mode.
- Transients, diodes and transistors, transformers, three-phase, two-port networks, filters and Bode plots.
- Streaks, timers and score tracking.
- Step-by-step animated current flow and voltage shading overlays (static solution highlights ship first).

**Definition of done for v1**

1. A seed sweep of at least 10,000 circuits per topic runs with zero solver failures and zero method disagreements.
2. A reviewer who is not the author has read a batch of at least 30 solutions and found no errors or confusing explanations.
3. Two to three real students have tried the site, and the confusion points they found are fixed.
4. The site passes an accessibility check (keyboard use, screen-reader labels, contrast) and works on a phone.

## Milestones

v1 is built in seven milestones. Each ends with something the owner can look at, and a gate that must pass before the next milestone starts.

| Milestone | Deliverable | Gate |
| --- | --- | --- |
| M1 Foundations | Repo, CI, circuit model, seeded RNG, formatter, complex MNA solver with self-checks | Solver matches 10 textbook circuits; CI is green |
| M2 Generator and gallery | Grid, series/parallel and template generators, SVG renderer, and the gallery page of random seeds | Gallery of 200 seeds judged good by eye by the owner |
| M3 One full question flow | Numeric question, answer box with units and tolerance, answer check, layout and nice-number filters | Sweep of 10,000 seeds passes; owner solves 5 problems |
| M4 Solutions | Nodal, mesh and reduction methods, collapsible sections, comparison section, sanity check, hints | Methods agree on 10,000 seeds; owner reads 20 solutions |
| M5 Product features | Settings, presets, shareable links, worksheet export, multiple choice, common-mistake feedback | Links and worksheets reproduce the same problems exactly |
| M6 Hardening | Accessibility, mobile layout, report-a-problem button, large seed sweeps, human review, student testing | Reviewer reads 30 solutions, students try it, accessibility check passes |
| M7 Public launch of v1 | License, About page, deploy to GitHub Pages, announce to students and teachers | Every v1 done criterion met (see v1 scope) |
| After v1 (not scheduled) | Superposition, Thevenin and Norton, AC and phasors, op amps, transients, equation-setup mode, nonlinear parts | Each gets a spec update first |

M1 to M7 are the numbers used under Open decisions. The thresholds in the gates (10 textbook circuits, 200 gallery seeds, 10,000-seed sweeps) are starting values to adjust once real runtimes are known.

**Rules for the milestones**

1. One milestone per Claude Code session or small group of sessions, built in small steps.
2. Every milestone adds its tests before it is called done, and CI stays green.
3. The owner reviews each deliverable directly: the gallery in M2, a solved problem in M3, sample solutions in M4, a phone walk-through in M5 and M6.
4. Scope changes are written into this spec and the decisions log before work on them starts.
5. Nothing from "After v1" is built early, but the interfaces it needs must not be blocked.

## Correctness and testing

Correctness is the product. One wrong answer key destroys trust, so correctness is enforced by automated checks that run on every generated problem and again in CI, not by review alone.

**Runtime invariants (every problem, silently re-rolled on failure)**

1. The matrix is non-singular and well-conditioned.
2. KCL holds at every node within tolerance.
3. Power supplied equals power absorbed within tolerance.
4. Every applicable solution method reaches the same answer as the MNA solver.
5. The layout checker passes (aspect ratio, label overlap, no ambiguous crossings).
6. The answer passes the nice-number filter.

**Test layers**

| Layer | What it proves | Cadence |
| --- | --- | --- |
| Unit tests | Solver, formatter, unit parser, RNG determinism, each component stamp | Every change |
| Textbook fixtures | Solver and each method reproduce known worked examples with published answers | Every change |
| Seed sweep | Thousands of seeds per topic and difficulty satisfy all runtime invariants | Every change in CI, larger sweep nightly |
| Method agreement | Every method's final answer equals the solver's, for every sweep seed | Every change in CI |
| Answer-checker tests | Equivalent answer forms are accepted ("2.5 mA", "0.0025 A"), wrong ones rejected | Every change |
| Visual gallery | A page that draws hundreds of seeds at once, reviewed by eye for diagram quality | Per milestone, by the owner |
| Snapshot tests | SVG output for pinned seeds does not change unexpectedly | Every change |

**Determinism.** The same seed and settings must produce byte-identical output across browsers and runs. A test pins a list of seeds and compares their serialized problems.

**Bug reports.** The "report this problem" button pre-fills a GitHub issue with seed, settings and site version. A maintainer can reproduce any report instantly, and every confirmed bug becomes a permanent regression test.

**Human review is still required.** Tests prove the math is right, not that an explanation is good. Before launch, a teacher, TA or current student reads a batch of solutions and the owner watches a few students use the site.

**CI.** GitHub Actions runs type checks, unit tests, the seed sweep and the method-agreement test on every push and pull request. A failing check blocks the deploy to GitHub Pages.

## Education, accessibility and public-facing requirements

Other people will study from this site, so pedagogy, accessibility and basic public hygiene are requirements, not polish.

**Pedagogical decisions (to settle before building the explanation templates)**

- One sign convention (passive sign convention) applied everywhere and explained once, prominently, with a short "how to read this diagram" legend always within reach.
- One notation set: current and voltage symbols, subscript style, `j` versus `i`. The default is chosen in Open decisions and is a setting where the choice varies by textbook.
- Algebra depth: enough for a beginner to follow each step, collapsible for advanced users. The solution-depth setting controls it.
- Explanations are templates with slots filled from circuit data, authored and reviewed by a human, since they are the part students read.
- Hints unlock progressively and reuse the solution step data, so a hint is always the first part of a real solution.

**Accessibility**

- Full keyboard operation for settings, answer entry and solution controls.
- Every circuit has a generated text description (components, values, connections) available to screen readers and also shown on request. The same description helps sighted students check their reading of the diagram.
- Colors meet contrast requirements. Meaning is never carried by color alone: overlays add labels or patterns.
- Respect reduced-motion preferences. Animated current flow is off when the user prefers reduced motion.
- Targets: WCAG 2.2 AA.

**Mobile**

- Layouts work at phone width. The answer input uses the right on-screen keyboard and accepts unit suffixes easily.
- The diagram sticks to the top while the solution scrolls.

**Public-facing basics**

- Open-source license chosen before the first public release, with credits and an About page.
- No analytics or tracking by default. If usage statistics are ever added, use a privacy-respecting tool and say so on the site.
- A visible "report this problem" control on every problem.
- A plain-language page describing what the site does, how answers are checked, and its known limits.

## Stack, repo and working with Claude Code

The site is a static TypeScript app, built with Claude Code and verified by automated tests. The owner's job is specification, taste and review, not reading every line of code.

**Stack**

| Concern | Choice | Reason |
| --- | --- | --- |
| Language | TypeScript, strict mode | The type checker catches a class of mistakes automatically |
| Build | Vite | Fast, simple, works with GitHub Pages |
| Tests | Vitest, plus a seed-sweep script | Same toolchain as the app |
| Diagrams | Hand-written SVG symbols and renderer | Full control, resolution-independent, prints cleanly |
| Equations | KaTeX | Fast math rendering in the solutions |
| Linear algebra | Own small complex Gaussian elimination | Tiny, no dependency |
| UI | A small component approach (see Open decisions) | Keep the bundle light for phones |
| Hosting | GitHub Pages, deployed by GitHub Actions | Free and static |
| Storage | `localStorage` with file export and import | No backend |

**Proposed source layout**

- `src/core`: circuit model, component registry, seeded RNG, unit and number formatter.
- `src/solver`: complex MNA solver and self-checks.
- `src/generate`: grid, series/parallel and template generators, validity rules, filters.
- `src/layout`: layout checks and label placement.
- `src/render`: SVG symbols, schematic renderer, layers, export.
- `src/questions`: question builders, answer checking, mistake detection.
- `src/methods`: one folder per solution method.
- `src/ui`: settings, problem page, solution page, worksheet export.
- `tests/`, `scripts/` (seed sweep, gallery), and `docs/`.

**Rules for the repo (go into `CLAUDE.md`)**

1. Never use `Math.random()`. All randomness goes through the seeded RNG.
2. No answer is hand-coded. Every answer derives from the solver.
3. All number formatting and unit parsing goes through the one formatter module.
4. A new component, method or question type is a plugin entry, not a core edit.
5. Every change runs type check, unit tests and the seed sweep before it is called done.
6. Work only on the current milestone. Do not add features from later milestones.
7. Every confirmed bug gets a regression test with its seed.

**Working process**

- Put this spec in the repo as `SPEC.md`. Keep a short `CLAUDE.md` with the rules above and a pointer to the spec, so each new session starts with the same context.
- Build one milestone per session, in small steps. Each milestone ends with something the owner can look at and judge.
- Ask for tests at every milestone and keep them running in CI.
- Keep a decisions log in the repo. When an open decision below is settled, record it there and update this spec.
- The owner reviews the gallery page, reads sample solutions for clarity, and tries the site on a phone at each milestone.

## Open decisions

These are unsettled. Each has a recommended default so work can continue, and a milestone by which it must be decided (M1 to M7 are defined under Milestones). Settled decisions move to the repo's decisions log.

| # | Decision | Options | Recommended default | Decide by |
| --- | --- | --- | --- | --- |
| 1 | Imaginary unit and current notation | `j` and `I` (engineering) or `i` | `j` for AC, setting to switch | M4 |
| 2 | Reference textbook and sign convention | Passive sign convention, or match a specific course textbook | Passive sign convention, stated once on the site | M2 |
| 3 | Difficulty level definitions | See proposal below | Three levels, proposal below | M2 |
| 4 | Default symbol standard | ANSI or IEC | ANSI default, IEC as setting | M2 |
| 5 | UI approach | Plain TypeScript, Preact, or Svelte | Preact, for small size and simple components | M1 |
| 6 | Default answer tolerance | 0.5%, 1%, 2% | 1% relative with a small absolute floor | M3 |
| 7 | May a question require a specific method | Always "find X", or sometimes "use mesh analysis" | Always "find X" in v1. Method-required questions later | M3 |
| 8 | Ground placement in nodal problems | Random node, or consistent bottom rail | Bottom rail where the layout allows | M2 |
| 9 | License | MIT, Apache 2.0, or a Creative Commons license for content | MIT for code, CC BY for explanation text | M6 |
| 10 | Site name, repo name and URL | Not chosen | Choose before M7 | M7 |
| 11 | Who reviews solutions and tests with students | Not chosen | One teacher or TA, and 2 to 3 students | M6 |
| 12 | Language | English only, or translation-ready strings | English only, with strings kept in one place | M1 |

**Proposal for decision 3: difficulty levels**

| Level | Sources | Resistors | Independent loops | Values | Forced special cases |
| --- | --- | --- | --- | --- | --- |
| Beginner | 1 | 3 to 4 | 1 to 2 | Friendly integers | None |
| Intermediate | 2 | 5 to 7 | 2 to 3 | E12 values | Occasional supermesh or supernode |
| Advanced | 2 to 3, including a current source | 7 to 10 | 3 to 4 | E12 or messy | Supernodes, supermeshes and bridges allowed |

These numbers are a starting point to tune by looking at the gallery, not a final spec.

**Smaller questions to revisit during the build**

- How much mistake detection is worth building for v1, beyond sign flip and factor-of-1000 errors.
- Whether to include timers, streaks and score tracking in a later version, and how to keep them from discouraging beginners.
- The export format for saved history (JSON file is the default assumption).
- When AC support starts and which of its topics come first (phasors and impedance are assumed first, then op amps).
