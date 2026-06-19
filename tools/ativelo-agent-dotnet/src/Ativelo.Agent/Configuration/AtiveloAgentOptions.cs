namespace Ativelo.Agent.Configuration;

public sealed class AtiveloAgentOptions
{
    public string ApiBaseUrl { get; set; } =
        "https://ativelo-api.ativeloapp.workers.dev";

    public string DataDirectory { get; set; } =
        @"C:\ProgramData\AtiveloAgent";

    public string AgentId { get; set; } = "";

    public string AgentSecretProtected { get; set; } = "";

    public int HeartbeatMinutes { get; set; } = 15;

    public int InventoryHours { get; set; } = 24;

    public bool EnableInventory { get; set; } = true;

    public bool EnableNetworkDiscovery { get; set; } = false;

    public string ServiceName { get; set; } =
        "AtiveloAgent";
}