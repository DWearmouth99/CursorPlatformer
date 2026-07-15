import * as THREE from "three";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  ACTIVE_ARENA_FILE,
  ACTIVE_ARENA_URL,
  MODEL_CATALOG,
  autoCollider,
  getActiveLevel,
  getModelInfo,
  type LevelFile,
  type LevelProp,
} from "@fps/shared";
import defaultLevel from "../../../shared/src/levels/arena.json";

const STORAGE_KEY = "fps-level-editor-draft";
/** Models sit flush on the turf at this Y. */
const GROUND_Y = -0.05;
/** Spawn pad feet height on the turf. */
const SPAWN_GROUND_Y = 0.05;

type EditorItem = {
  prop: LevelProp;
  /** Transform root (position / yaw / scale). */
  object: THREE.Group;
  /** Invisible fat hit-box so thin props (ladders) stay selectable. */
  pick: THREE.Mesh;
  colHelper?: THREE.Mesh;
};

const canvas = document.getElementById("c") as HTMLCanvasElement;
const modelList = document.getElementById("model-list")!;
const inspector = document.getElementById("inspector")!;
const inspProp = document.getElementById("insp-prop")!;
const inspSpawn = document.getElementById("insp-spawn")!;
const selName = document.getElementById("sel-name")!;
const selSolid = document.getElementById("sel-solid") as HTMLInputElement;
const selScale = document.getElementById("sel-scale") as HTMLInputElement;
const selScaleVal = document.getElementById("sel-scale-val")!;
const selY = document.getElementById("sel-y") as HTMLInputElement;
const selYVal = document.getElementById("sel-y-val")!;
const gridSnapEl = document.getElementById("grid-snap") as HTMLSelectElement;
const showColEl = document.getElementById("show-col") as HTMLInputElement;
const statusEl = document.getElementById("status")!;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setClearColor(0x8ec4e8);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xa8d0ec, 90, 280);

const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 2500);
camera.position.set(40, 28, 55);
camera.rotation.order = "YXZ";

/** Free-fly look angles (radians). */
let flyYaw = Math.PI * 0.8;
let flyPitch = -0.45;
let lookDragging = false;
let moveSpeed = 32;
const flyKeys = new Set<string>();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
let lastT = performance.now();

function applyFlyLook(): void {
  camera.rotation.y = flyYaw;
  camera.rotation.x = flyPitch;
}
applyFlyLook();

const transform = new TransformControls(camera, canvas);
transform.setMode("translate");
transform.setSize(0.9);
scene.add(transform.getHelper());

let transformDragging = false;
transform.addEventListener("dragging-changed", (e) => {
  transformDragging = !!e.value;
  if (!e.value) autosave();
});

scene.add(new THREE.HemisphereLight(0xfff4e6, 0x3d6b35, 1.1));
const sun = new THREE.DirectionalLight(0xfff0d0, 1.15);
sun.position.set(40, 70, 30);
scene.add(sun);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(200, 200),
  new THREE.MeshStandardMaterial({ color: 0x4f8f45, roughness: 0.95 }),
);
ground.rotation.x = -Math.PI / 2;
ground.name = "__ground";
scene.add(ground);

const grid = new THREE.GridHelper(120, 60, 0x6aa86a, 0x3d6b45);
grid.position.y = 0.02;
scene.add(grid);

const river = new THREE.Mesh(
  new THREE.PlaneGeometry(9, 90),
  new THREE.MeshStandardMaterial({ color: 0x3a9fc4, roughness: 0.35 }),
);
river.rotation.x = -Math.PI / 2;
river.position.y = 0.03;
scene.add(river);

const wallMat = new THREE.MeshStandardMaterial({
  color: 0x6b5a45,
  transparent: true,
  opacity: 0.35,
});
const wallGroup = new THREE.Group();
scene.add(wallGroup);

const spawnGroup = new THREE.Group();
scene.add(spawnGroup);

const lib = new Map<string, THREE.Object3D>();
const items: EditorItem[] = [];
/** Spawn root groups (selectable / movable). */
const spawnObjects: THREE.Group[] = [];
let selected: EditorItem | null = null;
let selectedSpawnIndex: number | null = null;
let placeModel = MODEL_CATALOG[0]!.id;
const _placeHit = new THREE.Vector3();
const _groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
let levelMeta: Pick<
  LevelFile,
  "version" | "name" | "arenaW" | "arenaD" | "wallH" | "wallT" | "boxes"
> = {
  version: 1,
  name: "Nature Arena",
  arenaW: 72,
  arenaD: 96,
  wallH: 9,
  wallT: 1.4,
  boxes: [],
};
let spawns: LevelFile["spawns"] = [];

function setStatus(msg: string): void {
  statusEl.textContent = msg;
}

function snap(v: number): number {
  const g = Number(gridSnapEl.value);
  if (!g) return v;
  return Math.round(v / g) * g;
}

function resize(): void {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (w === 0 || h === 0) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

async function loadLibrary(): Promise<void> {
  const loader = new GLTFLoader();
  await Promise.all(
    MODEL_CATALOG.map(async (m) => {
      try {
        const gltf = await loader.loadAsync(`/models/${m.id}.glb`);
        gltf.scene.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.isMesh) {
            const mats = Array.isArray(mesh.material)
              ? mesh.material
              : [mesh.material];
            for (const mat of mats) {
              const std = mat as THREE.MeshStandardMaterial;
              if (std.map) std.map.colorSpace = THREE.SRGBColorSpace;
            }
          }
        });
        lib.set(m.id, gltf.scene);
      } catch (e) {
        console.warn("missing model", m.id, e);
      }
    }),
  );
}

function rebuildWalls(): void {
  wallGroup.clear();
  const { arenaW, arenaD, wallH = 9, wallT = 1.4 } = levelMeta;
  const mk = (sx: number, sy: number, sz: number, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), wallMat);
    m.position.set(x, y, z);
    wallGroup.add(m);
  };
  mk(arenaW + 4, wallH, wallT, 0, wallH / 2, -arenaD / 2 - wallT / 2);
  mk(arenaW + 4, wallH, wallT, 0, wallH / 2, arenaD / 2 + wallT / 2);
  mk(wallT, wallH, arenaD, -arenaW / 2 - wallT / 2, wallH / 2, 0);
  mk(wallT, wallH, arenaD, arenaW / 2 + wallT / 2, wallH / 2, 0);
}

function rebuildSpawns(): void {
  const keepIndex = selectedSpawnIndex;
  transform.detach();
  selectedSpawnIndex = null;
  spawnGroup.clear();
  spawnObjects.length = 0;

  spawns.forEach((s, i) => {
    const root = new THREE.Group();
    root.name = "__spawn";
    root.userData.spawnIndex = i;
    root.position.set(s.position.x, s.position.y, s.position.z);
    root.rotation.y = s.yaw;

    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(0.85, 0.85, 0.12, 20),
      new THREE.MeshStandardMaterial({
        color: s.team === "T" ? 0xc45c26 : 0x2a6ebd,
        emissive: s.team === "T" ? 0x3a1808 : 0x0a2040,
        emissiveIntensity: 0.35,
      }),
    );
    pad.position.y = 0.06;
    pad.userData.spawnIndex = i;

    // Local +Z is forward; root.rotation.y = yaw
    const dir = new THREE.ArrowHelper(
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, 0.25, 0),
      2.4,
      s.team === "T" ? 0xff8844 : 0x66aaff,
      0.45,
      0.3,
    );
    dir.userData.spawnIndex = i;

    root.add(pad);
    root.add(dir);
    spawnGroup.add(root);
    spawnObjects.push(root);
  });

  if (keepIndex != null && keepIndex < spawnObjects.length) {
    selectSpawn(keepIndex);
  }
}

const pickMat = new THREE.MeshBasicMaterial({
  transparent: true,
  opacity: 0,
  depthWrite: false,
});

/** World-space pick box size (thin models get a minimum so they stay clickable). */
function pickWorldSize(
  model: string,
  scale: number,
): { sx: number; sy: number; sz: number } {
  const col = autoCollider(model, scale);
  return {
    sx: Math.max(col.sx, 1.4),
    sy: Math.max(col.sy, 1.4),
    sz: Math.max(col.sz, 1.4),
  };
}

function updatePickProxy(item: EditorItem): void {
  const scale = Math.max(item.prop.scale ?? 4, 0.001);
  const world = pickWorldSize(item.prop.model, scale);
  // Pick mesh is a child of the scaled root → use local size
  item.pick.geometry.dispose();
  item.pick.geometry = new THREE.BoxGeometry(
    world.sx / scale,
    world.sy / scale,
    world.sz / scale,
  );
  item.pick.position.set(0, world.sy / scale / 2, 0);
}

function updateColHelper(item: EditorItem): void {
  if (item.colHelper) {
    scene.remove(item.colHelper);
    item.colHelper.geometry.dispose();
    (item.colHelper.material as THREE.Material).dispose();
    item.colHelper = undefined;
  }
  if (!item.prop.solid || !showColEl.checked) return;
  const scale = item.prop.scale ?? 4;
  const col = item.prop.collider ?? autoCollider(item.prop.model, scale);
  const helper = new THREE.Mesh(
    new THREE.BoxGeometry(col.sx, col.sy, col.sz),
    new THREE.MeshBasicMaterial({
      color: 0xff8866,
      wireframe: true,
      transparent: true,
      opacity: 0.85,
    }),
  );
  helper.position.set(
    item.prop.x,
    item.prop.y + col.sy / 2,
    item.prop.z,
  );
  helper.name = "__col";
  scene.add(helper);
  item.colHelper = helper;
}

function syncObjectFromProp(item: EditorItem): void {
  const p = item.prop;
  const scale = p.scale ?? 4;
  item.object.position.set(p.x, p.y, p.z);
  item.object.rotation.y = p.yaw ?? 0;
  item.object.scale.setScalar(scale);
  updatePickProxy(item);
  updateColHelper(item);
}

function addItem(prop: LevelProp, select = true): EditorItem {
  const template = lib.get(prop.model);
  const root = new THREE.Group();
  root.userData.editor = true;
  const visual = template
    ? template.clone(true)
    : new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial({ color: 0xff00ff }),
      );
  root.add(visual);

  const pick = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), pickMat);
  pick.name = "__pick";
  pick.userData.editor = true;
  root.add(pick);

  const item: EditorItem = { prop, object: root, pick };
  scene.add(root);
  items.push(item);
  syncObjectFromProp(item);
  if (select) selectItem(item);
  return item;
}

/** Only props + spawns — never walls / ground / gizmo planes. */
function getPickRoots(): THREE.Object3D[] {
  return [...items.map((it) => it.pick), ...spawnObjects];
}

function clearItems(): void {
  transform.detach();
  selected = null;
  selectedSpawnIndex = null;
  for (const it of items) {
    scene.remove(it.object);
    if (it.colHelper) {
      scene.remove(it.colHelper);
      it.colHelper.geometry.dispose();
      (it.colHelper.material as THREE.Material).dispose();
    }
  }
  items.length = 0;
  inspector.classList.add("hidden");
}

function clearSelection(): void {
  transform.detach();
  selected = null;
  selectedSpawnIndex = null;
  inspector.classList.add("hidden");
  inspProp.classList.remove("hidden");
  inspSpawn.classList.add("hidden");
}

function selectItem(item: EditorItem | null): void {
  selectedSpawnIndex = null;
  selected = item;
  if (!item) {
    clearSelection();
    return;
  }
  transform.attach(item.object);
  transform.setMode("translate");
  inspector.classList.remove("hidden");
  inspProp.classList.remove("hidden");
  inspSpawn.classList.add("hidden");
  selName.textContent = `${item.prop.model}  (${items.indexOf(item)})`;
  selSolid.checked = !!item.prop.solid;
  selScale.value = String(item.prop.scale ?? 4);
  selScaleVal.textContent = Number(selScale.value).toFixed(1);
  selY.value = String(item.prop.y);
  selYVal.textContent = Number(selY.value).toFixed(2);
}

function selectSpawn(index: number): void {
  const root = spawnObjects[index];
  if (!root) return;
  selected = null;
  selectedSpawnIndex = index;
  transform.attach(root);
  transform.setMode("translate");
  inspector.classList.remove("hidden");
  inspProp.classList.add("hidden");
  inspSpawn.classList.remove("hidden");
  const s = spawns[index]!;
  selName.textContent = `${s.team} spawn #${index}`;
}

function propFromObject(item: EditorItem): void {
  const p = item.prop;
  p.x = snap(item.object.position.x);
  p.y = item.object.position.y;
  p.z = snap(item.object.position.z);
  item.object.position.x = p.x;
  item.object.position.z = p.z;
  p.yaw = item.object.rotation.y;
  p.scale = item.object.scale.x;
  updateColHelper(item);
  selY.value = String(p.y);
  selYVal.textContent = p.y.toFixed(2);
  selScale.value = String(p.scale ?? 4);
  selScaleVal.textContent = Number(selScale.value).toFixed(1);
}

function spawnFromObject(index: number): void {
  const root = spawnObjects[index];
  const s = spawns[index];
  if (!root || !s) return;
  s.position.x = snap(root.position.x);
  s.position.y = root.position.y;
  s.position.z = snap(root.position.z);
  root.position.x = s.position.x;
  root.position.z = s.position.z;
  s.yaw = root.rotation.y;
}

transform.addEventListener("objectChange", () => {
  if (selected) propFromObject(selected);
  else if (selectedSpawnIndex != null) spawnFromObject(selectedSpawnIndex);
});

function setItemGround(item: EditorItem): void {
  item.prop.y = GROUND_Y;
  item.object.position.y = GROUND_Y;
  updateColHelper(item);
  if (item === selected) {
    selY.value = String(GROUND_Y);
    selYVal.textContent = GROUND_Y.toFixed(2);
  }
}

function snapSelectedToGround(): void {
  if (selectedSpawnIndex != null) {
    const root = spawnObjects[selectedSpawnIndex];
    const s = spawns[selectedSpawnIndex];
    if (root && s) {
      s.position.y = SPAWN_GROUND_Y;
      root.position.y = SPAWN_GROUND_Y;
      autosave();
      setStatus(`Spawn → ground (${SPAWN_GROUND_Y})`);
    }
    return;
  }
  if (!selected) {
    setStatus("Select an object first");
    return;
  }
  setItemGround(selected);
  autosave();
  setStatus(`Selected → ground (${GROUND_Y})`);
}

function snapAllToGround(): void {
  for (const it of items) setItemGround(it);
  for (let i = 0; i < spawns.length; i++) {
    spawns[i]!.position.y = SPAWN_GROUND_Y;
    const root = spawnObjects[i];
    if (root) root.position.y = SPAWN_GROUND_Y;
  }
  autosave();
  setStatus(`All props + spawns → ground`);
}

function clearMap(): void {
  if (
    !confirm(
      "Clear the entire map? This removes all props and spawn points (walls stay).",
    )
  ) {
    return;
  }
  clearItems();
  spawns = [];
  rebuildSpawns();
  levelMeta.boxes = [];
  autosave();
  setStatus("Map cleared — place props to start fresh");
}

function placeAt(x: number, z: number): void {
  const info = getModelInfo(placeModel);
  const scale = info?.defaultScale ?? 4;
  const item = addItem({
    model: placeModel,
    x: snap(x),
    y: GROUND_Y,
    z: snap(z),
    yaw: 0,
    scale,
    solid: info?.solidDefault ?? false,
  });
  // Force ground even if something else touched Y
  setItemGround(item);
  setStatus(`Placed ${placeModel} at Y=${GROUND_Y}`);
  autosave();
}

function pointAheadOfCamera(dist = 12): THREE.Vector3 {
  camera.getWorldDirection(_fwd);
  return camera.position.clone().addScaledVector(_fwd, dist);
}

function buildLevelFile(): LevelFile {
  // Refresh colliders for solids without custom ones before export
  const props = items.map((it) => {
    const p: LevelProp = { ...it.prop };
    if (p.solid) {
      p.collider = p.collider ?? autoCollider(p.model, p.scale ?? 4);
    } else {
      delete p.collider;
    }
    return p;
  });
  return {
    version: 1,
    name: levelMeta.name,
    arenaW: levelMeta.arenaW,
    arenaD: levelMeta.arenaD,
    wallH: levelMeta.wallH,
    wallT: levelMeta.wallT,
    props,
    spawns: [...spawns],
    boxes: levelMeta.boxes ?? [],
  };
}

function loadLevel(level: LevelFile): void {
  clearItems();
  levelMeta = {
    version: 1,
    name: level.name,
    arenaW: level.arenaW,
    arenaD: level.arenaD,
    wallH: level.wallH,
    wallT: level.wallT,
    boxes: level.boxes ?? [],
  };
  spawns = level.spawns.map((s) => ({
    ...s,
    position: { ...s.position },
  }));
  rebuildWalls();
  rebuildSpawns();
  for (const p of level.props) {
    addItem({ ...p }, false);
  }
  clearSelection();
  setStatus(`Loaded “${level.name}” (${level.props.length} props)`);
}

function autosave(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(buildLevelFile()));
  } catch {
    /* ignore quota */
  }
}

function downloadLevel(): void {
  const data = buildLevelFile();
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = ACTIVE_ARENA_FILE;
  a.click();
  URL.revokeObjectURL(a.href);
  autosave();
  setStatus(
    `Downloaded ${ACTIVE_ARENA_FILE} — save into client/public/arenas/ then restart server`,
  );
}

function findEditorItem(obj: THREE.Object3D): EditorItem | null {
  let o: THREE.Object3D | null = obj;
  while (o) {
    const hit = items.find((it) => it.object === o);
    if (hit) return hit;
    o = o.parent;
  }
  return null;
}

function findSpawnIndex(obj: THREE.Object3D): number | null {
  let o: THREE.Object3D | null = obj;
  while (o) {
    if (typeof o.userData.spawnIndex === "number") {
      return o.userData.spawnIndex as number;
    }
    if (o.name === "__spawn" && typeof o.userData.spawnIndex === "number") {
      return o.userData.spawnIndex as number;
    }
    o = o.parent;
  }
  return null;
}

function pointerRay(ev: PointerEvent): THREE.Raycaster {
  const rect = canvas.getBoundingClientRect();
  const mouse = new THREE.Vector2(
    ((ev.clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1,
    -((ev.clientY - rect.top) / Math.max(rect.height, 1)) * 2 + 1,
  );
  const raycaster = new THREE.Raycaster();
  raycaster.far = 5000;
  raycaster.setFromCamera(mouse, camera);
  return raycaster;
}

canvas.addEventListener("contextmenu", (e) => e.preventDefault());

canvas.addEventListener("pointerdown", (ev) => {
  if (ev.button === 2 || ev.button === 1) {
    lookDragging = true;
    canvas.setPointerCapture(ev.pointerId);
    return;
  }
  if (ev.button !== 0) return;
  if (transformDragging || transform.dragging) return;
  // Hovering a gizmo handle — let TransformControls move the selection
  if (transform.axis) return;

  const raycaster = pointerRay(ev);

  // Select only against prop pick-proxies + spawn pads (ignores walls / gizmo planes)
  if (!ev.shiftKey) {
    const hits = raycaster.intersectObjects(getPickRoots(), true);
    for (const h of hits) {
      const spawnIdx = findSpawnIndex(h.object);
      if (spawnIdx != null) {
        selectSpawn(spawnIdx);
        return;
      }
      const item = findEditorItem(h.object);
      if (item) {
        selectItem(item);
        return;
      }
    }
  }

  // Place anywhere you click in the world XZ plane (any camera distance)
  if (raycaster.ray.intersectPlane(_groundPlane, _placeHit)) {
    placeAt(_placeHit.x, _placeHit.z);
  } else {
    setStatus("Aim toward the ground plane to place");
  }
});

canvas.addEventListener("pointerup", (ev) => {
  if (ev.button === 2 || ev.button === 1) {
    lookDragging = false;
    try {
      canvas.releasePointerCapture(ev.pointerId);
    } catch {
      /* already released */
    }
  }
});

canvas.addEventListener("pointermove", (ev) => {
  if (!lookDragging || transformDragging) return;
  flyYaw -= ev.movementX * 0.0025;
  flyPitch -= ev.movementY * 0.0025;
  const lim = Math.PI / 2 - 0.05;
  flyPitch = Math.max(-lim, Math.min(lim, flyPitch));
  applyFlyLook();
});

canvas.addEventListener(
  "wheel",
  (ev) => {
    ev.preventDefault();
    moveSpeed *= ev.deltaY > 0 ? 0.9 : 1.1;
    moveSpeed = Math.max(4, Math.min(120, moveSpeed));
    setStatus(`Fly speed ${moveSpeed.toFixed(0)}`);
  },
  { passive: false },
);

function buildPalette(): void {
  modelList.innerHTML = "";
  for (const m of MODEL_CATALOG) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "model-btn" + (m.id === placeModel ? " active" : "");
    btn.innerHTML = `${m.label}<small>${m.id} · ${m.category}${m.solidDefault ? " · solid" : ""}</small>`;
    btn.addEventListener("click", () => {
      placeModel = m.id;
      buildPalette();
      setStatus(`Place tool: ${m.label}`);
    });
    modelList.appendChild(btn);
  }
}

selSolid.addEventListener("change", () => {
  if (!selected) return;
  selected.prop.solid = selSolid.checked;
  if (selected.prop.solid) {
    selected.prop.collider = autoCollider(
      selected.prop.model,
      selected.prop.scale ?? 4,
    );
  } else {
    delete selected.prop.collider;
  }
  updateColHelper(selected);
  autosave();
});

selScale.addEventListener("input", () => {
  if (!selected) return;
  const s = Number(selScale.value);
  selected.prop.scale = s;
  selected.object.scale.setScalar(s);
  selScaleVal.textContent = s.toFixed(1);
  if (selected.prop.solid) {
    selected.prop.collider = autoCollider(selected.prop.model, s);
  }
  updatePickProxy(selected);
  updateColHelper(selected);
});

selScale.addEventListener("change", () => autosave());

selY.addEventListener("input", () => {
  if (!selected) return;
  selected.prop.y = Number(selY.value);
  selected.object.position.y = selected.prop.y;
  selYVal.textContent = selected.prop.y.toFixed(2);
  updateColHelper(selected);
});

selY.addEventListener("change", () => autosave());

showColEl.addEventListener("change", () => {
  for (const it of items) updateColHelper(it);
});

document.getElementById("btn-delete")!.addEventListener("click", () => {
  if (selectedSpawnIndex != null) {
    const idx = selectedSpawnIndex;
    clearSelection();
    spawns.splice(idx, 1);
    rebuildSpawns();
    autosave();
    setStatus("Spawn deleted");
    return;
  }
  if (!selected) return;
  const idx = items.indexOf(selected);
  scene.remove(selected.object);
  if (selected.colHelper) {
    scene.remove(selected.colHelper);
    selected.colHelper.geometry.dispose();
    (selected.colHelper.material as THREE.Material).dispose();
  }
  items.splice(idx, 1);
  clearSelection();
  autosave();
  setStatus("Deleted");
});

document.getElementById("btn-download")!.addEventListener("click", downloadLevel);

document.getElementById("file-load")!.addEventListener("change", async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const text = await file.text();
  loadLevel(JSON.parse(text) as LevelFile);
  autosave();
});

document.getElementById("btn-reset")!.addEventListener("click", async () => {
  if (!confirm(`Reload ${ACTIVE_ARENA_FILE} from /arenas/? Unsaved draft will be cleared.`))
    return;
  localStorage.removeItem(STORAGE_KEY);
  try {
    const res = await fetch(ACTIVE_ARENA_URL);
    if (res.ok) {
      loadLevel((await res.json()) as LevelFile);
      setStatus(`Reloaded ${ACTIVE_ARENA_URL}`);
      return;
    }
  } catch {
    /* fall through */
  }
  loadLevel(structuredClone(defaultLevel) as LevelFile);
  setStatus("Arena file missing — loaded bundled fallback");
});

async function boot(): Promise<void> {
  buildPalette();
  setStatus("Loading models…");
  await loadLibrary();

  const draft = localStorage.getItem(STORAGE_KEY);
  if (draft) {
    try {
      loadLevel(JSON.parse(draft) as LevelFile);
      setStatus("Restored editor draft from this browser");
      resize();
      tick();
      return;
    } catch {
      /* fall through */
    }
  }

  try {
    const res = await fetch(ACTIVE_ARENA_URL);
    if (res.ok) {
      loadLevel((await res.json()) as LevelFile);
      setStatus(`Loaded ${ACTIVE_ARENA_URL}`);
      resize();
      tick();
      return;
    }
  } catch {
    /* fall through */
  }

  loadLevel(structuredClone(getActiveLevel()));
  setStatus("Loaded bundled fallback arena");
  resize();
  tick();
}
function addSpawn(team: "T" | "CT"): void {
  const p = pointAheadOfCamera(14);
  spawns.push({
    team,
    position: { x: snap(p.x), y: SPAWN_GROUND_Y, z: snap(p.z) },
    yaw: team === "T" ? Math.PI : 0,
  });
  rebuildSpawns();
  selectSpawn(spawns.length - 1);
  autosave();
  setStatus(`Added ${team} spawn — drag to reposition`);
}

document.getElementById("btn-spawn-t")!.addEventListener("click", () => addSpawn("T"));
document.getElementById("btn-spawn-ct")!.addEventListener("click", () => addSpawn("CT"));
document
  .getElementById("btn-ground-sel")!
  .addEventListener("click", snapSelectedToGround);
document
  .getElementById("btn-spawn-ground")!
  .addEventListener("click", snapSelectedToGround);
document
  .getElementById("btn-ground-all")!
  .addEventListener("click", snapAllToGround);
document.getElementById("btn-clear")!.addEventListener("click", clearMap);

function isTypingTarget(t: EventTarget | null): boolean {
  return (
    t instanceof HTMLInputElement ||
    t instanceof HTMLSelectElement ||
    t instanceof HTMLTextAreaElement
  );
}

window.addEventListener("keydown", (e) => {
  if (isTypingTarget(e.target)) return;
  flyKeys.add(e.code);

  const rotTarget =
    selected?.object ??
    (selectedSpawnIndex != null ? spawnObjects[selectedSpawnIndex] : null);

  if (e.code === "KeyQ" && rotTarget) {
    rotTarget.rotation.y += Math.PI / 12;
    if (selected) propFromObject(selected);
    else if (selectedSpawnIndex != null) spawnFromObject(selectedSpawnIndex);
    autosave();
  }
  if (e.code === "KeyE" && rotTarget) {
    rotTarget.rotation.y -= Math.PI / 12;
    if (selected) propFromObject(selected);
    else if (selectedSpawnIndex != null) spawnFromObject(selectedSpawnIndex);
    autosave();
  }
  if (e.code === "KeyR" && rotTarget) {
    rotTarget.rotation.y += Math.PI / 2;
    if (selected) propFromObject(selected);
    else if (selectedSpawnIndex != null) spawnFromObject(selectedSpawnIndex);
    autosave();
  }
  if (
    (e.code === "Delete" || e.code === "Backspace") &&
    (selected || selectedSpawnIndex != null)
  ) {
    document.getElementById("btn-delete")!.click();
  }
  if (e.code === "KeyF" && rotTarget) {
    camera.position.copy(rotTarget.position);
    camera.position.y += 8;
    camera.position.z += 12;
    const to = rotTarget.position.clone().sub(camera.position).normalize();
    flyYaw = Math.atan2(-to.x, -to.z);
    flyPitch = Math.asin(Math.max(-1, Math.min(1, to.y)));
    applyFlyLook();
  }
  if (e.code === "Digit1") transform.setMode("translate");
  if (e.code === "Digit2") transform.setMode("rotate");
  if (e.code === "Digit3" && selected) transform.setMode("scale");
});

window.addEventListener("keyup", (e) => {
  flyKeys.delete(e.code);
});

window.addEventListener("blur", () => flyKeys.clear());

function tick(): void {
  requestAnimationFrame(tick);
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;

  if (!isTypingTarget(document.activeElement) && !transformDragging) {
    const sprint = flyKeys.has("ShiftLeft") || flyKeys.has("ShiftRight") ? 2.4 : 1;
    const speed = moveSpeed * sprint * dt;
    camera.getWorldDirection(_fwd);
    _right.crossVectors(_fwd, _up).normalize();
    if (flyKeys.has("KeyW")) camera.position.addScaledVector(_fwd, speed);
    if (flyKeys.has("KeyS")) camera.position.addScaledVector(_fwd, -speed);
    if (flyKeys.has("KeyA")) camera.position.addScaledVector(_right, -speed);
    if (flyKeys.has("KeyD")) camera.position.addScaledVector(_right, speed);
    if (flyKeys.has("Space")) camera.position.y += speed;
    if (flyKeys.has("ControlLeft") || flyKeys.has("ControlRight")) {
      camera.position.y -= speed;
    }
  }

  resize();
  renderer.render(scene, camera);
}

void boot();
