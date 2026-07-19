# N64 Core Patches

Place ordered `*.patch` files in this directory. `bootstrap-mupen.ps1` applies them alphabetically to the pinned `mupen64plus-web` source and safely skips patches that are already applied.

Submodule-specific patches live under a directory named for that submodule. The bootstrapper enables Git's zero-context patch mode so small ABI-only patches can avoid Windows tab expansion; use zero-context hunks only against the pinned commit and keep them separate from larger behavioral patches.

When instrumentation extends an existing patched function or ABI, fold it into the owning ordered patch instead of adding an overlapping patch. Bootstrap detects applied patches with a reverse check, and overlapping later edits make that check ambiguous.

Generate a patch from the local source checkout with:

```powershell
git -C .cache/n64/mupen64plus-web-src-v2 diff --binary > tools/n64/patches/0001-description.patch
```

Do not edit generated runtime files in `node_modules`. The npm package remains the rollback path until a patched artifact passes the three-game device matrix.
