import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stagedRoot = path.resolve(repoRoot, "..", "coordination_remediation", "delivery", "staged_source", "viewer");
const stagedGlb = path.join(stagedRoot, "data", "MBF5-TEST-COORDINATION.raw.glb");
const port = Number(process.env.UI_REMEDIATION_STAGED_PORT || 4174);

if (!fs.existsSync(stagedGlb)) throw new Error(`Staged raw source GLB is missing: ${stagedGlb}`);

const page = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>MBF5 · Staged source loader check</title>
    <style>
      :root { color-scheme: dark; font-family: Avenir Next, Inter, system-ui, sans-serif; }
      * { box-sizing: border-box; }
      html, body, main, canvas { width: 100%; height: 100%; margin: 0; }
      body { overflow: hidden; background: #071015; color: #edf5f5; }
      canvas { display: block; }
      .hud { position: fixed; z-index: 2; top: 18px; left: 18px; max-width: min(520px, calc(100% - 36px)); padding: 14px 16px; border: 1px solid rgba(188,216,224,.22); border-radius: 14px; background: rgba(7,15,20,.78); box-shadow: 0 18px 44px rgba(0,0,0,.28); backdrop-filter: blur(18px); }
      .eyebrow { margin: 0 0 7px; color: #49d3c1; font-size: 10px; font-weight: 800; letter-spacing: .15em; text-transform: uppercase; }
      h1 { margin: 0; font-size: 20px; letter-spacing: -.03em; }
      p { margin: 8px 0 0; color: #99adb1; font-size: 12px; line-height: 1.45; }
      #status { color: #f5b942; }
      #status.ready { color: #49d3c1; }
    </style>
  </head>
  <body>
    <main aria-label="Staged source browser geometry test">
      <div class="hud"><p class="eyebrow">Delivery compatibility check</p><h1>Source-correct raw GLB</h1><p id="status" role="status" aria-live="polite">Loading annotated source geometry…</p></div>
      <canvas id="source-canvas" aria-label="Source-correct raw GLB 3D view"></canvas>
    </main>
    <script src="https://cdn.babylonjs.com/babylon.js"></script>
    <script src="https://cdn.babylonjs.com/loaders/babylonjs.loaders.min.js"></script>
    <script>
      const canvas = document.querySelector("#source-canvas");
      const status = document.querySelector("#status");
      const engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
      const scene = new BABYLON.Scene(engine);
      scene.clearColor = new BABYLON.Color4(.025, .055, .07, 1);
      const camera = new BABYLON.ArcRotateCamera("source-camera", -Math.PI / 2.35, Math.PI / 2.9, 80, BABYLON.Vector3.Zero(), scene);
      camera.attachControl(canvas, true);
      camera.wheelPrecision = 45;
      camera.panningSensibility = 80;
      new BABYLON.HemisphericLight("source-hemi", new BABYLON.Vector3(.2, 1, .4), scene).intensity = 1.05;
      const key = new BABYLON.DirectionalLight("source-key", new BABYLON.Vector3(-.4, -1, -.3), scene);
      key.intensity = .55;
      const start = performance.now();
      window.__uiStagedSource = { status: "loading", startedAt: start };
      BABYLON.SceneLoader.ImportMeshAsync("", "/data/", "MBF5-TEST-COORDINATION.raw.glb", scene).then((result) => {
        const renderable = result.meshes.filter((mesh) => mesh.getTotalVertices?.() > 0);
        const extents = scene.getWorldExtends();
        const center = extents.min.add(extents.max).scale(.5);
        const size = extents.max.subtract(extents.min);
        const maxDim = Math.max(size.x, size.y, size.z, 1);
        camera.target.copyFrom(center);
        camera.radius = maxDim * 1.55;
        const elapsedMs = Math.round(performance.now() - start);
        window.__uiStagedSource = { status: "ready", elapsedMs, meshes: renderable.length, url: "/data/MBF5-TEST-COORDINATION.raw.glb" };
        status.classList.add("ready");
        status.textContent = "Raw GLB ready · " + renderable.length + " renderable meshes · " + elapsedMs + " ms · no Draco required";
      }).catch((error) => {
        window.__uiStagedSource = { status: "error", message: error.message };
        status.textContent = "Raw GLB failed · " + error.message;
        console.error(error);
      });
      engine.runRenderLoop(() => scene.render());
      addEventListener("resize", () => engine.resize());
    </script>
  </body>
</html>`;

const server = http.createServer((request, response) => {
  const requestPath = new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`).pathname;
  if (requestPath === "/" || requestPath === "/index.html") {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    response.end(page);
    return;
  }
  if (requestPath === "/data/MBF5-TEST-COORDINATION.raw.glb") {
    const stat = fs.statSync(stagedGlb);
    response.writeHead(200, { "Content-Type": "model/gltf-binary", "Content-Length": stat.size, "Cache-Control": "no-store" });
    fs.createReadStream(stagedGlb).pipe(response);
    return;
  }
  response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  response.end("Not found");
});

server.listen(port, "127.0.0.1", () => {
  console.log(`UI_REMEDIATION_STAGED_SOURCE http://127.0.0.1:${port}/`);
  console.log(`UI_REMEDIATION_STAGED_GLB ${stagedGlb}`);
});

process.on("SIGINT", () => server.close(() => process.exit(0)));
