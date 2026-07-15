# Map models (nature kit)

Place `.glb` files here. The client loads them via Three.js `GLTFLoader`.

The current arena is a tile-based nature grove (grass / river / bridges / trees)
built from these assets. Collision still comes from shared AABBs in `shared/src/map.ts`
— meshes are visual only.

## Preferred format
**`.glb`** (single-file glTF). See git history / agent notes for FBX conversion tips.
