import { LinearMipmapLinearFilter, NoColorSpace, RepeatWrapping, SRGBColorSpace, Texture, TextureLoader, WebGLRenderer } from 'three';

export type LayerName = 'Dust' | 'DarkSand' | 'Bedrock' | 'Sediment' | 'Gravel' | 'Rock' | 'CaveRock' | 'Ice';

export interface LayerTextures {
  albedo: Record<LayerName, Texture>;
  normal: Record<LayerName, Texture>;
}

const NAMES: LayerName[] = ['Dust', 'DarkSand', 'Bedrock', 'Sediment', 'Gravel', 'Rock', 'CaveRock', 'Ice'];

/** Loads the tileable PBR layers generated offline by Tools/python/make_textures.py. */
export async function loadLayerTextures(base: string, renderer: WebGLRenderer, onProgress: (f: number) => void): Promise<LayerTextures> {
  const loader = new TextureLoader();
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const total = NAMES.length * 2;
  let done = 0;
  const load = async (file: string, srgb: boolean) => {
    const t = await loader.loadAsync(`${base}${file}`);
    t.wrapS = t.wrapT = RepeatWrapping;
    t.anisotropy = aniso;
    t.minFilter = LinearMipmapLinearFilter;
    t.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
    onProgress(++done / total);
    return t;
  };
  const albedo = {} as Record<LayerName, Texture>;
  const normal = {} as Record<LayerName, Texture>;
  await Promise.all(NAMES.flatMap((n) => [
    load(`${n}_A.png`, true).then((t) => { albedo[n] = t; }),
    load(`${n}_N.png`, false).then((t) => { normal[n] = t; }),
  ]));
  return { albedo, normal };
}
