[CmdletBinding()]
param(
    [string]$SourceDir
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $SourceDir) {
    $SourceDir = Join-Path $PSScriptRoot '..\..\.cache\n64\mupen64plus-web-src-v2'
}

$repository = 'https://github.com/cheinr/mupen64plus-web.git'
$commit = '7f0ebbf78c16da0d41fe80f0e98f17523d4bf793'
$patchDir = Join-Path $PSScriptRoot 'patches'
$SourceDir = [System.IO.Path]::GetFullPath($SourceDir)

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    throw 'Git is required to bootstrap the N64 core source.'
}

if (-not (Test-Path (Join-Path $SourceDir '.git'))) {
    if (Test-Path $SourceDir) {
        throw "Source directory exists but is not a Git repository: $SourceDir"
    }

    New-Item -ItemType Directory -Force -Path (Split-Path $SourceDir -Parent) | Out-Null
    git clone --filter=blob:none --no-checkout $repository $SourceDir
    if ($LASTEXITCODE -ne 0) { throw 'Failed to clone mupen64plus-web.' }
    git -C $SourceDir config core.protectNTFS false
    git -C $SourceDir sparse-checkout init --no-cone
    git -C $SourceDir sparse-checkout set --no-cone '/*' '!/img/'
    if ($LASTEXITCODE -ne 0) { throw 'Failed to configure the Windows-compatible sparse checkout.' }
    git -C $SourceDir checkout --detach $commit
    if ($LASTEXITCODE -ne 0) { throw "Failed to check out Mupen commit $commit." }
}

$actualCommit = (git -C $SourceDir rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $actualCommit -ne $commit) {
    throw "Expected Mupen commit $commit but found $actualCommit. Existing source was not modified."
}

git -C $SourceDir config 'url.https://github.com/.insteadOf' 'git@github.com:'
git -C $SourceDir submodule sync --recursive
$submoduleUrls = git -C $SourceDir config --file .gitmodules --get-regexp '^submodule\..*\.url$'
foreach ($entry in $submoduleUrls) {
    $key, $url = $entry -split '\s+', 2
    if ($url.StartsWith('git@github.com:')) {
        $url = 'https://github.com/' + $url.Substring('git@github.com:'.Length)
    }
    git -C $SourceDir config $key $url
    if ($LASTEXITCODE -ne 0) { throw "Failed to configure HTTPS URL for $key." }
}
git -C $SourceDir submodule update --init --recursive
if ($LASTEXITCODE -ne 0) { throw 'Failed to initialize the pinned Mupen submodules.' }

function Apply-Patches([string]$RepositoryDir, [string]$RepositoryPatchDir) {
    foreach ($patch in Get-ChildItem $RepositoryPatchDir -Filter '*.patch' | Sort-Object Name) {
        $previousErrorActionPreference = $ErrorActionPreference
        $ErrorActionPreference = 'SilentlyContinue'
        git -C $RepositoryDir apply --recount --unidiff-zero --reverse --check $patch.FullName 2>$null
        $reverseCheckExitCode = $LASTEXITCODE
        $ErrorActionPreference = $previousErrorActionPreference
        if ($reverseCheckExitCode -eq 0) {
            Write-Host "Patch already applied: $($patch.Name)"
            continue
        }

        $ErrorActionPreference = 'SilentlyContinue'
        git -C $RepositoryDir apply --recount --unidiff-zero --check $patch.FullName
        $applyCheckExitCode = $LASTEXITCODE
        $ErrorActionPreference = $previousErrorActionPreference
        if ($applyCheckExitCode -ne 0) { throw "Patch does not apply cleanly: $($patch.Name)" }
        git -C $RepositoryDir apply --recount --unidiff-zero $patch.FullName
        if ($LASTEXITCODE -ne 0) { throw "Failed to apply patch: $($patch.Name)" }
        Write-Host "Applied patch: $($patch.Name)"
    }
}

if (Test-Path $patchDir) {
    Apply-Patches $SourceDir $patchDir
    foreach ($submodulePatchDir in Get-ChildItem $patchDir -Directory | Sort-Object Name) {
        $submoduleDir = Join-Path $SourceDir $submodulePatchDir.Name
        if (-not (Test-Path (Join-Path $submoduleDir '.git'))) {
            throw "Patch directory does not match an initialized submodule: $($submodulePatchDir.Name)"
        }
        Apply-Patches $submoduleDir $submodulePatchDir.FullName
    }
}

Write-Host "N64 core source ready at $SourceDir"
Write-Host "Pinned upstream commit: $commit"
