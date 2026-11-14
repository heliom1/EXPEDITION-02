import { DoubleSide, MeshStandardMaterial } from 'three';

/** Shared materials for placeholder hardware (white composite panels, orange accents, as in the references). */
export const MAT = {
  panel: new MeshStandardMaterial({ color: 0xd8d3ca, roughness: 0.55, metalness: 0.15 }),
  panelDusty: new MeshStandardMaterial({ color: 0xc9b8a6, roughness: 0.7, metalness: 0.1 }),
  metal: new MeshStandardMaterial({ color: 0x77736e, roughness: 0.45, metalness: 0.7 }),
  darkMetal: new MeshStandardMaterial({ color: 0x2c2a29, roughness: 0.6, metalness: 0.5 }),
  accent: new MeshStandardMaterial({ color: 0xd2652a, roughness: 0.5, metalness: 0.2 }),
  yellow: new MeshStandardMaterial({ color: 0xc8962f, roughness: 0.6, metalness: 0.3 }),
  rubber: new MeshStandardMaterial({ color: 0x1d1b1a, roughness: 0.9, metalness: 0 }),
  window: new MeshStandardMaterial({ color: 0x2a1c12, emissive: 0xffa557, emissiveIntensity: 1.6, roughness: 0.2 }),
  lightWarm: new MeshStandardMaterial({ color: 0xffffff, emissive: 0xffd7a0, emissiveIntensity: 4 }),
  lightCool: new MeshStandardMaterial({ color: 0xffffff, emissive: 0x9fe6ff, emissiveIntensity: 3 }),
  lightRed: new MeshStandardMaterial({ color: 0xff3010, emissive: 0xff2a10, emissiveIntensity: 5 }),
  glass: new MeshStandardMaterial({ color: 0xcfe0e0, roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.28, side: DoubleSide, depthWrite: false }),
  plants: new MeshStandardMaterial({ color: 0x4f7a2c, emissive: 0x3f8a2a, emissiveIntensity: 0.6, roughness: 0.8 }),
  growLight: new MeshStandardMaterial({ color: 0xffffff, emissive: 0xff7fd0, emissiveIntensity: 1.2 }),
  solar: new MeshStandardMaterial({ color: 0x1b2433, roughness: 0.25, metalness: 0.6 }),
  radiator: new MeshStandardMaterial({ color: 0xbdb7ae, roughness: 0.4, metalness: 0.5 }),
  screen: new MeshStandardMaterial({ color: 0x0a0c10, emissive: 0x5ad0ff, emissiveIntensity: 1.4 }),
};
