import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as controls from '../dist/viewer-controls.js';

function viewerHarness() {
  const nodes = new Map();
  const listeners = new Map(); const controlElements = []; const storage = new Map();
  class Element {
    constructor(attributes = {}) { this.attributes = attributes; this.value = ''; this.textContent = ''; this.hidden = false; this.disabled = false; this.dataset = Object.fromEntries(Object.entries(attributes).filter(([key]) => key.startsWith('data-')).map(([key, value]) => [key.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()), value])); this.classList = { toggle() {}, add() {} }; }
    querySelectorAll() { return []; }
    toggleAttribute() {}
    addEventListener() {}
    focus() { document.activeElement = this; }
    select() {}
    matches(selector) {
      const excluded = [...selector.matchAll(/:not\(([^)]+)\)/g)].some(match => this.matches(match[1]));
      if (excluded) return false;
      return [...selector.replace(/:not\([^)]+\)/g, '').matchAll(/\[([^=\]]+)(?:="([^"]*)")?\]/g)].every(([, name, value]) => Object.hasOwn(this.attributes, name) && (value === undefined || this.attributes[name] === value));
    }
  }
  const document = { body: { dataset: {} }, activeElement: null, querySelector: s => { if (!nodes.has(s)) nodes.set(s, new Element()); return nodes.get(s); }, querySelectorAll: s => controlElements.filter(element => s.split(',').some(selector => element.matches(selector.trim()))), addEventListener: (type, handler) => { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(handler); } };
  const context = vm.createContext({ document, HTMLElement: Element, ...controls, console, window: { clearTimeout() {}, setTimeout() {}, requestAnimationFrame: callback => callback() }, localStorage: { getItem: key => storage.get(key) || '[]', setItem: (key, value) => storage.set(key, value) } });
  const source = fs.readFileSync(new URL('../dist/viewer.js', import.meta.url), 'utf8').replace(/^import .*?;\n/gm, '').replace(/\ninit\(\);\s*$/, '');
  vm.runInContext(source, context);
  return { run: source => vm.runInContext(source, context), context, nodes, storage, addControl: attributes => { const element = new Element(attributes); controlElements.push(element); return element; }, dispatch: (type, event) => { for (const handler of listeners.get(type) || []) handler(event); } };
}

// A camera test double implements geometric position/target behavior, while the
// tested functions themselves remain the real functions loaded from viewer.js.
class Vector3 {
  constructor(x = 0, y = 0, z = 0) { Object.assign(this, { x, y, z }); }
  clone() { return new Vector3(this.x, this.y, this.z); }
  copyFrom(vector) { Object.assign(this, { x: vector.x, y: vector.y, z: vector.z }); return this; }
  add(vector) { return new Vector3(this.x + vector.x, this.y + vector.y, this.z + vector.z); }
  subtract(vector) { return new Vector3(this.x - vector.x, this.y - vector.y, this.z - vector.z); }
  scale(factor) { return new Vector3(this.x * factor, this.y * factor, this.z * factor); }
  length() { return Math.hypot(this.x, this.y, this.z); }
  normalized() { return this.scale(1 / this.length()); }
  asArray() { return [this.x, this.y, this.z]; }
  static FromArray(values) { return new Vector3(...values); }
}

function navigationHarness() {
  const h = viewerHarness();
  const plainDrag = { button: 0, modifiers: { ctrl: false, shift: false, alt: false } };
  const inputKey = (device, binding) => JSON.stringify([device, binding]);
  const bindings = new Map([['wheel', 'zoom'], ['middle-drag', 'pan'], ['shift-drag', 'pan'], [inputKey('pointer', plainDrag), 'rotate']]);
  const orbit = {
    target: new Vector3(1, 2, 3), position: new Vector3(11, 7, 23), mode: 0,
    movement: { input: { setInteraction(device, binding, action) { bindings.set(inputKey(device, binding), action); } } },
    attachControl(_canvas, _preventDefault, useCtrlForPanning = true, panningMouseButton = 2) { this.attached = true; this.useCtrlForPanning = useCtrlForPanning; this.panningMouseButton = panningMouseButton; },
    detachControl() { this.attached = false; },
    setTarget(target) { this.target.copyFrom(target); },
    setPosition(position) { this.position.copyFrom(position); const relative = position.subtract(this.target); this.radius = relative.length(); this.alpha = Math.atan2(relative.z, relative.x); this.beta = Math.acos(relative.y / this.radius); },
    getViewMatrix() { this.position = this.target.add(new Vector3(Math.cos(this.alpha) * Math.sin(this.beta), Math.cos(this.beta), Math.sin(this.alpha) * Math.sin(this.beta)).scale(this.radius)); },
  };
  orbit.setPosition(orbit.position.clone());
  const walk = { position: new Vector3(), direction: new Vector3(0, 0, 1), setTarget(target) { this.direction = target.subtract(this.position).normalized(); }, getForwardRay() { return { direction: this.direction }; }, attachControl() { this.attached = true; }, detachControl() { this.attached = false; } };
  const viewer = { orbitCamera: orbit, walkCamera: walk, canvas: {}, scene: { activeCamera: orbit, onBeforeRenderObservable: { remove() {} } }, activeCamera: orbit, modelBounds: { size: new Vector3(100, 0, 0) }, engine: { getRenderWidth: () => 800, getRenderHeight: () => 600 } };
  h.context.BABYLON = { Vector3, Camera: { PERSPECTIVE_CAMERA: 0, ORTHOGRAPHIC_CAMERA: 1 } };
  h.context.fixtureViewer = viewer;
  h.run('state.viewer=fixtureViewer; state.sceneReady=true;');
  return { ...h, viewer, orbit, walk, bindings, plainDragKey: inputKey('pointer', plainDrag) };
}

function assertVector(actual, expected, message) {
  const values = actual instanceof Vector3 ? actual.asArray() : Array.from(actual);
  const target = expected instanceof Vector3 ? expected.asArray() : expected;
  assert.ok(values.every((value, index) => Math.abs(value - target[index]) < 1e-9), `${message}: ${values} != ${target}`);
}

function moveWalkCamera(h) {
  h.walk.position.copyFrom(new Vector3(80, -4, 25));
  h.walk.direction = new Vector3(0, 0, 1);
}

test('section planes retain interior and discard exterior on all six faces', () => {
  const h = viewerHarness();
  h.context.BABYLON = { Plane: class { constructor(...v) { this.v = v; } } };
  h.run('state.viewer={scene:{}}; state.section.enabled=true; sectionWorldBounds=()=>({minX:-2,maxX:4,minY:-3,maxY:5,minZ:-4,maxZ:6}); updateSectionVisuals=()=>{}; updateSectionSliders=()=>{}; applySectionPlanes();');
  const planes = h.run('Object.values(state.viewer.scene).map(p=>p.v)');
  const discarded = point => planes.some(p => p[0]*point[0]+p[1]*point[1]+p[2]*point[2]+p[3]>0);
  assert.equal(discarded([0,0,0]), false);
  for (const point of [[-3,0,0],[5,0,0],[0,-4,0],[0,6,0],[0,0,-5],[0,0,7]]) assert.equal(discarded(point),true);
  h.run('state.section.enabled=false; applySectionPlanes();');
  assert.equal(h.run('Object.values(state.viewer.scene).every(v=>v===null)'),true);
});

test('section handles normalize actual Vector3 bounds and reject invalid positions', () => {
  const bounds={min:{x:-20,y:2,z:0},max:{x:80,y:12,z:0}};
  assert.equal(controls.sectionHandleValue(bounds,'maxX',30),.5);
  assert.equal(controls.sectionHandleValue(bounds,'minY',7),.5);
  assert.equal(controls.sectionHandleValue(bounds,'maxX',Infinity),null);
  assert.equal(controls.sectionHandleValue(bounds,'minZ',0),null);
});

test('section input cannot inject NaN or invert/cross model bounds', () => {
  const h=viewerHarness(); h.run('applySectionPlanes=()=>{}');
  h.run('setSectionValue("maxX",NaN)');
  assert.equal(h.run('state.section.values.maxX'),1);
  h.run('setSectionValue("minX",-10);setSectionValue("maxY",10);setSectionValue("minZ",1)');
  assert.equal(h.run('state.section.values.minX'),0);
  assert.equal(h.run('state.section.values.maxY'),1);
  assert.equal(h.run('state.section.values.minZ'),.99);
});

test('saved view cannot apply during graph-only loading or alias stored section state', () => {
  const h=viewerHarness();
  h.run('state.viewer={}; setNavigationMode=()=>{}; applyProjection=()=>{}; applySectionPlanes=()=>{}; animateCameraTo=()=>{throw Error("camera touched before ready")};');
  const view={name:'Top',alpha:0,beta:.08,radius:10,target:[0,0,0],viewMode:'top',section:{enabled:true,values:{minX:0,maxX:1,minY:0,maxY:1,minZ:0,maxZ:1}}};
  h.context.sample=view;
  assert.doesNotThrow(()=>h.run('applySavedView(sample)'));
  h.context.BABYLON={Vector3:{FromArray:v=>v}};
  h.run('state.sceneReady=true; animateCameraTo=()=>{};updateViewMode=()=>{};applySavedView(sample);state.section.values.maxX=.5;');
  assert.equal(view.section.values.maxX,1);
});

test('saved-view placeholder never resolves to first view, malformed data is rejected', () => {
  const views=[{name:'First'}];
  for(const value of ['', '-1', '0.5', '1', 'no']) assert.equal(controls.selectedSavedViewIndex(value,views),null);
  assert.equal(controls.selectedSavedViewIndex('0',views),0);
  const valid={name:'Top',alpha:0,beta:.1,radius:10,target:[0,0,0]};
  assert.equal(controls.validSavedView(valid),true);
  assert.equal(controls.validSavedView({...valid,target:[0,NaN,0]}),false);
  assert.equal(controls.validSavedView({...valid,radius:-1}),false);
  assert.equal(controls.validSavedView({...valid,section:{enabled:true,values:{minX:1,maxX:0}}}),false);
});

test('delete persists successfully before changing memory and ignores placeholder', () => {
  const h=viewerHarness();
  h.run('state.savedViews=[{name:"Keep me"}];els.savedViewSelect.value="";deleteSelectedSavedView();');
  assert.equal(h.run('state.savedViews.length'),1);
  h.run('els.savedViewSelect.value="0";persistSavedViews=()=>false;deleteSelectedSavedView();');
  assert.equal(h.run('state.savedViews.length'),1);
  h.run('persistSavedViews=()=>true;deleteSelectedSavedView();');
  assert.equal(h.run('state.savedViews.length'),0);
});

test('scene readiness disables actual scene controls until geometry is usable, while help remains usable', () => {
  const h = viewerHarness();
  const sceneControls = [
    { 'data-view': 'top' }, { 'data-nav-mode': 'pan' }, { 'data-camera-action': 'frame-all' },
    ...['save-view', 'load-view', 'toggle-projection', 'toggle-walk', 'toggle-measure', 'toggle-section'].map(action => ({ 'data-action': action })),
    { 'data-section-axis': 'maxX' },
  ].map(attributes => h.addControl(attributes));
  const help = h.addControl({ 'data-camera-action': 'help' });
  const inspector = h.addControl({ 'data-action': 'toggle-inspector' });
  h.run('setSceneReady(false)');
  assert.equal(sceneControls.every(control => control.disabled), true);
  assert.equal(help.disabled, false);
  assert.equal(inspector.disabled, false);
  h.run('setSceneReady(true)');
  assert.equal(sceneControls.every(control => !control.disabled), true);
  h.run('setSceneReady(false)');
  assert.equal(sceneControls.every(control => control.disabled), true, 'failed reload must return controls to loading state');
});

test('closed side panels are inert and reopening restores interaction', () => {
  const h = viewerHarness();
  for (const panelName of ['toolsPanel', 'inspectorPanel']) {
    h.run(`setPanelOpen(els.${panelName}, false)`);
    assert.equal(h.run(`els.${panelName}.dataset.open`), 'false');
    assert.equal(h.run(`els.${panelName}.inert`), true, 'closed offscreen panel must not retain focusable controls');
    h.run(`setPanelOpen(els.${panelName}, true)`);
    assert.equal(h.run(`els.${panelName}.dataset.open`), 'true');
    assert.equal(h.run(`els.${panelName}.inert`), false, 'reopened panel must allow interaction');
    h.run(`setPanelOpen(els.${panelName}, false)`);
    assert.equal(h.run(`els.${panelName}.inert`), true);
  }
});

test('W enters Walk once and movement keys keep its camera active until Escape', () => {
  const h = navigationHarness();
  h.run('bindInterfaceControls()');
  const key = key => ({ key, preventDefault() { throw new Error('movement keys must remain available to camera input'); } });
  h.dispatch('keydown', key('w'));
  assert.equal(h.viewer.activeCamera, h.walk);
  for (const movementKey of ['w', 'W', 'a', 's', 'd', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) {
    h.dispatch('keydown', key(movementKey));
    assert.equal(h.viewer.activeCamera, h.walk, `${movementKey} must not switch out of Walk`);
  }
  h.dispatch('keydown', key('Escape'));
  assert.equal(h.viewer.activeCamera, h.orbit);
});

test('Orbit/Pan/Walk switches preserve the current position and gaze, plus zoom and modified drag bindings', () => {
  const h = navigationHarness();
  const startPosition = h.orbit.position.clone(); const startDirection = h.orbit.target.subtract(startPosition).normalized();
  h.run('setNavigationMode("pan")');
  assert.equal(h.bindings.get(h.plainDragKey), 'pan');
  assertVector(h.orbit.position, startPosition, 'Pan preserves position');
  assert.equal(h.orbit.useCtrlForPanning, false);
  assert.equal(h.orbit.panningMouseButton, 1);
  h.run('setNavigationMode("walk")');
  assertVector(h.walk.position, startPosition, 'Walk starts at the camera position');
  assertVector(h.walk.direction, startDirection, 'Walk starts with the camera gaze');
  moveWalkCamera(h);
  h.run('setNavigationMode("pan")');
  assertVector(h.orbit.position, h.walk.position, 'Pan starts at the walked-to position');
  assertVector(h.orbit.target.subtract(h.orbit.position).normalized(), h.walk.direction, 'Pan retains the walked-to gaze');
  h.run('setNavigationMode("orbit")');
  assert.equal(h.bindings.get(h.plainDragKey), 'rotate');
  assertVector(h.orbit.position, h.walk.position, 'Orbit does not jump back to the old camera');
  assertVector(h.orbit.target.subtract(h.orbit.position).normalized(), h.walk.direction, 'Orbit retains the walked-to gaze');
  assert.equal(h.bindings.get('wheel'), 'zoom');
  assert.equal(h.bindings.get('middle-drag'), 'pan');
  assert.equal(h.bindings.get('shift-drag'), 'pan');
});

test('saving from Walk captures the current perspective view instead of a stale orthographic orbit', () => {
  const h = navigationHarness();
  h.run('applyProjection("orthographic");setNavigationMode("walk")');
  moveWalkCamera(h);
  h.run('saveCurrentView();els.savedViewName.value="Walked-to view";commitSavedView()');
  const saved = h.run('state.savedViews[0]');
  assert.equal(saved.name, 'Walked-to view');
  assert.equal(saved.projection, 'perspective', 'Walk uses perspective even when it was entered from an orthographic view');
  const target = Vector3.FromArray(saved.target);
  const restoredPosition = target.add(new Vector3(Math.cos(saved.alpha) * Math.sin(saved.beta), Math.cos(saved.beta), Math.sin(saved.alpha) * Math.sin(saved.beta)).scale(saved.radius));
  assertVector(restoredPosition, h.walk.position, 'saved position matches the current Walk view');
  assertVector(target.subtract(restoredPosition).normalized(), h.walk.direction, 'saved gaze matches the current Walk view');
  assert.equal(h.storage.size, 1, 'the view is persisted through the actual save flow');
});

test('changing projection from Walk uses the current walked-to position and gaze', () => {
  const h = navigationHarness();
  h.run('setNavigationMode("walk")'); moveWalkCamera(h);
  h.run('applyProjection("orthographic")');
  assert.equal(h.viewer.activeCamera, h.orbit);
  assert.equal(h.orbit.mode, 1);
  assertVector(h.orbit.position, h.walk.position, 'projection change retains current position');
  assertVector(h.orbit.target.subtract(h.orbit.position).normalized(), h.walk.direction, 'projection change retains current gaze');
});

test('measurement from Walk uses the current view and remains unavailable before geometry loads', () => {
  const h = navigationHarness();
  h.run('state.sceneReady=false;setMeasureActive(true)');
  assert.equal(h.run('state.measure.active'), false);
  h.run('state.sceneReady=true;setNavigationMode("walk")'); moveWalkCamera(h);
  h.run('setMeasureActive(true)');
  assert.equal(h.run('state.measure.active'), true);
  assert.equal(h.viewer.activeCamera, h.orbit);
  assertVector(h.orbit.position, h.walk.position, 'measurement retains current position');
  assertVector(h.orbit.target.subtract(h.orbit.position).normalized(), h.walk.direction, 'measurement retains current gaze');
});
