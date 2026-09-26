import test from "node:test";
import assert from "node:assert/strict";
import { clipRayToSectionBox } from "../dist/viewer-picking.js";

const box = { minX: 2, maxX: 8, minY: -1, maxY: 1, minZ: -1, maxZ: 1 };
const ray = (origin, direction, length = 100) => ({ origin, direction, length });
const alongX = (x, direction = 1, length = 100) => ray({ x, y: 0, z: 0 }, { x: direction, y: 0, z: 0 }, length);
const end = segment => Object.fromEntries(["x", "y", "z"].map(axis => [axis, segment.origin[axis] + segment.direction[axis] * segment.length]));
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} differs from ${expected}`);

test("ray segment excludes clipped foreground and background, retaining visible surfaces", () => {
  const clipped = clipRayToSectionBox(alongX(0), box);
  assert.deepEqual(clipped, { origin: { x: 2, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 }, length: 6, entryDistance: 2 });
  const surfaces = [1, 4, 9];
  const eligible = surfaces.filter(x => x >= clipped.origin.x && x <= end(clipped).x);
  assert.deepEqual(eligible, [4]);
});

test("negative direction clips from the opposite face", () => {
  const clipped = clipRayToSectionBox(alongX(10, -1), box);
  assert.equal(clipped.entryDistance, 2);
  assert.deepEqual(clipped.origin, { x: 8, y: 0, z: 0 });
  assert.deepEqual(end(clipped), { x: 2, y: 0, z: 0 });
});

test("rays starting inside preserve their origin and stop at the exit face", () => {
  const clipped = clipRayToSectionBox(alongX(5), box);
  assert.equal(clipped.entryDistance, 0);
  assert.equal(clipped.origin.x, 5);
  assert.equal(clipped.length, 3);
});

test("parallel rays on a boundary remain eligible but outside rays miss", () => {
  const onFace = ray({ x: 0, y: 1, z: 0 }, { x: 1, y: 0, z: 0 });
  assert.equal(clipRayToSectionBox(onFace, box).length, 6);
  assert.equal(clipRayToSectionBox({ ...onFace, origin: { x: 0, y: 1 + Number.EPSILON, z: 0 } }, box), null);
  assert.equal(clipRayToSectionBox(ray({ x: 9, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }), box), null);
});

test("camera rays pointing away or whose intervals miss the box are rejected", () => {
  assert.equal(clipRayToSectionBox(alongX(0, -1), box), null);
  assert.equal(clipRayToSectionBox(ray({ x: 0, y: 2, z: 0 }, { x: 1, y: 1, z: 0 }), box), null);
});

test("finite ray length is honored before and within the section", () => {
  assert.equal(clipRayToSectionBox(alongX(0, 1, 1), box), null);
  assert.equal(clipRayToSectionBox(alongX(0, 1, 5), box).length, 3);
  assert.equal(clipRayToSectionBox(alongX(5, 1, 1), box).length, 1);
});

test("face contact and zero-length input include only the contact point", () => {
  for (const input of [alongX(0, 1, 2), alongX(2, -1), alongX(8, 1), alongX(5, 1, 0)]) {
    assert.equal(clipRayToSectionBox(input, box).length, 0);
  }
  assert.equal(clipRayToSectionBox(alongX(1, 1, 0), box), null);
});

test("all three axes and a diagonal ray use the most restrictive slabs", () => {
  const cube = { minX: -1, maxX: 1, minY: -1, maxY: 1, minZ: -1, maxZ: 1 };
  for (const axis of ["x", "y", "z"]) {
    const origin = { x: 0, y: 0, z: 0 }, direction = { x: 0, y: 0, z: 0 };
    origin[axis] = -2; direction[axis] = 1;
    const clipped = clipRayToSectionBox(ray(origin, direction), cube);
    assert.equal(clipped.origin[axis], -1);
    assert.equal(clipped.length, 2);
  }
  const diagonal = clipRayToSectionBox(ray({ x: -2, y: -2, z: -2 }, { x: 1, y: 1, z: 1 }), cube);
  close(diagonal.entryDistance, Math.sqrt(3));
  close(diagonal.length, 2 * Math.sqrt(3));
  for (const value of Object.values(end(diagonal))) close(value, 1);
});

test("normalization preserves the extent of a non-unit input ray", () => {
  const clipped = clipRayToSectionBox(alongX(0, 2, 3), box);
  assert.equal(clipped.direction.x, 1);
  assert.equal(clipped.length, 4);
  assert.equal(end(clipped).x, 6);
});

test("tiny nonzero direction components are not treated as parallel", () => {
  const narrowBox = { minX: 2e-14, maxX: 8e-14, minY: 0, maxY: 10, minZ: -1, maxZ: 1 };
  const clipped = clipRayToSectionBox(ray({ x: 0, y: 0, z: 0 }, { x: 1e-14, y: 1, z: 0 }), narrowBox);
  close(clipped.entryDistance, 2);
  close(clipped.length, 6);
});

test("unbounded rays and flat section boxes have finite valid results", () => {
  const infinite = alongX(0); infinite.length = Infinity;
  assert.equal(clipRayToSectionBox(infinite, box).length, 6);
  delete infinite.length;
  assert.equal(clipRayToSectionBox(infinite, box).length, 6);
  assert.equal(clipRayToSectionBox(alongX(0), { ...box, maxX: 2 }).length, 0);
});

test("invalid values fail closed and valid inputs are not mutated", () => {
  const input = alongX(0), snapshot = structuredClone(input), bounds = { ...box };
  clipRayToSectionBox(input, bounds);
  assert.deepEqual(input, snapshot); assert.deepEqual(bounds, box);
  for (const invalid of [null, {}, alongX(NaN), alongX(0, 0), alongX(0, Infinity), alongX(0, 1, -1), alongX(0, 1, NaN)]) {
    assert.equal(clipRayToSectionBox(invalid, box), null);
  }
  for (const invalid of [null, {}, { ...box, minX: 10 }, { ...box, maxY: Infinity }]) {
    assert.equal(clipRayToSectionBox(input, invalid), null);
  }
});
