import { describe, expect, it } from 'vitest';
import { hexKey, ORIGIN } from '../hex/coords';
import { makeRoomGraph } from '../rooms/graph';
import { makeRoom } from '../rooms/room';

const A = makeRoom('A', [ORIGIN, { q: 1, r: 0 }, { q: -1, r: 0 }], [{ q: 1, r: 0 }, { q: -1, r: 0 }]);
const B = makeRoom('B', [ORIGIN]);
const C = makeRoom('C', [ORIGIN]);

describe('makeRoomGraph', () => {
  it('routes an exit to its destination room index', () => {
    const graph = makeRoomGraph([A, B, C], [{ from: 0, exit: { q: 1, r: 0 }, to: 1 }]);
    expect(graph.get(0)?.get(hexKey({ q: 1, r: 0 }))).toBe(1);
  });

  it('lets two different exits of the same room route to two different rooms', () => {
    const graph = makeRoomGraph(
      [A, B, C],
      [
        { from: 0, exit: { q: 1, r: 0 }, to: 1 },
        { from: 0, exit: { q: -1, r: 0 }, to: 2 },
      ],
    );
    expect(graph.get(0)?.get(hexKey({ q: 1, r: 0 }))).toBe(1);
    expect(graph.get(0)?.get(hexKey({ q: -1, r: 0 }))).toBe(2);
  });

  it('a room with no declared edges has no routes', () => {
    const graph = makeRoomGraph([A, B, C], []);
    expect(graph.get(0)).toBeUndefined();
  });

  it('throws when an edge names a room index that does not exist', () => {
    expect(() => makeRoomGraph([A, B], [{ from: 0, exit: { q: 1, r: 0 }, to: 5 }])).toThrow();
    expect(() => makeRoomGraph([A, B], [{ from: 5, exit: { q: 1, r: 0 }, to: 0 }])).toThrow();
  });

  it('throws when an edge names a hex that is not one of the source room\'s own exits', () => {
    expect(() => makeRoomGraph([A, B], [{ from: 0, exit: ORIGIN, to: 1 }])).toThrow();
  });

  it('throws when the same exit is routed twice', () => {
    expect(() =>
      makeRoomGraph(
        [A, B, C],
        [
          { from: 0, exit: { q: 1, r: 0 }, to: 1 },
          { from: 0, exit: { q: 1, r: 0 }, to: 2 },
        ],
      ),
    ).toThrow();
  });
});
