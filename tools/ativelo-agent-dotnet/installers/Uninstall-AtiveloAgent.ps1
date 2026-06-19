#requires -RunAsAdministrator
[CmdletBinding()]
param(
    [string]$ServiceName = "AtiveloAgent",
    [string]$InstallPath = "C:\Program Files\AtiveloAgent",
    [switch]$KeepData
)

$ErrorActionPreference = "Stop"

$Existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue

if ($Existing) {
    Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
    sc.exe delete $ServiceName | Out-Null
    Start-Sleep -Seconds 2
}

if (Test-Path $InstallPath) {
    Remove-Item -Path $InstallPath -Recurse -Force
}

if (-not $KeepData) {
    $DataPath = "C:\ProgramData\AtiveloAgent"

    if (Test-Path $DataPath) {
        Remove-Item -Path $DataPath -Recurse -Force
    }
}

Write-Host "Servico $ServiceName removido." -ForegroundColor Green