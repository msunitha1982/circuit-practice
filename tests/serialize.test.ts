import { describe, expect, it } from 'vitest';
import { CircuitValidationError, circuitBuilder } from '../src/core/circuit';
import { complex } from '../src/core/complex';
import { defaultRegistry } from '../src/core/components';
import { CircuitParseError, canonicalize, parseCircuit, serializeCircuit } from '../src/core/serialize';

function sample() {
  const b = circuitBuilder(defaultRegistry);
  const g = b.node({ ground: true });
  const n1 = b.node();
  b.add('vsource', [n1, g], { voltage: complex(12) });
  b.add('resistor', [n1, g], { resistance: 4700 });
  b.add('isource', [g, n1], { current: complex(0.001, -0.5) });
  return b.build();
}

describe('canonicalize', () => {
  it('sorts keys, uses shortest numbers, no whitespace', () => {
    expect(canonicalize({ b: 1, a: [0.1, -0, true, null, 'x"y'], c: { z: 1e-7, y: 1 / 3 } })).toBe(
      '{"a":[0.1,0,true,null,"x\\"y"],"b":1,"c":{"y":0.3333333333333333,"z":1e-7}}',
    );
  });
  it('treats a Map like an object with sorted keys', () => {
    expect(canonicalize(new Map([['b', 2], ['a', 1]]))).toBe('{"a":1,"b":2}');
  });
  it('key order of the input does not matter', () => {
    expect(canonicalize({ x: 1, y: { p: 1, q: 2 } })).toBe(canonicalize({ y: { q: 2, p: 1 }, x: 1 }));
  });
  it('refuses non-finite numbers', () => {
    expect(() => canonicalize({ a: Number.NaN })).toThrow(RangeError);
  });
});

describe('circuit serialization', () => {
  it('is pinned for a fixed circuit', () => {
    expect(serializeCircuit(sample())).toBe(
      '{"components":[' +
        '{"id":"c0","name":"V1","params":{"voltage":{"im":0,"re":12}},"terminals":["n1","n0"],"type":"vsource"},' +
        '{"id":"c1","name":"R1","params":{"resistance":4700},"terminals":["n1","n0"],"type":"resistor"},' +
        '{"id":"c2","name":"I1","params":{"current":{"im":-0.5,"re":0.001}},"terminals":["n0","n1"],"type":"isource"}],' +
        '"format":"circuit/1",' +
        '"nodes":[{"id":"n0","isGround":true},{"id":"n1","isGround":false}],' +
        '"omega":0}',
    );
  });

  it('round-trips: parse(serialize(c)) equals c and serializes to the same text', () => {
    const c = sample();
    const text = serializeCircuit(c);
    const back = parseCircuit(text, defaultRegistry);
    expect(back).toEqual(c);
    expect(serializeCircuit(back)).toBe(text);
    expect(Object.isFrozen(back.components[0]?.params)).toBe(true);
  });

  it('rejects malformed text and invalid circuits', () => {
    expect(() => parseCircuit('not json', defaultRegistry)).toThrow(CircuitParseError);
    expect(() => parseCircuit('{"format":"circuit/9"}', defaultRegistry)).toThrow(CircuitParseError);
    expect(() => parseCircuit('{"format":"circuit/1","omega":0,"nodes":[{"id":1}],"components":[]}', defaultRegistry))
      .toThrow(CircuitParseError);
    const noGround = serializeCircuit(sample()).replace('"isGround":true', '"isGround":false');
    expect(() => parseCircuit(noGround, defaultRegistry)).toThrow(CircuitValidationError);
  });
});
