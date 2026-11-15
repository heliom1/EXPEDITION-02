# Known Issues, Limitations and Risks

- **Placeholders**: rover, outpost, drill are primitive stand-ins; no astronaut body. Waiting on user .glb files.
- **Rover cannot be driven** yet; power simulation does not yet affect facilities.
- Cave entrance edge: where the terrain cut meets the cave mesh there are small jagged fragments at the very base of the mouth.
- Frost on cave walls shows triplanar streaking up close.
- The suit lamp casts no shadows (cost); light can reach surfaces behind thin rock.
- Audio is procedural and untested by ear; levels may need tuning.
- Performance only measured headless on the Intel iGPU; the RTX 4050 is unmeasured.
- Hybrid-GPU laptops may run the browser on the integrated GPU unless set to High performance in Windows.
- Textures ship as PNG (~36 MB); KTX2/Basis would reduce download and VRAM.
- Terrain LOD transitions can briefly overlap coarse and fine meshes.
- Rocks use cylinder collision; you cannot stand on boulders.
- Narrative text beyond the user's overview is draft and flagged (NARRATIVE_SOURCE_OF_TRUTH).
- C: drive has ~3 GB free; keep the project and caches on D:.

## Cave: floor step at deepBend → iceRoom (open, 2026-11-15)
After the ice chamber was enlarged (`caveDef.ts`: iceRoom r 11.5→14, chamber r 13.5→24), `tests/cave.test.ts`
reports one floor step of −1.66 m at t≈0.45 on the deepBend→iceRoom passage (limit ≈1.3 m per 0.5 m).
Players can drop down; climbing back up there may be blocked. Fix: smooth the chamber bowl where the passage enters.
