// Toolkit verification: each third-party library is exercised for real (not just imported).
import { describe, expect, it } from 'vitest';
import { BufferGeometry, Mesh, MeshBasicMaterial, Ray, Raycaster, TorusKnotGeometry, Vector3 } from 'three';

describe('Rapier (@dimforge/rapier3d-compat)', () => {
  it('simulates a ball falling under Mars gravity onto a static ground and coming to rest', async () => {
    const RAPIER = (await import('@dimforge/rapier3d-compat')).default;
    await RAPIER.init();
    const world = new RAPIER.World({ x: 0, y: -3.721, z: 0 });
    world.createCollider(RAPIER.ColliderDesc.cuboid(10, 0.5, 10)); // ground top at y = 0.5
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 5, 0));
    world.createCollider(RAPIER.ColliderDesc.ball(0.4).setRestitution(0), body);
    for (let i = 0; i < 60 * 6; i++) world.step(); // 6 s at the default 1/60 s step
    const p = body.translation();
    expect(p.y).toBeGreaterThan(0.85);
    expect(p.y).toBeLessThan(0.95); // resting on the ground: 0.5 + 0.4
    expect(Math.hypot(body.linvel().x, body.linvel().y, body.linvel().z)).toBeLessThan(0.05);
    world.free();
  });
});

describe('three-mesh-bvh', () => {
  it('accelerates raycasts and returns the same hit as brute force', async () => {
    const { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } = await import('three-mesh-bvh');
    const proto = BufferGeometry.prototype as unknown as Record<string, unknown>;
    proto.computeBoundsTree = computeBoundsTree;
    proto.disposeBoundsTree = disposeBoundsTree;
    const geo = new TorusKnotGeometry(2, 0.5, 400, 64);
    const brute = new Mesh(geo, new MeshBasicMaterial());
    const rc = new Raycaster(new Vector3(-10, 0.3, 0.2), new Vector3(1, 0, 0));
    const expected = rc.intersectObject(brute)[0];
    (geo as unknown as { computeBoundsTree: () => void }).computeBoundsTree();
    const fast = new Mesh(geo, new MeshBasicMaterial());
    fast.raycast = acceleratedRaycast;
    const got = rc.intersectObject(fast)[0];
    expect(expected).toBeDefined();
    expect(got.distance).toBeCloseTo(expected.distance, 5);
    // The tree itself answers closest-point queries (used for collision/interaction lookups).
    const bvh = (geo as unknown as { boundsTree: { raycastFirst: (r: Ray) => { distance: number } | null } }).boundsTree;
    expect(bvh.raycastFirst(rc.ray)!.distance).toBeCloseTo(expected.distance, 5);
  });
});

describe('Theatre.js (@theatre/core)', () => {
  it('the game director becomes ready without Studio using the shipped state.json (boot must never hang)', async () => {
    const { CinematicDirector } = await import('../src/cinematics/director');
    const state = (await import('../src/cinematics/state.json')).default;
    const d = new CinematicDirector(state, new Vector3(0, 0, 0), 'Regression sheet');
    const ok = await Promise.race([d.ready().then(() => true), new Promise((r) => setTimeout(() => r(false), 2000))]);
    expect(ok).toBe(true);
  });

  it('evaluates a keyframed sequence from saved state (camera dolly)', async () => {
    const { getProject, types } = await import('@theatre/core');
    // Minimal saved project state as exported by Theatre Studio: one sheet, one object, two keyframes on x.
    const state = {
      sheetsById: {
        Intro: {
          staticOverrides: { byObject: {} },
          sequence: {
            subUnitsPerUnit: 30, length: 4, type: 'PositionalSequence',
            tracksByObject: {
              Camera: {
                trackIdByPropPath: { '["x"]': 'tx' },
                trackData: {
                  tx: { type: 'BasicKeyframedTrack', keyframes: [
                    { id: 'k0', position: 0, connectedRight: true, handles: [0.5, 1, 0.5, 0], type: 'bezier', value: 0 },
                    { id: 'k1', position: 4, connectedRight: true, handles: [0.5, 1, 0.5, 0], type: 'bezier', value: 100 },
                  ] },
                },
              },
            },
          },
        },
      },
      definitionVersion: '0.4.0',
      revisionHistory: [],
    };
    const project = getProject('CF2 test', { state });
    await project.ready;
    const sheet = project.sheet('Intro');
    const cam = sheet.object('Camera', { x: types.number(0) });
    sheet.sequence.position = 0;
    expect(cam.value.x).toBeCloseTo(0, 3);
    sheet.sequence.position = 4;
    expect(cam.value.x).toBeCloseTo(100, 3);
    sheet.sequence.position = 2;
    expect(cam.value.x).toBeGreaterThan(0);
    expect(cam.value.x).toBeLessThan(100);
  });
});
