# Decisions log

Settled decisions. Each entry says what was decided, when, and which spec section it affects. SPEC.md should be updated to match.

## 2026-10-17 (M1 session)

### D1. UI approach: Preact (spec Open decision 5)
Preact, with JSX compiled by Vite's built-in transform (no extra Vite plugin).

### D2. Language: English only, strings in one place (spec Open decision 12)
All user-facing strings live in `src/ui/strings.ts`.

### D3. Stack
TypeScript (strict, plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`), Vite, Vitest. Node 24 pinned in `.nvmrc`, `package.json` engines and CI. Exact dependency versions, `package-lock.json` committed, `npm ci` in CI. `@types/node` is a dev dependency only, so tests can read source files (rules test).

### D4. Repository and deploy
Private GitHub repo `circuit-practice` (working name, spec Open decision 10 still open). Vite builds with relative paths (`base: './'`), so a rename is safe. CI (type check and all tests, including the rules test) runs on every push and pull request. The Pages deploy workflow runs **only by manual trigger until M7**, and it runs the same checks first, so a failing check blocks the deploy. The seed sweep joins CI when the generator exists (M2).

### D5. Fixture answers
Textbook fixtures are named by the classic configuration they represent, not by a textbook example. Each expected answer is derived independently of the MNA solver, as exact fractions, by a different method (series-parallel reduction, divider formulas, or Kirchhoff equations solved with exact rationals). No textbook example, page or number is cited from memory.

### D6. Component symbols (spec "Component plugin interface", item 3)
A component entry has an optional, data-only `symbol` field (drawing primitives and terminal anchor points on a unit grid). It holds no drawing code, so `core` still depends on nothing. Empty in M1, filled in M2.

### D7. Wires
In the solver a wire is a 0 V voltage source, so every wire has a current. A loop made only of wires (or wires and voltage sources) is singular and rejected. Separately, `core` provides a function that collapses wire-joined nodes into **electrical nodes**. Nodal and mesh methods and node labels use electrical nodes only, and wires do not count toward equation counts.

### D8. Ground
The node's `isGround` flag is the source of truth. Exactly one ground node per circuit. The ground component has one terminal, stamps nothing, and must sit on the ground node.

### D9. Power sign convention
`P` is power **absorbed**: P = V × conj(I) under the passive sign convention (V = V(a) − V(b), I positive from a to b through the component). A source that supplies power has negative P. At DC this is ordinary V × I. Whether AC phasors are peak or RMS (which changes a factor of 1/2) is deferred to the AC milestone.

### D10. Self-check tolerances and conditioning
- KCL and power balance pass when the residual is at most 1e-9 relative to the largest current (or power) magnitude in the circuit.
- KCL and power balance are computed from each component's own relation (V/R, source values, wire currents from the solver), not from the matrix residual.
- A matrix whose condition number is above 1e12 is rejected as ill-conditioned.
- These are starting values and can be tuned.

### D11. Determinism across browsers
The solver and formatter avoid engine-dependent math functions (`Math.pow`, `Math.log10`, `Math.hypot`) and use only + − × ÷ and `Math.sqrt`, which IEEE 754 requires to be correctly rounded. A rules test enforces this, and also forbids `Math.random` anywhere and `toFixed`, `toPrecision` and `Intl.NumberFormat` outside `src/core/format.ts`.

### D12. Value representation
Source values are complex phasors. A resistance is a positive real number; its impedance is computed as complex. There is one complex code path; DC is frequency 0.

### D13. Unit parser
Strict SI case (m is milli, M is mega), with k and K both accepted for kilo. u, µ and μ all mean micro. Accepts the Unicode minus sign (−) as well as the hyphen, "ohm", "ohms" and both omega signs (Ω U+03A9, Ω U+2126), and no space between number and unit ("2.5mA"). No thousands separators.

Additions made while building the parser (Step 4), open to veto:
- Single-letter unit symbols are also accepted in lower case ("5v", "2.5ma", "3 w"), since no supported prefix uses those letters. Spelled-out units ("volts", "amps", "watts", "ohms") are accepted in any case.
- A prefix and its unit must be adjacent ("5 mA", not "5 m A").
- A missing unit is accepted by the parser; whether a question requires units is a question-builder decision (M3).

### D14. Number display
- Default 3 significant figures, engineering prefixes from f (10⁻¹⁵) to T (10¹²). Outside that range: engineering exponent text such as "100e-18 A".
- Trailing zeros are kept by default ("4.70 kΩ") to show significant figures; component labels can trim them ("4.7 kΩ").
- Plain decimal style is available ("0.00250 A").
- Rounding is round-half-up on the exact binary value (ECMAScript `toExponential` rule).
- Display uses the Unicode minus sign (−), Greek mu (μ, U+03BC), Greek capital omega (Ω, U+03A9), and a no-break space between number and unit so a value never wraps across lines.
- Serialized numbers use `canonicalNumber` (shortest round-trip text, −0 becomes 0).

### D15. Node labels (changes the spec's data model table)
Raw connection points carry no label: a point is `{ id, isGround }`. Labels belong to **electrical nodes** (points joined by wires, decision D7) and are assigned in `src/core/topology.ts`, deterministically from circuit order: the ground node is "0", the others are A, B, C, ... in order of each node's first point in the circuit (after Z: AA, AB, ...). Layout does not assign labels. **Spec update needed:** in "Circuit data model", Node becomes `id, isGround`, and the label moves to the electrical node.

### D16. Component plugin interface details (spec "Component plugin interface")
- **Current control by any part.** A part may expose `branchCurrent(ctx)`: its a → b current as a linear combination of solver unknowns (resistor (Va − Vb)/R, voltage source and wire their extra unknown, current source a constant). Current-controlled sources read it through `StampContext.currentOf(id)`, so they can be controlled by any part that has a single branch current, including a resistor. A control reference to a part without one (ground, op amp) is a validation error.
- **Independent self-checks.** After the solve each part reports its terminal currents from its own relation (`terminalCurrents`) and any constraint residuals (`constraintResiduals`), never from the matrix.
- **Roles.** `ElectricalRole` has a sixth value, `multiport`, for parts such as the op amp and transformer whose validity rules the part supplies itself.
- **Ids and names.** Points are `n0, n1, ...` and parts `c0, c1, ...` in the order added to one builder; names use per-prefix counters owned by that builder (R1, R2, ...). Built circuits are deep-frozen.
- **Reserved parts** (capacitor, inductor, four dependent sources, op amp, diode, switch, transformer) are registered with `status: 'reserved'`; a circuit using one fails validation.

### D17. What the self-checks catch beyond the condition number (finding, Step 6)
The 1-norm condition number of the MNA matrix does not detect every untrustworthy answer. Example: a 1 µΩ resistor in series with 1 GΩ gives a condition number of only about 4e6, but the tiny resistor's current from its own V/R subtracts two voltages that agree to 15 digits, and the independent KCL check fails by 4.6%. Such circuits are rejected (as `kcl-failed`), which is the intended behavior. Measured margins at the default 1e-9 tolerance: a 1 Ω / 1 MΩ divider passes with a KCL residual of 8e-11; a 1 µΩ / 1 kΩ divider (ratio 1e9) fails at 8e-8. Practical consequence for the generator (M2): resistor values within one circuit should stay within a ratio of about 1e6, which friendly and E12 value sets already do.

### D18. Meaning of "near the ill-conditioned limit" for fixtures (2026-10-18, owner accepted reviewer recommendation)
Realistic resistor values never bring the MNA condition number close to the 1e12 rejection threshold, and the condition number is not the real accuracy risk (D17). So:
- The wide-ratio fixture (10 Ω with 4.7 MΩ, condition number 37) stays as an accuracy test at microamp and microvolt scale. It is not a test of the rejection limit.
- The trusted-range boundary is covered by the Step 6 solver tests in `tests/solver.test.ts`: a 1 Ω / 1 MΩ divider passes; a 1 µΩ / 1 GΩ divider is rejected by the KCL self-check; a 1 pΩ / 1 Ω divider is rejected as ill-conditioned.
