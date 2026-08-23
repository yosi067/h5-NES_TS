[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$workspace = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$dockerfile = Join-Path $PSScriptRoot 'Dockerfile'
$image = 'h5-nes-fceumm-build:emscripten-3.1.74'

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw 'Docker is required to build the corrected FCEUmm core.'
}

$ErrorActionPreference = 'Continue'
& docker info --format '{{.ServerVersion}}' *> $null
$dockerInfoExitCode = $LASTEXITCODE
$ErrorActionPreference = 'Stop'
if ($dockerInfoExitCode -ne 0) {
  throw 'Docker is installed but its Linux engine is not available.'
}

& docker build --platform linux/amd64 --tag $image --file $dockerfile $PSScriptRoot
if ($LASTEXITCODE -ne 0) {
  throw 'The FCEUmm build image could not be created.'
}

$mount = "type=bind,source=$workspace,target=/workspace"
& docker run --rm --platform linux/amd64 --mount $mount $image
if ($LASTEXITCODE -ne 0) {
  throw 'The corrected FCEUmm core build failed.'
}