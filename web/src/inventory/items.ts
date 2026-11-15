/**
 * Item catalogue (System E). Values are configurable gameplay numbers, not engineering specifications.
 * Mineral descriptions use real Mars mineralogy; quantities and effects are gameplay abstractions.
 */
export type ItemCategory = 'tool' | 'consumable' | 'sample' | 'supply';

export interface ItemDef {
  id: string;
  name: string;
  category: ItemCategory;
  /** Short HUD glyph. */
  icon: string;
  /** Max units per inventory slot (1 = not stackable). */
  stack: number;
  description: string;
  /** Consumables: what using one restores (suit percentage points). */
  restores?: { oxygen?: number; power?: number; health?: number };
  /** Samples: mineral colour used for deposits/pickups (sRGB hex). */
  color?: number;
}

export const ITEMS: Record<string, ItemDef> = {
  hand_drill: {
    id: 'hand_drill', name: 'Rock drill', category: 'tool', icon: '⛏', stack: 1,
    description: 'Hand-held core drill. Select it and press E at a mineral deposit to cut a sample free.',
  },
  scanner: {
    id: 'scanner', name: 'Field scanner', category: 'tool', icon: '⌖', stack: 1,
    description: 'Suit-linked spectrometer. Identifies minerals when samples are collected and logs them to the expedition archive.',
  },
  medkit: {
    id: 'medkit', name: 'Med kit', category: 'consumable', icon: '✚', stack: 5,
    description: 'Trauma kit and suit-seal patch. Restores 40 health.', restores: { health: 40 },
  },
  o2_canister: {
    id: 'o2_canister', name: 'O₂ canister', category: 'consumable', icon: 'O₂', stack: 5,
    description: 'Pressurised oxygen reserve that plugs into the suit. Restores 35% oxygen.', restores: { oxygen: 35 },
  },
  battery: {
    id: 'battery', name: 'Suit battery', category: 'consumable', icon: '⚡', stack: 5,
    description: 'Swappable suit cell. Restores 40% suit power.', restores: { power: 40 },
  },
  ration: {
    id: 'ration', name: 'Food ration', category: 'consumable', icon: '🥫', stack: 10,
    description: 'Sealed meal grown in the outpost farm (lettuce, potato, soy). Eating one through the suit port restores 25 health.', restores: { health: 25 },
  },
  seed_pack: {
    id: 'seed_pack', name: 'Seed pack', category: 'supply', icon: '🌱', stack: 10,
    description: 'Pre-germinated seed cassette for the farm grow beds. Plant one in an empty bed (E), keep the bed watered, harvest food rations.',
  },
  ice_core: {
    id: 'ice_core', name: 'Ice core C-09', category: 'supply', icon: '❄', stack: 1,
    description: 'Sealed, temperature-controlled container holding a controlled water-ice sample from the lower chamber of cave system C-09. For laboratory analysis at the outpost.',
  },
  hematite: {
    id: 'hematite', name: 'Hematite sample', category: 'sample', icon: '◆', stack: 20, color: 0x7a2e24,
    description: 'Iron oxide (Fe₂O₃). Grey-red crystals; on Mars often linked to past water. A candidate iron source for in-situ manufacturing.',
  },
  olivine: {
    id: 'olivine', name: 'Olivine sample', category: 'sample', icon: '◆', stack: 20, color: 0x5f7a2c,
    description: '(Mg,Fe)₂SiO₄. Green basaltic mineral that weathers quickly in water — where it survives, the ground stayed dry.',
  },
  gypsum: {
    id: 'gypsum', name: 'Gypsum sample', category: 'sample', icon: '◆', stack: 20, color: 0xd9d2c3,
    description: 'Hydrated calcium sulfate (CaSO₄·2H₂O). Pale veins that precipitated from water; bound water could be extracted.',
  },
};

export const itemDef = (id: string): ItemDef => {
  const d = ITEMS[id];
  if (!d) throw new Error(`unknown item ${id}`);
  return d;
};

/** Suit kit at the start of a new game (hotbar order follows the reference tool bar). */
export const STARTING_KIT: Array<[string, number]> = [['hand_drill', 1], ['scanner', 1], ['medkit', 1], ['o2_canister', 1], ['battery', 1]];
export const STARTING_HOTBAR = ['hand_drill', 'scanner', 'medkit', 'o2_canister', 'battery'];
/** Contents of the outpost supply locker on a new game. */
export const LOCKER_STOCK: Array<[string, number]> = [['o2_canister', 3], ['battery', 2], ['medkit', 2], ['seed_pack', 3]];
