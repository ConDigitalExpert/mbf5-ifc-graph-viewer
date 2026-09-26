// Babylon discards the positive half-space of each clip plane.
export function sectionPlaneCoefficients(b) {
  return [[-1, 0, 0, b.minX], [1, 0, 0, -b.maxX],
    [0, -1, 0, b.minY], [0, 1, 0, -b.maxY],
    [0, 0, -1, b.minZ], [0, 0, 1, -b.maxZ]];
}

export function sectionHandleValue(bounds, key, position) {
  if (!/^(min|max)[XYZ]$/.test(key)) return null;
  const axis = key.slice(-1).toLowerCase();
  const extent = bounds.max[axis] - bounds.min[axis];
  if (!Number.isFinite(position) || !Number.isFinite(extent) || extent <= 0) return null;
  return Math.max(0, Math.min(1, (position - bounds.min[axis]) / extent));
}

export function boundedSectionValue(values, key, value) {
  if (!/^(min|max)[XYZ]$/.test(key) || !Number.isFinite(value)) return null;
  const axis = key.slice(-1);
  return key.startsWith("min")
    ? Math.max(0, Math.min(value, values[`max${axis}`] - .01))
    : Math.min(1, Math.max(value, values[`min${axis}`] + .01));
}

export function validSavedView(view) {
  return Boolean(view && typeof view.name === "string" && view.name.trim()
    && [view.alpha, view.beta, view.radius].every(Number.isFinite) && view.radius > 0
    && Array.isArray(view.target) && view.target.length === 3 && view.target.every(Number.isFinite)
    && (!view.projection || ["perspective", "orthographic"].includes(view.projection))
    && (!view.viewMode || ["perspective", "top", "front", "right"].includes(view.viewMode))
    && (!view.section || (typeof view.section.enabled === "boolean" && view.section.values
      && ["X", "Y", "Z"].every(axis => {
        const min = view.section.values[`min${axis}`], max = view.section.values[`max${axis}`];
        return Number.isFinite(min) && Number.isFinite(max) && min >= 0 && max <= 1 && max - min >= .0099;
      }))));
}

export function selectedSavedViewIndex(value, views) {
  if (!/^\d+$/.test(String(value))) return null;
  const index = Number(value);
  return Number.isSafeInteger(index) && index < views.length ? index : null;
}
