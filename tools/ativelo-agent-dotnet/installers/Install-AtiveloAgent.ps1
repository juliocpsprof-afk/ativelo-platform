#requires -RunAsAdministrator
[CmdletBinding()]
param(
    [string]$InstallPath = "C:\Program Files\AtiveloAgent",
    [string]$ServiceName = "AtiveloAgent",
    [string]$DisplayName = "Ativelo Agent",
    [string]$AgentId,
    [string]$AgentSecret,
    [string]$ApiBaseUrl = "https://ativelo-api.ativeloapp.workers.dev"
)

$ErrorActionPreference = "Stop"

if (-not $AgentId) {
    throw "Informe -AgentId."
}

if (-not $AgentSecret) {
    throw "Informe -AgentSecret."
}

$SourceExe = Join-Path $PSScriptRoot "..\publish\Ativelo.Agent.exe"

if (-not (Test-Path $SourceExe)) {
    throw "Executavel publicado nao encontrado: $SourceExe"
}

New-Item -ItemType Directory -Path $InstallPath -Force | Out-Null
Copy-Item -Path (Join-Path $PSScriptRoot "..\publish\*") -Destination $InstallPath -Recurse -Force

$ProtectedSecret = & (Join-Path $InstallPath "Ativelo.Agent.exe") --protect-secret $AgentSecret

$ConfigPath = Join-Path $InstallPath "appsettings.json"

$Config = Get-Content $ConfigPath -Raw | ConvertFrom-Json
$Config.AtiveloAgent.AgentId = $AgentId
$Config.AtiveloAgent.AgentSecretProtected = $ProtectedSecret
$Config.AtiveloAgent.ApiBaseUrl = $ApiBaseUrl

$Config |
    ConvertTo-Json -Depth 20 |
    Set-Content -Path $ConfigPath -Encoding UTF8

$Existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue

if ($Existing) {
    Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
    sc.exe delete $ServiceName | Out-Null
    Start-Sleep -Seconds 2
}

$ExePath = Join-Path $InstallPath "Ativelo.Agent.exe"

sc.exe create $ServiceName binPath= "`"$ExePath`"" start= auto DisplayName= "`"$DisplayName`"" | Out-Null
sc.exe failure $ServiceName reset= 60 actions= restart/60000/restart/60000/restart/60000 | Out-Null

Start-Service -Name $ServiceName

Write-Host "Servico $ServiceName instalado e iniciado." -ForegroundColor Green