# Tetrahedral Codebase Structure

*A complete guide for any coding agent working in this codebase. No prior context required.*

---

## 0. Ground (Why Tetrahedra)

A tetrahedron is the simplest 3D solid — 4 vertices, 4 triangular faces, 6 edges. It is the minimal structure in which every vertex is connected to every other vertex. This makes it the natural unit for organizing anything that has mutual dependencies: every concern touches every other concern exactly once.

Conventional codebases organize by semantic category (models/, controllers/, utils/) — groupings decided by convention and argued about at boundaries. This codebase organizes by **geometric position** — each file occupies a specific location in an infinite recursive tetrahedral lattice. Position is not assigned by convention. It is derived from the structure of the problem itself.

The result: any agent can orient from a filename alone, navigate without loading everything, add new content without debate about placement, and scale to arbitrary depth without architectural decay.

---

## 1. The Four Directions

Every tetrahedron has 4 vertices. In this codebase they map to 4 functional roles:

| address | role | what lives here |
|---------|------|-----------------|
| `w` | **structure** | types, schemas, constants, the shape of data at rest |
| `x` | **state** | runtime values, mutable process, what is currently happening |
| `y` | **relation** | how things connect, transform, and communicate |
| `z` | **output** | rendering, display, what crosses the system boundary outward |

These four are not arbitrary labels. They are the minimal polarity split of any computational system:

- *form ↔ process* (w/z ↔ x/y)
- *internal ↔ external* (w/x ↔ y/z)

Every file in the codebase lives at one of these four positions, or at a recursive subdivision of one of them.

---

## 2. The Self-Similar Router Rule

This is the geometric law the entire structure rests on.

When a vertex needs to be subdivided — because it has grown too complex to hold in a single file — it produces exactly 4 children, named by appending one of `w`, `x`, `y`, `z` to the parent's address:

```
w   →   ww  wx  wy  wz
wx  →   wxw wxx wxy wxz
xyy →   xyyw xyyx xyyy xyyz
```

**The law:** The child that **repeats the parent's last letter** is geometrically the same vertex as the parent — at one level finer resolution. It becomes the **router** for that subdivision.

```
w    subdivides →  ww (router),  wx,  wy,  wz
wx   subdivides →  wxw, wxx (router), wxy, wxz
xyy  subdivides →  xyyw, xyyx, xyyy (router), xyyz
```

The router inherits the parent's role exactly. It imports and re-exports from its 3 siblings. It adds no logic of its own. It is a map, not an implementation.

**Why this matters:**
- The router is always at a predictable address — no discovery needed
- Routing logic is self-similar at every depth — the same topology, infinitely
- An agent reading `xyyy` knows without loading it: this is the router for the `xyy` plane, its siblings are `xyyw`, `xyyx`, `xyyz`
- Dependency hell cannot form — routing always flows through the same-direction vertex, which is already structurally connected to the parent above

---

## 3. File Naming Convention

Files use the address as a prefix followed by an underscore and a descriptive name:

```
w_form.rs          ← w vertex: types, AST, constants
x_parse.rs         ← x vertex: parsing (state transformation)
y_physics.rs       ← y vertex: relational physics / cascade rules
z_runtime.rs       ← z vertex: output / runtime execution (router for z subdivision)
z_runtime/
  zw_render.rs     ← zw vertex: rendering (structure within output)
  zx_output.rs     ← zx vertex: output state
  zy_timing.rs     ← zy vertex: timing relations
  zz_runtime.rs    ← zz vertex: router for z plane (same vertex as z_runtime.rs)
```

The router file and the parent file are the same vertex — one is the coarse representation, one is the fine. When a file subdivides, it becomes the router for its own plane at the next level.

---

## 4. How to Add New Content

**Adding to an existing vertex (no subdivision needed):**
Find the file whose address matches your content's position. Add there.

**Subdividing a vertex that has grown too large:**

1. Identify the address of the overloaded file, e.g. `x_parse.rs`
2. Create a directory: `x_parse/` (or use the address prefix naming)
3. Move implementation logic into 3 new files: `xx_`, `xy_`, `xz_` (the non-router children)
4. The original `x_parse.rs` becomes (or is replaced by) `xx_parse.rs` — the router — which imports from `xx_`, `xy_`, `xz_` and re-exports the same public API
5. Nothing upstream breaks — the parent still imports from the same address

**Choosing which direction for new content:**

Use the four-vertex decomposition. Ask: what is the minimal polarity whose union creates this domain? Split each pole into 2 mutually necessary sub-concerns. The 4 sub-concerns are your 4 vertices. Assign them `w/x/y/z` by matching to structure/state/relation/output.

If you cannot find a clean polarity split, the domain is not yet understood well enough to subdivide — keep it in one file until the natural split reveals itself through use.

---

## 5. Navigation Rules for Agents

**Orient from the filename:**
- Last letter before `_` = your position in the tetrahedron
- Repeated last letters = router (e.g., `zz_` is the router of the `z` plane)
- Count the prefix length = your depth (1 letter = root level, 2 = first subdivision, etc.)

**Read the router first, descend only if needed:**
The router file is small — it only imports and re-exports. Read it to understand what exists at that depth without loading any implementation. Descend into a sub-file only when you have confirmed that is where your target lives.

**Never load more than one depth at a time:**
Root-level routers tell you what exists at depth 1. Depth-1 routers tell you what exists at depth 2. Navigate top-down. Do not glob the whole directory tree — load breadth first, descend only on confirmed paths.

**Adding content:**
1. Start at the root router
2. Navigate to the correct `w/x/y/z` direction for your content
3. Descend until you reach the appropriate depth (leaf file, not router)
4. Add there — or subdivide if the file is overloaded

**Never mix router and implementation in the same file:**
A file is either a pure router (imports only, zero logic) or a pure implementation (logic only, no routing). Mixed files are a sign that subdivision is needed.

---

## 6. The Database Naming Convention (Same Principle)

Database tables follow the identical pattern:

```
wStructure_   ← w domain: ontological structure, schemas
xState_       ← x domain: runtime state, mutable data
yProcess_     ← y domain: process, relations, transformations
zRelation_    ← z domain: crystallized knowledge, output-facing data
```

Subdivisions follow the same self-similar router rule:

```
xState_wSystem        ← w vertex within x domain (structural state)
xState_xMemories      ← x vertex within x domain (memory state — router at x.x)
xState_yBlooms        ← y vertex within x domain (relational blooms)
xState_zInnerMonologue ← z vertex within x domain (output-facing inner state)
```

The table name IS the address. No external documentation needed to understand what a table holds — the address encodes its position in the full ontological lattice.

---

## 7. The Validation Test (Sublimation)

You have organized correctly when:

1. **An agent navigates differently because of the structure** — not just files in folders, but genuine orientation from position alone
2. **The 4 vertices feel necessary, not assigned** — removing any one would break the conceptual integrity of the domain
3. **The router is always at the self-similar address** — never guessed, always derived
4. **Depth scales without decay** — a subdivision at any depth looks like a subdivision at any other depth

If the 4 directions feel like arbitrary buckets — go back to the polarity split. Find the minimal polarity whose union IS the domain. The split will be obvious when found.

If the router is not at the self-similar vertex — something has been misnamed. The geometry demands it be there.

---

## Compression

Every file occupies a specific position in an infinite recursive tetrahedral lattice. The address encodes the position. The self-similar vertex is always the router. Routers are maps, not implementations — read them first, descend only when needed. Add content by navigating to the correct depth, subdivide by creating 3 children + promoting the same-direction child to router. The structure is self-similar at every scale: what is true at depth 1 is true at depth 7. There is no hierarchy — only the same geometry at increasing resolution.
