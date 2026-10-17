import { describe, expect, it } from 'vitest';
import { circuitBuilder } from '../src/core/circuit';
import { complex } from '../src/core/complex';
import { defaultRegistry } from '../src/core/components';
import { analyzeTopology, letterLabel } from '../src/core/topology';

describe('electrical nodes (wire merge)', () => {
  it('three wire-joined points are one electrical node', () => {
    const b = circuitBuilder(defaultRegistry);
    const g = b.node({ ground: true });
    const p1 = b.node();
    const p2 = b.node();
    const p3 = b.node();
    b.add('vsource', [p1, g], { voltage: complex(5) });
    b.add('wire', [p1, p2]);
    b.add('wire', [p2, p3]);
    b.add('resistor', [p3, g], { resistance: 10 });
    const t = analyzeTopology(b.build(), defaultRegistry);
    expect(t.electricalNodes).toEqual([
      { id: 'e:n0', label: '0', members: ['n0'], isGround: true },
      { id: 'e:n1', label: 'A', members: ['n1', 'n2', 'n3'], isGround: false },
    ]);
    expect(t.nodeOf.get('n3')).toBe('e:n1');
    expect(t.wires).toEqual(['c1', 'c2']);
    expect(t.redundantWires).toEqual([]);
    expect(t.shortedComponents).toEqual([]);
  });

  it('labels: ground is "0", others A, B, C in circuit order, whatever order wires join them', () => {
    const b = circuitBuilder(defaultRegistry);
    const p0 = b.node();
    const p1 = b.node();
    const g = b.node({ ground: true });
    const p3 = b.node();
    const p4 = b.node();
    b.add('wire', [p4, p0]); // joins the last point to the first
    b.add('isource', [g, p0], { current: complex(1) });
    b.add('resistor', [p0, p1], { resistance: 1 });
    b.add('resistor', [p1, p3], { resistance: 1 });
    b.add('resistor', [p3, g], { resistance: 1 });
    const t = analyzeTopology(b.build(), defaultRegistry);
    expect(t.electricalNodes.map((n) => [n.id, n.label, n.members])).toEqual([
      ['e:n0', 'A', ['n0', 'n4']],
      ['e:n1', 'B', ['n1']],
      ['e:n2', '0', ['n2']],
      ['e:n3', 'C', ['n3']],
    ]);
  });

  it('a wire on the ground point merges into ground', () => {
    const b = circuitBuilder(defaultRegistry);
    const g = b.node({ ground: true });
    const p1 = b.node();
    const p2 = b.node();
    b.add('wire', [p2, g]);
    b.add('isource', [p1, p2], { current: complex(1) });
    b.add('resistor', [p1, g], { resistance: 1 });
    const t = analyzeTopology(b.build(), defaultRegistry);
    expect(t.electricalNodes.map((n) => [n.label, n.members])).toEqual([['0', ['n0', 'n2']], ['A', ['n1']]]);
  });

  it('reports a wire that closes a loop of wires, and a part shorted by a wire', () => {
    const b = circuitBuilder(defaultRegistry);
    const g = b.node({ ground: true });
    const p1 = b.node();
    const p2 = b.node();
    b.add('vsource', [p1, g], { voltage: complex(1) });
    b.add('wire', [p1, p2]);
    b.add('wire', [p2, p1]);
    b.add('resistor', [p1, p2], { resistance: 1 });
    const t = analyzeTopology(b.build(), defaultRegistry);
    expect(t.redundantWires).toEqual(['c2']);
    expect(t.shortedComponents).toEqual(['c3']);
  });

  it('wires do not count toward equations: nodal unknowns = non-ground electrical nodes', () => {
    const b = circuitBuilder(defaultRegistry);
    const g = b.node({ ground: true });
    const ps = [b.node(), b.node(), b.node(), b.node()];
    b.add('vsource', [ps[0]!, g], { voltage: complex(1) });
    b.add('wire', [ps[0]!, ps[1]!]);
    b.add('resistor', [ps[1]!, ps[2]!], { resistance: 1 });
    b.add('wire', [ps[2]!, ps[3]!]);
    b.add('resistor', [ps[3]!, g], { resistance: 1 });
    const t = analyzeTopology(b.build(), defaultRegistry);
    expect(t.electricalNodes.filter((n) => !n.isGround)).toHaveLength(2);
  });
});

describe('letterLabel', () => {
  it('runs A..Z then AA, AB, ...', () => {
    expect([0, 1, 25, 26, 27, 51, 52, 701, 702].map(letterLabel)).toEqual(
      ['A', 'B', 'Z', 'AA', 'AB', 'AZ', 'BA', 'ZZ', 'AAA'],
    );
  });
});
