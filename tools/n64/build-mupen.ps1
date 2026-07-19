[CmdletBinding()]
param(
    [string]$SourceDir,
    [string]$OutputDir
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $SourceDir) {
    $SourceDir = Join-Path $PSScriptRoot '..\..\.cache\n64\mupen64plus-web-src-v2'
}
if (-not $OutputDir) {
    $OutputDir = Join-Path $PSScriptRoot '..\..\artifacts\n64\mupen64plus-web-1.5.7-baseline'
}

$emsdkImage = 'emscripten/emsdk:3.1.25'
$initialMemoryBytes = 64 * 1024 * 1024
$SourceDir = [System.IO.Path]::GetFullPath($SourceDir)
$OutputDir = [System.IO.Path]::GetFullPath($OutputDir)

& (Join-Path $PSScriptRoot 'bootstrap-mupen.ps1') -SourceDir $SourceDir

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw 'Docker Desktop is required to build the pinned N64 core toolchain.'
}

$previousErrorActionPreference = $ErrorActionPreference
$ErrorActionPreference = 'SilentlyContinue'
docker info --format '{{.ServerVersion}}' 2>$null | Out-Null
$dockerInfoExitCode = $LASTEXITCODE
$ErrorActionPreference = $previousErrorActionPreference
if ($dockerInfoExitCode -ne 0) {
    throw 'Docker Desktop is installed but its Linux engine is not running.'
}

$mount = "type=bind,source=$SourceDir,target=/src"
$buildCommand = "npm install --prefix /tmp/n64-build-tools --no-save --no-audit --no-fund yargs@17.2.0 && NODE_PATH=/tmp/n64-build-tools/node_modules make web config=release video=rice OPT_LEVEL=-O2 INITIAL_MEMORY=$initialMemoryBytes"
docker run --rm --mount $mount --workdir /src $emsdkImage bash -lc $buildCommand
if ($LASTEXITCODE -ne 0) { throw 'The pinned Mupen web build failed.' }

$webOutput = Join-Path $SourceDir 'bin\web'
if (-not (Test-Path (Join-Path $webOutput 'main.js'))) {
    throw "Build completed without the expected web runtime: $webOutput"
}

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
Copy-Item (Join-Path $webOutput '*') $OutputDir -Recurse -Force

$manifest = [ordered]@{
    sourceCommit = '7f0ebbf78c16da0d41fe80f0e98f17523d4bf793'
    emsdkImage = $emsdkImage
    initialMemoryBytes = $initialMemoryBytes
    buildCommand = $buildCommand
    builtAt = (Get-Date).ToUniversalTime().ToString('o')
}
$manifest | ConvertTo-Json | Set-Content (Join-Path $OutputDir 'h5-nes-build.json') -Encoding UTF8

$esbuild = Join-Path $PSScriptRoot '..\..\node_modules\.bin\esbuild.cmd'
if (-not (Test-Path $esbuild)) {
    throw 'Project dependencies are required to bundle the rebuilt N64 browser runtime.'
}
$emscriptenModule = Get-ChildItem $OutputDir -Filter 'index.*.js' | Select-Object -First 1
if (-not $emscriptenModule) { throw 'Rebuilt Emscripten JavaScript module was not found.' }
$commonJsModuleName = [System.IO.Path]::ChangeExtension($emscriptenModule.Name, '.cjs')
Copy-Item $emscriptenModule.FullName (Join-Path $OutputDir $commonJsModuleName) -Force
$mainSource = Get-Content (Join-Path $OutputDir 'main.js') -Raw
$mainSource = $mainSource.Replace(
    "import createModule from `"./$($emscriptenModule.Name)`"",
    "import createModule from `"./$commonJsModuleName`""
)
$bundleEntry = Join-Path $OutputDir 'main.bundle-entry.js'
Set-Content $bundleEntry $mainSource -Encoding UTF8
$bundleOutput = Join-Path $OutputDir 'main.bundle.js'
& $esbuild $bundleEntry --bundle --format=esm --platform=browser "--outfile=$bundleOutput"
if ($LASTEXITCODE -ne 0) { throw 'Failed to bundle the rebuilt N64 JavaScript runtime.' }

Write-Host "N64 baseline artifact ready at $OutputDir"
