import {
  FAIR_PHOTO_ASPECT,
  FAIR_PHOTO_MAX_DPR,
  FAIR_PHOTO_SOURCE,
  samplePhotoLights,
  type FairPhotoViewerMessage,
} from "../../lib/fair/photo-viewer";

type ConnectionNavigator = Navigator & { connection?: { saveData?: boolean } };
const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
let disposed = false;
let cleanupRenderer: (() => void) | null = null;
let deadline = 0;
let frame = 0;
let resizeObserver: ResizeObserver | null = null;

function report(message: FairPhotoViewerMessage) {
  if (!disposed && window.parent !== window) window.parent.postMessage(message, window.location.origin);
}

function teardown() {
  if (disposed) return;
  disposed = true;
  window.clearTimeout(deadline);
  window.cancelAnimationFrame(frame);
  resizeObserver?.disconnect();
  motion.removeEventListener("change", onMotionChange);
  document.removeEventListener("visibilitychange", onVisibilityChange);
  cleanupRenderer?.();
  cleanupRenderer = null;
}

function fail(reason: Extract<FairPhotoViewerMessage, { status: "error" }>["reason"]) {
  report({ type: "radius:fair-photo", version: 1, status: "error", reason });
  teardown();
}

function onMotionChange() {
  if (motion.matches) fail("motion");
}

function onVisibilityChange() {
  if (document.hidden) fail("render");
}

async function enhance() {
  if (motion.matches) return fail("motion");
  if ((navigator as ConnectionNavigator).connection?.saveData) return fail("data");
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("webgl2", { alpha: true, antialias: false, powerPreference: "low-power" });
  if (!context) return fail("webgl");
  const releaseProbe = () => context.getExtension("WEBGL_lose_context")?.loseContext();
  cleanupRenderer = releaseProbe;
  deadline = window.setTimeout(() => fail("timeout"), 8_000);

  // Heavy code is requested only inside the explicitly opened viewer, after
  // its capability/preferences gates. The ordinary Fair page imports none.
  const [THREE, { SparkRenderer, SplatMesh }] = await Promise.all([
    import("three"), import("@sparkjsdev/spark"),
  ]);
  if (disposed) return;
  const photo = new Image();
  photo.src = FAIR_PHOTO_SOURCE;
  await photo.decode();
  if (disposed) return;
  const sampler = document.createElement("canvas");
  sampler.width = 320;
  sampler.height = 180;
  const sampleContext = sampler.getContext("2d", { willReadFrequently: true });
  if (!sampleContext) return fail("render");
  sampleContext.drawImage(photo, 0, 0, sampler.width, sampler.height);
  const lights = samplePhotoLights(sampleContext.getImageData(0, 0, sampler.width, sampler.height).data, sampler.width, sampler.height);
  const renderer = new THREE.WebGLRenderer({ canvas, context, alpha: true, antialias: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, FAIR_PHOTO_MAX_DPR));
  renderer.setClearColor(0, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-FAIR_PHOTO_ASPECT, FAIR_PHOTO_ASPECT, 1, -1, 0.1, 10);
  camera.position.z = 2;
  let startedAt: number | null = null;
  let slowFrames = 0;
  let previousAt = 0;
  // Render the fixed photographic light field once. The entrance fades the
  // already-rendered canvas, avoiding per-frame GPU readbacks and worker sorts.
  const spark = new SparkRenderer({ renderer, autoUpdate: false, enableLod: false, minSortIntervalMs: 0 });
  scene.add(spark);
  const mesh = new SplatMesh({
    constructSplats: (splats) => {
      const rotation = new THREE.Quaternion();
      const scale = new THREE.Vector3(0.012, 0.012, 0.002);
      for (const light of lights) {
        splats.pushSplat(
          new THREE.Vector3((light.x * 2 - 1) * FAIR_PHOTO_ASPECT, 1 - light.y * 2, 0),
          scale, rotation, 0.5, new THREE.Color(light.red, light.green, light.blue),
        );
      }
    },
    raycastable: false,
    enableLod: false,
  });
  scene.add(mesh);
  cleanupRenderer = () => {
    canvas.remove();
    mesh.dispose();
    spark.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  };
  canvas.addEventListener("webglcontextlost", () => fail("webgl"), { once: true });
  await mesh.initialized;
  if (disposed) return;
  document.body.append(canvas);
  const width = Math.max(1, document.documentElement.clientWidth);
  const height = Math.max(1, document.documentElement.clientHeight);
  const aspect = width / height;
  const halfHeight = Math.max(1, FAIR_PHOTO_ASPECT / aspect);
  camera.left = -halfHeight * aspect;
  camera.right = halfHeight * aspect;
  camera.top = halfHeight;
  camera.bottom = -halfHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
  renderer.getDrawingBufferSize(spark.renderSize);
  await spark.update({ scene, camera });
  if (disposed) return;
  renderer.render(scene, camera);
  canvas.setAttribute("data-ready", "");
  report({ type: "radius:fair-photo", version: 1, status: "ready" });
  window.clearTimeout(deadline);
  function animate(now: number) {
    frame = 0;
    if (disposed) return;
    try {
      startedAt ??= now;
      const progress = Math.min(1, (now - startedAt) / 1_400);
      canvas.style.opacity = String(Math.sin(progress * Math.PI) * 0.65);
      if (previousAt && now - previousAt > 80) slowFrames += 1;
      previousAt = now;
      if (slowFrames >= 4) return fail("render");
      if (progress >= 1) {
        teardown();
      } else {
        frame = window.requestAnimationFrame(animate);
      }
    } catch {
      fail("render");
    }
  }
  // A resize can change the photo fit while the short reveal is running.
  // The static photograph remains responsive; simply retire the decoration.
  resizeObserver = new ResizeObserver(() => {
    if (document.documentElement.clientWidth !== width || document.documentElement.clientHeight !== height) teardown();
  });
  resizeObserver.observe(document.documentElement);
  frame = window.requestAnimationFrame(animate);
}

window.addEventListener("pagehide", teardown, { once: true });
motion.addEventListener("change", onMotionChange);
document.addEventListener("visibilitychange", onVisibilityChange);
void enhance().catch(() => fail("render"));
