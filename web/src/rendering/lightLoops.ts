import { ShaderChunk } from 'three';

/**
 * Shader compile time fix (the loading screen used to sit at 97% for a long time).
 *
 * three.js unrolls the per-light loops of every lit material: with the outpost's 11 point lights and 2 spot lights, each
 * standard material's fragment shader carried 13 inlined copies of the physically based lighting code (~95 k chars),
 * and the GPU driver (Direct3D via ANGLE on Windows) needs about a second per program to compile that.
 *
 * Unrolling is only required for lights that cast shadows (shadow-map samplers must be indexed with constants). This
 * keeps those unrolled and evaluates the shadowless point and spot lights in an ordinary loop (dynamic indexing of
 * uniform arrays is fine in WebGL 2). Same math, same result, a fraction of the shader size. Spot lights with light
 * maps keep three.js's original fully unrolled code.
 */
const src = ShaderChunk.lights_fragment_begin;

const POINT_OLD = /#pragma unroll_loop_start\s*for \( int i = 0; i < NUM_POINT_LIGHTS; i \+\+ \) \{([\s\S]*?)\n\t\}\n\t#pragma unroll_loop_end/;
const SPOT_OLD = /(\t#pragma unroll_loop_start\s*for \( int i = 0; i < NUM_SPOT_LIGHTS; i \+\+ \) \{[\s\S]*?\n\t\}\n\t#pragma unroll_loop_end)/;

const shadowless = (kind: 'point' | 'spot') => kind === 'point' ? `
	for ( int i = NUM_POINT_LIGHT_SHADOWS; i < NUM_POINT_LIGHTS; i ++ ) {
		pointLight = pointLights[ i ];
		getPointLightInfo( pointLight, geometryPosition, directLight );
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}` : `
	for ( int i = NUM_SPOT_LIGHT_SHADOWS; i < NUM_SPOT_LIGHTS; i ++ ) {
		spotLight = spotLights[ i ];
		getSpotLightInfo( spotLight, geometryPosition, directLight );
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}`;

const pm = src.match(POINT_OLD), sm = src.match(SPOT_OLD);
if (pm && sm) {
  // point lights: shadow casters come first in three's light arrays, so [0, shadows) unrolled, the rest looped
  let out = src.replace(POINT_OLD, `#pragma unroll_loop_start
	for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {${pm[1]}
	}
	#pragma unroll_loop_end
${shadowless('point')}`);
  // spot lights (ordered [shadows with maps, shadows, maps only, none]): without light maps the shadowless ones are last
  const spotUnrolledShadows = sm[1].replace('i < NUM_SPOT_LIGHTS;', 'i < NUM_SPOT_LIGHT_SHADOWS;');
  out = out.replace(SPOT_OLD, `#if ( NUM_SPOT_LIGHT_MAPS > 0 )
${sm[1]}
	#else
${spotUnrolledShadows}
${shadowless('spot')}
	#endif`);
  ShaderChunk.lights_fragment_begin = out;
} else {
  console.warn('lightLoops: three.js light chunk changed; keeping the unrolled light loops');
}
