# Known Issues, Limitations and Risks

- **Placeholders**: rover, outpost, drill are primitive stand-ins; no astronaut body. Waiting on user .glb files.
- **No cave yet**: the final objective ends at the cliff base; caves are Phases 08–09.
- **No saving**: refreshing the page loses progress; Continue is disabled.
- **No audio**.
- **Rover cannot be driven** yet.
- Tool bar (1–5) is visual only.
- Performance only measured headless on the Intel iGPU; the RTX 4050 is unmeasured.
- Hybrid-GPU laptops may run the browser on the integrated GPU unless set to High performance in Windows.
- Textures ship as PNG (~36 MB). KTX2/Basis compression would cut download and VRAM.
- Terrain LOD transitions can briefly overlap coarse and fine meshes (minor flicker at distance).
- Rocks use flat cylinder collision; you cannot stand on top of boulders.
- Splat maps are 2 m/texel; ground texture blending is soft at close range.
- Narrative text beyond the user's overview is draft and flagged (see NARRATIVE_SOURCE_OF_TRUTH).
- C: drive has ~3 GB free; keep the project and caches on D:.
