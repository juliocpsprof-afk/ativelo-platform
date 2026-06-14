param(
    [ValidateSet("Install", "Run", "Uninstall", "Status", "Update")]
    [string]$Action = "Run",

    [string]$ProjectUrl = "",
    [string]$EnrollmentToken = "",
    [string]$BootstrapUrl = "",
    [int]$IntervalHours = 4
)

$ErrorActionPreference = "Stop"
$AgentVersion = "1.1.0"
$BaseDirectory = Join-Path $env:ProgramData "AtiveloAgent"
$InstalledScript = Join-Path $BaseDirectory "AtiveloAgent.ps1"
$ConfigPath = Join-Path $BaseDirectory "config.json"
$LogPath = Join-Path $BaseDirectory "agent.log"
$TaskName = "Ativelo Inventory Agent"

function Write-AgentLog {
    param([string]$Message)

    if (-not (Test-Path $BaseDirectory)) {
        New-Item -ItemType Directory -Path $BaseDirectory -Force | Out-Null
    }

    if ((Test-Path $LogPath) -and (Get-Item $LogPath).Length -gt 2MB) {
        $Archive = Join-Path $BaseDirectory "agent.previous.log"
        Move-Item $LogPath $Archive -Force
    }

    $Line = "{0} {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
    Add-Content -Path $LogPath -Value $Line -Encoding UTF8
}

function Test-Administrator {
    $Identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $Principal = New-Object Security.Principal.WindowsPrincipal($Identity)

    return $Principal.IsInRole(
        [Security.Principal.WindowsBuiltInRole]::Administrator
    )
}

function Save-AgentConfig {
    param([hashtable]$Config)

    New-Item -ItemType Directory -Path $BaseDirectory -Force | Out-Null

    $Config |
        ConvertTo-Json -Depth 6 |
        Set-Content -Path $ConfigPath -Encoding UTF8
}

function Get-AgentConfig {
    if (-not (Test-Path $ConfigPath)) {
        return $null
    }

    return Get-Content $ConfigPath -Raw | ConvertFrom-Json
}

function Get-DeviceUid {
    $MachineGuid = (
        Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\Cryptography"
    ).MachineGuid

    $Bios = Get-CimInstance Win32_BIOS
    $RawValue = "{0}|{1}|{2}" -f $MachineGuid, $Bios.SerialNumber, $env:COMPUTERNAME

    $Sha = [System.Security.Cryptography.SHA256]::Create()

    try {
        $Bytes = [System.Text.Encoding]::UTF8.GetBytes($RawValue)
        $Hash = $Sha.ComputeHash($Bytes)

        return ([BitConverter]::ToString($Hash)).Replace("-", "").ToLowerInvariant()
    }
    finally {
        $Sha.Dispose()
    }
}

function Get-InstalledSoftware {
    $RegistryPaths = @(
        "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*",
        "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*"
    )

    $Items = foreach ($RegistryPath in $RegistryPaths) {
        Get-ItemProperty $RegistryPath -ErrorAction SilentlyContinue |
            Where-Object { -not [string]::IsNullOrWhiteSpace($_.DisplayName) } |
            Select-Object DisplayName, DisplayVersion, Publisher
    }

    return @(
        $Items |
            Sort-Object DisplayName, DisplayVersion -Unique |
            Select-Object -First 500
    )
}

function Get-AgentPayload {
    $Computer = Get-CimInstance Win32_ComputerSystem
    $Bios = Get-CimInstance Win32_BIOS
    $OperatingSystem = Get-CimInstance Win32_OperatingSystem
    $Processors = @(Get-CimInstance Win32_Processor)
    $Disks = @(
        Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" |
            Select-Object DeviceID, VolumeName, FileSystem, Size, FreeSpace
    )
    $Adapters = @(
        Get-CimInstance Win32_NetworkAdapterConfiguration |
            Where-Object { $_.IPEnabled } |
            Select-Object Description, MACAddress, IPAddress, DefaultIPGateway, DHCPEnabled
    )

    $PrimaryAdapter = $Adapters |
        Where-Object {
            $_.IPAddress -and
            ($_.IPAddress | Where-Object { $_ -match "^\d{1,3}(\.\d{1,3}){3}$" })
        } |
        Select-Object -First 1

    $PrimaryIp = $null

    if ($PrimaryAdapter) {
        $PrimaryIp = $PrimaryAdapter.IPAddress |
            Where-Object { $_ -match "^\d{1,3}(\.\d{1,3}){3}$" } |
            Select-Object -First 1
    }

    $Hardware = [ordered]@{
        processor = @(
            $Processors | ForEach-Object {
                [ordered]@{
                    name = $_.Name
                    cores = $_.NumberOfCores
                    logical_processors = $_.NumberOfLogicalProcessors
                    max_clock_mhz = $_.MaxClockSpeed
                }
            }
        )
        total_memory_bytes = [int64]$Computer.TotalPhysicalMemory
        disks = @(
            $Disks | ForEach-Object {
                [ordered]@{
                    device = $_.DeviceID
                    label = $_.VolumeName
                    file_system = $_.FileSystem
                    size_bytes = [int64]$_.Size
                    free_bytes = [int64]$_.FreeSpace
                }
            }
        )
        bios = [ordered]@{
            manufacturer = $Bios.Manufacturer
            version = $Bios.SMBIOSBIOSVersion
            release_date = $Bios.ReleaseDate
        }
    }

    $Network = [ordered]@{
        primary_ip = $PrimaryIp
        primary_mac = if ($PrimaryAdapter) { $PrimaryAdapter.MACAddress } else { $null }
        adapters = @(
            $Adapters | ForEach-Object {
                [ordered]@{
                    description = $_.Description
                    mac_address = $_.MACAddress
                    ip_addresses = @($_.IPAddress)
                    gateways = @($_.DefaultIPGateway)
                    dhcp_enabled = [bool]$_.DHCPEnabled
                }
            }
        )
    }

    $Software = [ordered]@{
        installed_programs = @(Get-InstalledSoftware)
        powershell_version = $PSVersionTable.PSVersion.ToString()
        last_boot_time = $OperatingSystem.LastBootUpTime
    }

    return [ordered]@{
        device_uid = Get-DeviceUid
        agent_version = $AgentVersion
        collected_at = (Get-Date).ToUniversalTime().ToString("o")
        system = [ordered]@{
            hostname = $env:COMPUTERNAME
            manufacturer = $Computer.Manufacturer
            model = $Computer.Model
            serial_number = $Bios.SerialNumber
            os_name = $OperatingSystem.Caption
            os_version = $OperatingSystem.Version
            architecture = $OperatingSystem.OSArchitecture
            last_ip = $PrimaryIp
        }
        hardware = $Hardware
        software = $Software
        network = $Network
        metadata = [ordered]@{
            user_domain = $env:USERDOMAIN
            time_zone = (Get-TimeZone).Id
        }
    }
}

function Send-AgentInventory {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Url,

        [Parameter(Mandatory = $true)]
        [string]$Token
    )

    $Endpoint = $Url.TrimEnd("/") + "/functions/v1/ingest-inventory"
    $Payload = Get-AgentPayload

    $Body = @{
        mode = "agent"
        token = $Token
        payload = $Payload
    } | ConvertTo-Json -Depth 12

    $LastError = $null

    foreach ($Attempt in 1..3) {
        try {
            $Response = Invoke-RestMethod `
                -Uri $Endpoint `
                -Method Post `
                -ContentType "application/json" `
                -Body $Body `
                -TimeoutSec 120

            if (-not $Response.ok) {
                throw "The Ativelo endpoint did not confirm the inventory."
            }

            Write-AgentLog "Inventory sent successfully."
            return
        }
        catch {
            $LastError = $_
            Write-AgentLog (
                "Inventory attempt {0} failed: {1}" -f
                $Attempt,
                $_.Exception.Message
            )

            if ($Attempt -lt 3) {
                Start-Sleep -Seconds ([math]::Pow(2, $Attempt))
            }
        }
    }

    throw $LastError
}

function Download-LatestAgent {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Url
    )

    $ArtifactUrl = $Url.TrimEnd("/") + "?artifact=agent"
    $TemporaryFile = Join-Path $env:TEMP (
        "AtiveloAgent-" + [guid]::NewGuid().ToString("N") + ".ps1"
    )

    try {
        Invoke-WebRequest `
            -UseBasicParsing `
            -Uri $ArtifactUrl `
            -OutFile $TemporaryFile `
            -TimeoutSec 120

        if (
            -not (Test-Path $TemporaryFile) -or
            (Get-Item $TemporaryFile).Length -lt 1000
        ) {
            throw "The downloaded agent file is invalid."
        }

        return $TemporaryFile
    }
    catch {
        if (Test-Path $TemporaryFile) {
            Remove-Item $TemporaryFile -Force
        }

        throw
    }
}

function Update-Agent {
    $Config = Get-AgentConfig

    $EffectiveBootstrapUrl = if (
        -not [string]::IsNullOrWhiteSpace($BootstrapUrl)
    ) {
        $BootstrapUrl
    }
    elseif ($Config -and $Config.bootstrap_url) {
        [string]$Config.bootstrap_url
    }
    else {
        ""
    }

    if ([string]::IsNullOrWhiteSpace($EffectiveBootstrapUrl)) {
        throw "Bootstrap URL is not configured."
    }

    $DownloadedFile = Download-LatestAgent -Url $EffectiveBootstrapUrl

    try {
        New-Item -ItemType Directory -Path $BaseDirectory -Force | Out-Null
        Copy-Item $DownloadedFile $InstalledScript -Force
        Write-AgentLog "Agent updated successfully."
        Write-Host "Ativelo agent updated successfully." -ForegroundColor Green
    }
    finally {
        if (Test-Path $DownloadedFile) {
            Remove-Item $DownloadedFile -Force
        }
    }
}

function Test-AgentUpdate {
    param([object]$Config)

    if (
        -not $Config -or
        [string]::IsNullOrWhiteSpace([string]$Config.bootstrap_url)
    ) {
        return
    }

    $LastCheck = $null

    if ($Config.last_update_check) {
        try {
            $LastCheck = [datetime]$Config.last_update_check
        }
        catch {
            $LastCheck = $null
        }
    }

    if ($LastCheck -and $LastCheck -gt (Get-Date).AddHours(-24)) {
        return
    }

    try {
        $ManifestUrl = (
            [string]$Config.bootstrap_url
        ).TrimEnd("/") + "?artifact=manifest"

        $Manifest = Invoke-RestMethod `
            -Uri $ManifestUrl `
            -Method Get `
            -TimeoutSec 30

        Save-AgentConfig -Config @{
            project_url = [string]$Config.project_url
            enrollment_token = [string]$Config.enrollment_token
            interval_hours = [int]$Config.interval_hours
            bootstrap_url = [string]$Config.bootstrap_url
            last_update_check = (Get-Date).ToUniversalTime().ToString("o")
        }

        if ([version]$Manifest.version -gt [version]$AgentVersion) {
            Write-AgentLog (
                "New agent version available: " + $Manifest.version
            )
            Update-Agent
        }
    }
    catch {
        Write-AgentLog (
            "Update check failed: " + $_.Exception.Message
        )
    }
}

function Install-Agent {
    if (-not (Test-Administrator)) {
        throw "Run PowerShell as Administrator to install the agent."
    }

    if ([string]::IsNullOrWhiteSpace($ProjectUrl)) {
        throw "ProjectUrl is required."
    }

    if ([string]::IsNullOrWhiteSpace($EnrollmentToken)) {
        throw "EnrollmentToken is required."
    }

    if ($IntervalHours -lt 1 -or $IntervalHours -gt 24) {
        throw "IntervalHours must be between 1 and 24."
    }

    New-Item -ItemType Directory -Path $BaseDirectory -Force | Out-Null
    Copy-Item $PSCommandPath $InstalledScript -Force

    Save-AgentConfig -Config @{
        project_url = $ProjectUrl.TrimEnd("/")
        enrollment_token = $EnrollmentToken
        interval_hours = $IntervalHours
        bootstrap_url = $BootstrapUrl.TrimEnd("/")
        last_update_check = (Get-Date).ToUniversalTime().ToString("o")
    }

    $TaskCommand = (
        'powershell.exe -NoProfile -ExecutionPolicy Bypass ' +
        '-File "{0}" -Action Run'
    ) -f $InstalledScript

    & schtasks.exe /Create `
        /TN $TaskName `
        /TR $TaskCommand `
        /SC HOURLY `
        /MO $IntervalHours `
        /RU SYSTEM `
        /RL HIGHEST `
        /F | Out-Null

    Send-AgentInventory -Url $ProjectUrl -Token $EnrollmentToken

    Write-Host ""
    Write-Host "Ativelo agent installed successfully." -ForegroundColor Green
    Write-Host "Scheduled task: $TaskName" -ForegroundColor Cyan
    Write-Host "Folder: $BaseDirectory" -ForegroundColor Cyan
}

function Run-Agent {
    $Config = Get-AgentConfig

    if (-not $Config) {
        if (
            [string]::IsNullOrWhiteSpace($ProjectUrl) -or
            [string]::IsNullOrWhiteSpace($EnrollmentToken)
        ) {
            throw "Agent configuration not found."
        }

        Send-AgentInventory -Url $ProjectUrl -Token $EnrollmentToken
        return
    }

    Test-AgentUpdate -Config $Config

    Send-AgentInventory `
        -Url ([string]$Config.project_url) `
        -Token ([string]$Config.enrollment_token)
}

function Show-AgentStatus {
    $Config = Get-AgentConfig
    $Task = & schtasks.exe /Query /TN $TaskName /FO LIST /V 2>$null
    $TaskExists = $LASTEXITCODE -eq 0

    Write-Host ""
    Write-Host "Ativelo Inventory Agent" -ForegroundColor Cyan
    Write-Host ("Version: {0}" -f $AgentVersion)
    Write-Host ("Installed: {0}" -f (Test-Path $InstalledScript))
    Write-Host ("Configuration: {0}" -f (Test-Path $ConfigPath))
    Write-Host (
        "Scheduled task: {0}" -f
        $(if ($TaskExists) { "Present" } else { "Missing" })
    )

    if ($Config) {
        Write-Host ("Project: {0}" -f $Config.project_url)
        Write-Host ("Interval: {0} hour(s)" -f $Config.interval_hours)
    }

    if ($Task) {
        Write-Host ""
        $Task |
            Select-Object -First 18 |
            ForEach-Object { Write-Host $_ }
    }

    if (Test-Path $LogPath) {
        Write-Host ""
        Write-Host "Recent log entries:" -ForegroundColor Yellow
        Get-Content $LogPath -Tail 12
    }
}

function Uninstall-Agent {
    if (-not (Test-Administrator)) {
        throw "Run PowerShell as Administrator to uninstall the agent."
    }

    & schtasks.exe /Delete /TN $TaskName /F 2>$null | Out-Null

    if (Test-Path $BaseDirectory) {
        Remove-Item $BaseDirectory -Recurse -Force
    }

    Write-Host "Ativelo agent removed." -ForegroundColor Green
}

try {
    switch ($Action) {
        "Install" {
            Install-Agent
        }
        "Run" {
            Run-Agent
        }
        "Status" {
            Show-AgentStatus
        }
        "Update" {
            Update-Agent
        }
        "Uninstall" {
            Uninstall-Agent
        }
    }
}
catch {
    Write-AgentLog ("ERROR: " + $_.Exception.Message)
    throw
}
