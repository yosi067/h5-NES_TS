# Corrected FCEUmm core

The installed FCEUmm core maps the five `fceumm_apu_*` channel bits
incorrectly. This directory keeps the source patch and the reproducible build
inputs for a corrected replacement core.

Run the build from the repository root:

```powershell
npm run fceumm:build
```

The command requires Docker Desktop with its Linux engine enabled. It writes
the four EmulatorJS data bundles, a report, and a checksum manifest to
`artifacts/emulatorjs/fceumm/`.

The build pins:

- FCEUmm source revision `e1630de02074801eb96f3bc4ff33f69df9554c69`.
- RetroArch linker revision `31ccb892522a7b0e914dc71731f0834c6495a218`.
- EmulatorJS runtime revision `e150dc0491ae747028919fb82d6598954976ede6` (`v4.2.3`).
- EmulatorJS build recipe revision `76e0858f2212ae8612b2a0725b88a80f05d0ca22`.
- Emscripten `3.1.74`.

The archive metadata declares `minimumEJSVersion` `4.2.2`, which is
compatible with the application’s EmulatorJS `4.2.3` runtime. Until the
artifact directory contains a complete generated set, Vite continues to use
the installed package core.