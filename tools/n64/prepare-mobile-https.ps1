[CmdletBinding()]
param()
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$directory = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../.cache/mobile-tls'))
New-Item -ItemType Directory -Force $directory | Out-Null
$mkcert = Join-Path $directory 'mkcert.exe'
if (-not (Test-Path $mkcert)) {
    Invoke-WebRequest 'https://github.com/FiloSottile/mkcert/releases/download/v1.4.4/mkcert-v1.4.4-windows-amd64.exe' -OutFile $mkcert
}
$addresses = @(Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
    $_.IPAddress -notmatch '^(127\.|169\.254\.)' -and $_.InterfaceAlias -notmatch 'vEthernet|Loopback'
} | Select-Object -ExpandProperty IPAddress)
if ($addresses.Count -eq 0) { throw 'No LAN IPv4 address found.' }
$previousRoot = $env:CAROOT
try {
    $env:CAROOT = $directory
    # Generate a local CA and leaf; never install trust or request elevation.
    & $mkcert -cert-file (Join-Path $directory 'server.pem') -key-file (Join-Path $directory 'server-key.pem') localhost 127.0.0.1 @addresses
    if ($LASTEXITCODE -ne 0) { throw 'Certificate generation failed.' }
} finally { $env:CAROOT = $previousRoot }
Write-Host "Public CA to transfer to iPhone: $(Join-Path $directory 'rootCA.pem')"
Write-Host 'Never transfer rootCA-key.pem or server-key.pem. Trust the CA manually on the test phone only.'
foreach ($address in $addresses) { Write-Host "https://${address}:5173/?n64AudioDiagnostics=1" }