import {
  ACESFilmicToneMapping, BufferGeometry, Color, DepthTexture, DirectionalLight, Float32BufferAttribute, FloatType, FogExp2,
  HemisphereLight, Mesh, Object3D, OrthographicCamera, PCFShadowMap, PerspectiveCamera, Scene, ShaderMaterial,
  SRGBColorSpace, UnsignedByteType, Vector2, Vector3, WebGLRenderer, WebGLRenderTarget,
} from 'three';
import { PALETTE, SUN_DIR } from '../core/config';
import './lightLoops';

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
  /** Directs the following renders of this frame into the scene buffer (no-op on the fallback path). */
  begin(): void;
  /** Tone-maps the scene buffer onto the canvas (no-op on the fallback path). */
  present(): void;
  /** True when rendering with a reversed 32-bit float depth buffer (otherwise logarithmic depth). */
  floatDepth: boolean;
  gpuName: string;
  dispose(): void;
}

export const FOG_DENSITY = 0.00021;

/**
 * Reversed-Z with a 32-bit float depth buffer gives the same near-to-horizon precision as a logarithmic depth buffer
 * (0.1 m … 30 km without z-fighting), but without writing gl_FragDepth in every fragment shader. Logarithmic depth
 * disables the GPU's early depth test, so every hidden surface (e.g. the outpost interior behind its walls) was fully
 * shaded; this was the single largest frame cost. The float depth buffer needs an off-screen (multisampled) target,
 * which is then tone-mapped onto the canvas. Falls back to logarithmic depth when the extensions are missing
 * (or with ?legacydepth in the URL, for comparisons).
 */
function supportsFloatDepth(): boolean {
  if (/[?&]legacydepth/.test(location.search)) return false;
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return false;
    const ok = !!gl.getExtension('EXT_clip_control') && !!gl.getExtension('EXT_color_buffer_float');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return ok;
  } catch {
    return false;
  }
}

export function createRenderContext(canvas: HTMLCanvasElement, onContextLost: () => void): RenderContext {
  const floatDepth = supportsFloatDepth();
  const renderer = new WebGLRenderer({
    canvas, powerPreference: 'high-performance',
    // Float-depth path: anti-aliasing happens in the multisampled scene target instead of the canvas.
    antialias: !floatDepth, logarithmicDepthBuffer: !floatDepth, reversedDepthBuffer: floatDepth,
  });
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

  // 4× MSAA scene buffer with a 32-bit float depth attachment. Flagged like an XR target so that three.js applies tone
  // mapping and the sRGB encode inside each material — exactly as when drawing to the canvas — so colours and alpha
  // blending are unchanged; storage stays plain RGBA8 and `present` is a straight copy.
  const sceneTarget = floatDepth ? new WebGLRenderTarget(1, 1, {
    type: UnsignedByteType, colorSpace: SRGBColorSpace, internalFormat: 'RGBA8', samples: 4,
    depthTexture: new DepthTexture(1, 1, FloatType), resolveDepthBuffer: false,
  }) : null;
  if (sceneTarget) (sceneTarget as WebGLRenderTarget & { isXRRenderTarget: boolean }).isXRRenderTarget = true;
  const presentScene = new Scene();
  const presentCam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  if (sceneTarget) {
    const tri = new BufferGeometry();
    tri.setAttribute('position', new Float32BufferAttribute([-1, 3, 0, -1, -1, 0, 3, -1, 0], 3));
    tri.setAttribute('uv', new Float32BufferAttribute([0, 2, 0, 0, 2, 0], 2));
    const quad = new Mesh(tri, new ShaderMaterial({
      uniforms: { tScene: { value: sceneTarget.texture } },
      vertexShader: /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */`uniform sampler2D tScene; varying vec2 vUv; void main() { gl_FragColor = texture2D(tScene, vUv); }`,
      depthTest: false, depthWrite: false, toneMapped: false,
    }));
    quad.frustumCulled = false;
    presentScene.add(quad);
  }
  const bufferSize = new Vector2();

  const snap = new Vector3();
  const ctx: RenderContext = {
    renderer, scene, camera, sun, hemi, fog, gpuName, floatDepth,
    begin() {
      if (sceneTarget) renderer.setRenderTarget(sceneTarget);
    },
    present() {
      if (!sceneTarget) return;
      renderer.setRenderTarget(null);
      renderer.render(presentScene, presentCam);
    },
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
      if (sceneTarget) { renderer.getDrawingBufferSize(bufferSize); sceneTarget.setSize(bufferSize.x, bufferSize.y); }
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    },
    dispose() {
      canvas.removeEventListener('webglcontextlost', onLost);
      sceneTarget?.dispose();
      renderer.dispose();
    },
  };
  return ctx;
}
