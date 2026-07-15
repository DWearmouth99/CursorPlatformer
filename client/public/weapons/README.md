# Weapon viewmodels (`.glb`)

Loaded as first-person guns (no arms). Mapped in `client/src/viewmodels.ts`.

## Rollback to blocky guns

Open the game with `?boxguns=1`, or in the browser console:

```js
localStorage.setItem("cursorfps_boxguns", "1");
location.reload();
```

To re-enable GLBs:

```js
localStorage.removeItem("cursorfps_boxguns");
location.reload();
```

Guns with no matching file fall back to the procedural boxes automatically.
