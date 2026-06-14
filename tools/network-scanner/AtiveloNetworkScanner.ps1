param(
    [Parameter(Mandatory = $true)]
    [string]$ProjectUrl,

    [Parameter(Mandatory = $true)]
    [string]$EnrollmentToken,

    [Parameter(Mandatory = $true)]
    [ValidatePattern("^\d{1,3}\.\d{1,3}\.\d{1,3}$")]
    [string]$SubnetPrefix,

    [int]$StartAddress = 1,
    [int]$EndAddress = 254,

    [int[]]$Ports = @(22, 80, 443, 445, 3389, 9100)
)

$ErrorActionPreference = "Stop"

function Get-ScannerUid {
    $MachineGuid = (
        Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\Cryptography"
    ).MachineGuid

    $RawValue = "{0}|{1}" -f $MachineGuid, $env:COMPUTERNAME
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

function Test-TcpPort {
    param(
        [string]$IpAddress,
        [int]$Port,
        [int]$TimeoutMilliseconds = 250
    )

    $Client = New-Object System.Net.Sockets.TcpClient

    try {
        $AsyncResult = $Client.BeginConnect(
            $IpAddress,
            $Port,
            $null,
            $null
        )

        if (-not $AsyncResult.AsyncWaitHandle.WaitOne($TimeoutMilliseconds)) {
            return $false
        }

        $Client.EndConnect($AsyncResult)
        return $true
    }
    catch {
        return $false
    }
    finally {
        $Client.Close()
    }
}

function Get-DeviceType {
    param([int[]]$OpenPorts)

    if ($OpenPorts -contains 9100) {
        return "printer"
    }

    if ($OpenPorts -contains 3389) {
        return "workstation"
    }

    if (
        ($OpenPorts -contains 22) -or
        ($OpenPorts -contains 445)
    ) {
        return "server"
    }

    if (
        ($OpenPorts -contains 80) -or
        ($OpenPorts -contains 443)
    ) {
        return "network_device"
    }

    return "unknown"
}

function Get-MacAddress {
    param([string]$IpAddress)

    try {
        $Neighbor = Get-NetNeighbor `
            -IPAddress $IpAddress `
            -ErrorAction SilentlyContinue |
            Where-Object {
                $_.LinkLayerAddress -and
                $_.LinkLayerAddress -ne "00-00-00-00-00-00"
            } |
            Select-Object -First 1

        return $Neighbor.LinkLayerAddress
    }
    catch {
        return $null
    }
}

if ($StartAddress -lt 1 -or $EndAddress -gt 254 -or $StartAddress -gt $EndAddress) {
    throw "Invalid address range."
}

$StartedAt = (Get-Date).ToUniversalTime()
$Ping = New-Object System.Net.NetworkInformation.Ping
$Devices = New-Object System.Collections.Generic.List[object]

Write-Host ""
Write-Host "Ativelo network scan" -ForegroundColor Cyan
Write-Host "Subnet: $SubnetPrefix.0/24"
Write-Host "Range: $StartAddress-$EndAddress"
Write-Host ""

try {
    for ($HostNumber = $StartAddress; $HostNumber -le $EndAddress; $HostNumber++) {
        $IpAddress = "$SubnetPrefix.$HostNumber"
        Write-Progress `
            -Activity "Scanning network" `
            -Status $IpAddress `
            -PercentComplete (
                (($HostNumber - $StartAddress) /
                    [Math]::Max(1, ($EndAddress - $StartAddress))) * 100
            )

        try {
            $Reply = $Ping.Send($IpAddress, 300)
        }
        catch {
            continue
        }

        if (
            -not $Reply -or
            $Reply.Status -ne [System.Net.NetworkInformation.IPStatus]::Success
        ) {
            continue
        }

        $Hostname = $null

        try {
            $Hostname = [System.Net.Dns]::GetHostEntry($IpAddress).HostName
        }
        catch {
        }

        $MacAddress = Get-MacAddress -IpAddress $IpAddress
        $OpenPorts = @(
            foreach ($Port in $Ports) {
                if (Test-TcpPort -IpAddress $IpAddress -Port $Port) {
                    $Port
                }
            }
        )

        $Fingerprint = if ($MacAddress) {
            $MacAddress.Replace("-", ":").ToLowerInvariant()
        }
        elseif ($Hostname) {
            "{0}:{1}" -f $Hostname.ToLowerInvariant(), $IpAddress
        }
        else {
            $IpAddress
        }

        $Devices.Add(
            [ordered]@{
                fingerprint = $Fingerprint
                ip_address = $IpAddress
                mac_address = if ($MacAddress) {
                    $MacAddress.Replace("-", ":")
                }
                else {
                    $null
                }
                hostname = $Hostname
                vendor = $null
                device_type = Get-DeviceType -OpenPorts $OpenPorts
                open_ports = @($OpenPorts)
                metadata = [ordered]@{
                    roundtrip_time_ms = $Reply.RoundtripTime
                    ttl = $Reply.Options.Ttl
                }
            }
        )

        Write-Host (
            "Found {0} {1} ports: {2}" -f
                $IpAddress,
                $Hostname,
                ($OpenPorts -join ",")
        ) -ForegroundColor Green
    }
}
finally {
    $Ping.Dispose()
    Write-Progress -Activity "Scanning network" -Completed
}

$CompletedAt = (Get-Date).ToUniversalTime()
$Payload = [ordered]@{
    scanner_device_id = Get-ScannerUid
    subnet = "$SubnetPrefix.0/24"
    started_at = $StartedAt.ToString("o")
    completed_at = $CompletedAt.ToString("o")
    devices = @($Devices)
}

$Body = @{
    mode = "discovery"
    token = $EnrollmentToken
    payload = $Payload
} | ConvertTo-Json -Depth 10

$Endpoint = $ProjectUrl.TrimEnd("/") + "/functions/v1/ingest-inventory"

$Response = Invoke-RestMethod `
    -Uri $Endpoint `
    -Method Post `
    -ContentType "application/json" `
    -Body $Body `
    -TimeoutSec 180

if (-not $Response.ok) {
    throw "The Ativelo endpoint did not confirm the scan."
}

Write-Host ""
Write-Host "Scan sent to Ativelo successfully." -ForegroundColor Green
Write-Host "Discovered devices: $($Devices.Count)" -ForegroundColor Cyan
