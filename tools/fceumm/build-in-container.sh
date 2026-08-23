#!/usr/bin/env bash
set -Eeuo pipefail

readonly WORKSPACE="${WORKSPACE:-/workspace}"
readonly BUILD_ROOT="${BUILD_ROOT:-/tmp/h5-nes-fceumm-build}"
readonly OUTPUT_DIR="$WORKSPACE/artifacts/emulatorjs/fceumm"
readonly FCEUMM_REPO="https://github.com/EmulatorJS/libretro-fceumm.git"
readonly FCEUMM_REVISION="e1630de02074801eb96f3bc4ff33f69df9554c69"
readonly RETROARCH_REPO="https://github.com/EmulatorJS/RetroArch.git"
readonly RETROARCH_REVISION="31ccb892522a7b0e914dc71731f0834c6495a218"
readonly EMULATORJS_REPO="https://github.com/EmulatorJS/EmulatorJS.git"
readonly EMULATORJS_REVISION="e150dc0491ae747028919fb82d6598954976ede6"
readonly BUILD_RECIPE_REVISION="76e0858f2212ae8612b2a0725b88a80f05d0ca22"
readonly EMSCRIPTEN_VERSION="3.1.74"
readonly JOBS="${JOBS:-$(nproc)}"
readonly PATCH_FILE="$WORKSPACE/tools/fceumm/patches/0001-fix-apu-channel-mask.patch"
readonly CORE_JSON="$WORKSPACE/tools/fceumm/core.json"
readonly BUILD_JSON="$WORKSPACE/tools/fceumm/build.json"
readonly BUILD_START="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
readonly LINUX_PATCH_FILE="$BUILD_ROOT/fceumm-channel-mask.patch"

clone_at() {
  local repository="$1"
  local revision="$2"
  local directory="$3"

  mkdir -p "$directory"
  git -C "$directory" init --quiet
  git -C "$directory" remote add origin "$repository"
  git -C "$directory" fetch --quiet --depth 1 origin "$revision"
  git -C "$directory" checkout --quiet --detach FETCH_HEAD
  git -C "$directory" submodule update --init --recursive
}

build_variant() {
  local threads="$1"
  local legacy="$2"
  local linker_options=(--clean)
  local make_options=(platform=emscripten)
  local suffix=''

  if [[ "$threads" == '1' ]]; then
    linker_options+=(--threads)
    make_options+=(EMULATORJS_THREADS=1)
    suffix='-thread'
  fi
  if [[ "$legacy" == '1' ]]; then
    linker_options+=(--legacy)
    make_options+=(EMULATORJS_LEGACY=1)
    suffix+="-legacy"
  fi

  rm -f "$LINKER_DIR"/*.bc
  rm -f "$EMULATORJS_DIR/data/cores/fceumm-wasm.data"
  rm -f "$EMULATORJS_DIR/data/cores/fceumm-thread-wasm.data"
  rm -f "$EMULATORJS_DIR/data/cores/fceumm-legacy-wasm.data"
  rm -f "$EMULATORJS_DIR/data/cores/fceumm-thread-legacy-wasm.data"

  (
    cd "$FCEUMM_DIR"
    emmake make -f Makefile.libretro clean
    emmake make -j"$JOBS" -f Makefile.libretro "${make_options[@]}"
  )

  mapfile -t bitcode_files < <(find "$FCEUMM_DIR" -maxdepth 1 -type f -name '*_libretro_emscripten.bc' -print)
  if [[ "${#bitcode_files[@]}" -ne 1 ]]; then
    echo "Expected exactly one FCEUmm bitcode file, found ${#bitcode_files[@]}." >&2
    exit 1
  fi
  cp "${bitcode_files[0]}" "$LINKER_DIR/"

  (
    cd "$LINKER_DIR"
    emmake ./build-emulatorjs.sh "${linker_options[@]}"
  )

  local archive="$EMULATORJS_DIR/data/cores/fceumm${suffix}-wasm.data"
  if [[ ! -s "$archive" ]]; then
    echo "Linker did not produce $archive." >&2
    exit 1
  fi
  (
    cd "$BUILD_ROOT"
    7z a -t7z "$archive" core.json license.txt build.json > /dev/null
  )
  cp "$archive" "$STAGE/$(basename "$archive")"
}

assert_archive() {
  local archive="$1"
  local listing
  listing="$(7z l -slt "$archive")"

  for required in core.json build.json license.txt; do
    if ! grep -Fq "Path = $required" <<< "$listing"; then
      echo "$archive is missing $required." >&2
      exit 1
    fi
  done
  if ! grep -Eq '^Path = .*\.wasm$' <<< "$listing"; then
    echo "$archive is missing a WASM member." >&2
    exit 1
  fi
  if ! grep -Eq '^Path = .*\.js$' <<< "$listing"; then
    echo "$archive is missing a JavaScript member." >&2
    exit 1
  fi
}

rm -rf "$BUILD_ROOT"
mkdir -p "$BUILD_ROOT"
mkdir -p "$BUILD_ROOT/RetroArch"

clone_at "$RETROARCH_REPO" "$RETROARCH_REVISION" "$BUILD_ROOT/RetroArch"
clone_at "$EMULATORJS_REPO" "$EMULATORJS_REVISION" "$BUILD_ROOT/EmulatorJS"
clone_at "$FCEUMM_REPO" "$FCEUMM_REVISION" "$BUILD_ROOT/fceumm"

FCEUMM_DIR="$BUILD_ROOT/fceumm"
LINKER_DIR="$BUILD_ROOT/RetroArch/emulatorjs"
EMULATORJS_DIR="$BUILD_ROOT/EmulatorJS"
STAGE="$BUILD_ROOT/stage"

tr -d '\r' < "$PATCH_FILE" > "$LINUX_PATCH_FILE"
git -C "$FCEUMM_DIR" apply --check "$LINUX_PATCH_FILE"
git -C "$FCEUMM_DIR" apply "$LINUX_PATCH_FILE"

grep -Fq 'FSettings.SquareVolume[0] = (chan & 0x01)' \
  "$FCEUMM_DIR/src/drivers/libretro/libretro.c"
grep -Fq 'FSettings.PCMVolume       = (chan & 0x10)' \
  "$FCEUMM_DIR/src/drivers/libretro/libretro.c"
jq -e '.minimumEJSVersion == "4.2.2"' "$BUILD_JSON" > /dev/null

mkdir -p "$EMULATORJS_DIR/data/cores" "$STAGE"
cp "$CORE_JSON" "$BUILD_ROOT/core.json"
cp "$BUILD_JSON" "$BUILD_ROOT/build.json"
cp "$FCEUMM_DIR/Copying" "$BUILD_ROOT/license.txt"

build_variant 0 0
build_variant 1 0
build_variant 0 1
build_variant 1 1

for archive in "$STAGE"/*.data; do
  assert_archive "$archive"
done

BUILD_END="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
mkdir -p "$STAGE/reports"
printf '{ "core": "fceumm", "buildStart": "%s", "buildEnd": "%s", "options": {} }\n' \
  "$BUILD_START" "$BUILD_END" > "$STAGE/reports/fceumm.json"

patch_sha256="$(sha256sum "$PATCH_FILE" | cut -d ' ' -f 1)"
normal_sha256="$(sha256sum "$STAGE/fceumm-wasm.data" | cut -d ' ' -f 1)"
thread_sha256="$(sha256sum "$STAGE/fceumm-thread-wasm.data" | cut -d ' ' -f 1)"
legacy_sha256="$(sha256sum "$STAGE/fceumm-legacy-wasm.data" | cut -d ' ' -f 1)"
thread_legacy_sha256="$(sha256sum "$STAGE/fceumm-thread-legacy-wasm.data" | cut -d ' ' -f 1)"

jq -n \
  --arg core 'fceumm' \
  --arg sourceRepo "$FCEUMM_REPO" \
  --arg sourceRevision "$FCEUMM_REVISION" \
  --arg retroarchRepo "$RETROARCH_REPO" \
  --arg retroarchRevision "$RETROARCH_REVISION" \
  --arg emulatorjsRepo "$EMULATORJS_REPO" \
  --arg emulatorjsRevision "$EMULATORJS_REVISION" \
  --arg buildRecipeRevision "$BUILD_RECIPE_REVISION" \
  --arg emscriptenVersion "$EMSCRIPTEN_VERSION" \
  --arg patchSha256 "$patch_sha256" \
  --arg buildStart "$BUILD_START" \
  --arg buildEnd "$BUILD_END" \
  --arg normalSha256 "$normal_sha256" \
  --arg threadSha256 "$thread_sha256" \
  --arg legacySha256 "$legacy_sha256" \
  --arg threadLegacySha256 "$thread_legacy_sha256" \
  --slurpfile buildMetadata "$BUILD_JSON" \
  '{
    core: $core,
    source: { repository: $sourceRepo, revision: $sourceRevision },
    patchSha256: $patchSha256,
    linker: { repository: $retroarchRepo, revision: $retroarchRevision },
    runtime: { repository: $emulatorjsRepo, revision: $emulatorjsRevision },
    buildRecipeRevision: $buildRecipeRevision,
    toolchain: { emscripten: $emscriptenVersion },
    build: { start: $buildStart, end: $buildEnd, metadata: $buildMetadata[0] },
    artifacts: {
      "fceumm-wasm.data": { sha256: $normalSha256 },
      "fceumm-thread-wasm.data": { sha256: $threadSha256 },
      "fceumm-legacy-wasm.data": { sha256: $legacySha256 },
      "fceumm-thread-legacy-wasm.data": { sha256: $threadLegacySha256 }
    }
  }' > "$STAGE/manifest.json"

jq -e . "$STAGE/reports/fceumm.json" > /dev/null
jq -e . "$STAGE/manifest.json" > /dev/null

NEXT_OUTPUT="$OUTPUT_DIR.next"
rm -rf "$NEXT_OUTPUT"
mkdir -p "$NEXT_OUTPUT/reports"
cp "$STAGE"/*.data "$NEXT_OUTPUT/"
cp "$STAGE/manifest.json" "$NEXT_OUTPUT/manifest.json"
cp "$STAGE/reports/fceumm.json" "$NEXT_OUTPUT/reports/fceumm.json"
rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR/reports"
cp "$NEXT_OUTPUT"/*.data "$OUTPUT_DIR/"
cp "$NEXT_OUTPUT/manifest.json" "$OUTPUT_DIR/manifest.json"
cp "$NEXT_OUTPUT/reports/fceumm.json" "$OUTPUT_DIR/reports/fceumm.json"
rm -rf "$NEXT_OUTPUT"

echo "Published corrected FCEUmm artifacts to $OUTPUT_DIR"