[CmdletBinding()]
param(
    [string]$Configuration = "Release"
)

$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$Project = Join-Path $Root "src\Ativelo.Agent\Ativelo.Agent.csproj"
$Publish = Join-Path $Root "publish"

if (Test-Path $Publish) {
    Remove-Item -Path $Publish -Recurse -Force
}

dotnet publish $Project `
    -c $Configuration `
    -r win-x64 `
    --self-contained true `
    -p:PublishSingleFile=true `
    -p:EnableCompressionInSingleFile=true `
    -o $Publish

if ($LASTEXITCODE -ne 0) {
    throw "Falha no publish do agente."
}

Write-Host "Agente publicado em: $Publish" -ForegroundColor Green