import {
  ACESFilmicToneMapping, Color, DirectionalLight, FogExp2, HemisphereLight, Object3D, PCFShadowMap,
  PerspectiveCamera, Scene, SRGBColorSpace, Vector3, WebGLRenderer,
} from 'three';
import { PALETTE, SUN_DIR } from '../core/config';

export interface RenderContext {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  sun: DirectionalLight;
  hemi: HemisphereLight;
  fog: FogExp2;
  /** Keeps the shadow frustum centred on the player. */
  followShadow(target: Vector3): void;
  setQuality(q: 'high' | 'low'): void;
  resize(): void;
  gpuName: string;
  dispose(): void;
}

export const FOG_DENSITY = 0.00021;

export function createRenderContext(canvas: HTMLCanvasElement, onContextLost: () => void): RenderContext {
  const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', logarithmicDepthBuffer: true });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;

  const scene = new Scene();
  scene.background = new Color(PALETTE.skyHorizon);
  const fog = new FogExp2(PALETTE.fog, FOG_DENSITY);
  scene.fog = fog;

  const camera = new PerspectiveCamera(70, 1, 0.1, 30000);

  const sun = new DirectionalLight(PALETTE.sun, 3.1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -90; sc.right = 90; sc.top = 90; sc.bottom = -90; sc.near = 1; sc.far = 900;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.05;
  const sunTarget = new Object3D();
  sun.target = sunTarget;
  scene.add(sun, sunTarget);

  const hemi = new HemisphereLight(PALETTE.hemiSky, PALETTE.hemiGround, 1.15);
  scene.add(hemi);

  const gl = renderer.getContext();
  let gpuName = 'unknown';
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    gpuName = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  } catch { /* not exposed */ }

  const onLost = (e: Event) => { e.preventDefault(); onContextLost(); };
  canvas.addEventListener('webglcontextlost', onLost);

  const snap = new Vector3();
  const ctx: RenderContext = {
    renderer, scene, camera, sun, hemi, fog, gpuName,
    followShadow(target) {
      // Snap to shadow texels to avoid shimmering while walking.
      const texel = (sc.right - sc.left) / sun.shadow.mapSize.x;
      snap.set(Math.round(target.x / texel) * texel, target.y, Math.round(target.z / texel) * texel);
      sunTarget.position.copy(snap);
      sun.position.copy(snap).addScaledVector(SUN_DIR, 400);
      sunTarget.updateMatrixWorld();
    },
    setQuality(q) {
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, q === 'high' ? 1.5 : 1));
      sun.castShadow = q === 'high';
      renderer.shadowMap.needsUpdate = true;
      ctx.resize();
    },
    resize() {
      const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    },
    dispose() {
      canvas.removeEventListener('webglcontextlost', onLost);
      renderer.dispose();
    },
  };
  return ctx;
}
