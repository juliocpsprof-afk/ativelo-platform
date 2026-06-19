namespace Ativelo.Agent.Models;

public sealed record HeartbeatRequest(
    string AgentVersion,
    string ServiceStatus,
    object Capabilities,
    string? LastError
);

public sealed record HeartbeatCommand(
    string Id,
    string Type,
    Dictionary<string, object?> Payload
);

public sealed record HeartbeatResponse(
    bool Ok,
    string AgentId,
    string Status,
    bool RotateCredential,
    Dictionary<string, object?> Configuration,
    List<HeartbeatCommand> Commands
);

public sealed record InventorySnapshot(
    DateTimeOffset CollectedAt,
    string Hostname,
    string OperatingSystem,
    string OsVersion,
    string Architecture,
    string? Manufacturer,
    string? Model,
    string? SerialNumber,
    string? BiosVersion,
    string? Processor,
    ulong TotalMemoryBytes,
    List<DiskInfo> Disks,
    List<NetworkAdapterInfo> NetworkAdapters
);

public sealed record DiskInfo(
    string Name,
    string Model,
    string SerialNumber,
    ulong SizeBytes
);

public sealed record NetworkAdapterInfo(
    string Name,
    string MacAddress,
    string[] IpAddresses
);