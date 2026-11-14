/// <reference lib="webworker" />
import { meshCave, type TerrainPatch } from './caveMesher';

/** Off-main-thread cave meshing (several million SDF samples). */
self.onmessage = (e: MessageEvent<{ terrain: TerrainPatch; voxel: number }>) => {
  const m = meshCave(e.data.terrain, e.data.voxel);
  (self as unknown as Worker).postMessage(m, [m.positions.buffer, m.normals.buffer, m.ao.buffer, m.indices.buffer]);
};
