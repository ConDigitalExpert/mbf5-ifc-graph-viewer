const AXES = ["x", "y", "z"];

/**
 * Restrict a picking ray to the visible part of a world-space section box.
 * Accepts plain {origin, direction, length?} vectors and flat minX/maxX bounds.
 * Returns a new, normalized ray segment or null. No input objects are changed.
 *
 * The input represents origin + t * direction, 0 <= t <= length (Babylon's
 * parameterization). Output length and entryDistance are world distances.
 * Boundaries are inclusive, matching clip shaders which discard only > 0.
 * No epsilon expands the box: that would make clipped geometry selectable.
 */
export function clipRayToSectionBox(ray, bounds) {
  if (!ray?.origin || !ray.direction || !bounds) return null;
  if (!AXES.every(axis => Number.isFinite(ray.origin[axis]) && Number.isFinite(ray.direction[axis]))) return null;
  if (!AXES.every(axis => {
    const upper = axis.toUpperCase();
    return Number.isFinite(bounds[`min${upper}`]) && Number.isFinite(bounds[`max${upper}`])
      && bounds[`min${upper}`] <= bounds[`max${upper}`];
  })) return null;

  const inputLength = ray.length === undefined ? Number.MAX_VALUE : ray.length;
  if (!(Number.isFinite(inputLength) || inputLength === Infinity) || inputLength < 0) return null;
  const magnitude = Math.hypot(ray.direction.x, ray.direction.y, ray.direction.z);
  if (!Number.isFinite(magnitude) || magnitude === 0) return null;
  const direction = Object.fromEntries(AXES.map(axis => [axis, ray.direction[axis] / magnitude]));
  let enter = 0;
  let exit = inputLength * magnitude;

  for (const axis of AXES) {
    const upper = axis.toUpperCase();
    const min = bounds[`min${upper}`], max = bounds[`max${upper}`];
    const origin = ray.origin[axis], velocity = direction[axis];
    // Only exactly parallel rays use this branch. Tiny nonzero directions can
    // still reach a slab and must not be rounded to zero by a fixed epsilon.
    if (velocity === 0) {
      if (origin < min || origin > max) return null;
      continue;
    }
    const first = (min - origin) / velocity;
    const last = (max - origin) / velocity;
    enter = Math.max(enter, Math.min(first, last));
    exit = Math.min(exit, Math.max(first, last));
    if (enter > exit) return null;
  }

  if (!Number.isFinite(enter) || !Number.isFinite(exit)) return null;
  // Clamp only arithmetic roundoff at the entry boundary, without extending
  // the interval or shifting past a real surface on that boundary.
  const origin = Object.fromEntries(AXES.map(axis => {
    const upper = axis.toUpperCase();
    return [axis, Math.max(bounds[`min${upper}`], Math.min(bounds[`max${upper}`], ray.origin[axis] + direction[axis] * enter))];
  }));
  return { origin, direction, length: Math.max(0, exit - enter), entryDistance: enter };
}
