import { getProject, types, type IProject, type ISheet, type ISheetObject } from '@theatre/core';
import { Vector3, type PerspectiveCamera } from 'three';

/**
 * In-game cinematics (Theatre.js). Camera moves are authored visually in Theatre Studio and saved as JSON state
 * (src/cinematics/state.json, exported from Studio), so the game plays them back with only @theatre/core.
 *
 * Studio is a dev-only tool: it loads when running `npm run dev` with `?studio` in the URL and is removed from
 * production builds (the `import.meta.env.DEV` branch is dead code there).
 */
export interface CameraShot { position: { x: number; y: number; z: number }; target: { x: number; y: number; z: number }; fov: number }

const vec = (x: number, y: number, z: number) => types.compound({ x: types.number(x), y: types.number(y), z: types.number(z) });

export class CinematicDirector {
  readonly project: IProject;
  readonly sheet: ISheet;
  readonly camera: ISheetObject<{ position: ReturnType<typeof vec>; target: ReturnType<typeof vec>; fov: ReturnType<typeof types.number> }>;
  /** True while a sequence is playing and owns the camera. */
  active = false;
  private readonly origin: Vector3;

  /** `origin`: world point the sheet's coordinates are relative to (e.g. the outpost dome centre at floor level). */
  constructor(state: unknown, origin: Vector3, sheetName = 'Outpost flyover') {
    this.origin = origin.clone();
    // Always pass state: without Studio, a project with no state never becomes ready.
    this.project = getProject('Cinderfall 2', { state: state ?? { sheetsById: {}, definitionVersion: '0.4.0', revisionHistory: [] } });
    this.sheet = this.project.sheet(sheetName);
    this.camera = this.sheet.object('Camera', {
      position: vec(60, 18, -90),
      target: vec(0, 6, 0),
      fov: types.number(60, { range: [20, 100] }),
    });
  }

  ready(): Promise<void> { return this.project.ready; }

  /** Plays the sheet's sequence once; resolves when it finishes (or immediately if it has no length). */
  async play(rate = 1): Promise<void> {
    this.active = true;
    try { await this.sheet.sequence.play({ rate }); } finally { this.active = false; }
  }

  /** Writes the current shot into the game camera (call every render frame while `active`, or for previews). */
  apply(cam: PerspectiveCamera): void {
    const v = this.camera.value, o = this.origin;
    cam.position.set(o.x + v.position.x, o.y + v.position.y, o.z + v.position.z);
    cam.lookAt(o.x + v.target.x, o.y + v.target.y, o.z + v.target.z);
    if (Math.abs(cam.fov - v.fov) > 1e-3) { cam.fov = v.fov; cam.updateProjectionMatrix(); }
  }
}

/** Loads Theatre Studio (dev server only, `?studio`). Returns true when Studio was started. */
export async function maybeStartStudio(params: URLSearchParams): Promise<boolean> {
  if (!import.meta.env.DEV || !params.has('studio')) return false;
  // @theatre/studio is CommonJS; depending on the bundler's interop the default export may be wrapped once more.
  const mod = (await import('@theatre/studio')) as unknown as { default: { initialize?: () => void; default?: { initialize: () => void } } };
  const studio = mod.default.initialize ? mod.default : mod.default.default;
  if (!studio?.initialize) throw new Error('Theatre Studio module has no initialize()');
  studio.initialize();
  return true;
}
