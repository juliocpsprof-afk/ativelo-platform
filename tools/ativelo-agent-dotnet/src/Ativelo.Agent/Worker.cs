using Ativelo.Agent.Configuration;
using Ativelo.Agent.Models;
using Ativelo.Agent.Services;
using Microsoft.Extensions.Options;

namespace Ativelo.Agent;

public sealed class Worker : BackgroundService
{
    private readonly ILogger<Worker> _logger;
    private readonly AtiveloApiClient _apiClient;
    private readonly WindowsInventoryCollector _inventoryCollector;
    private readonly LocalStateStore _stateStore;
    private readonly OfflineQueue _offlineQueue;
    private readonly AtiveloAgentOptions _options;

    private DateTimeOffset _nextInventoryAt =
        DateTimeOffset.MinValue;

    private string? _lastError;

    public Worker(
        ILogger<Worker> logger,
        AtiveloApiClient apiClient,
        WindowsInventoryCollector inventoryCollector,
        LocalStateStore stateStore,
        OfflineQueue offlineQueue,
        IOptions<AtiveloAgentOptions> options)
    {
        _logger = logger;
        _apiClient = apiClient;
        _inventoryCollector = inventoryCollector;
        _stateStore = stateStore;
        _offlineQueue = offlineQueue;
        _options = options.Value;
    }

    protected override async Task ExecuteAsync(
        CancellationToken stoppingToken)
    {
        Directory.CreateDirectory(
            _options.DataDirectory);

        _logger.LogInformation(
            "Ativelo Agent iniciado. Versao {Version}",
            AgentVersion.Current);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await RunCycleAsync(stoppingToken);
                _lastError = null;
            }
            catch (Exception ex)
            {
                _lastError = ex.Message;
                _logger.LogError(
                    ex,
                    "Falha no ciclo do agente.");

                await _offlineQueue.EnqueueAsync(
                    "agent_error",
                    new
                    {
                        message = ex.Message,
                        occurredAt = DateTimeOffset.UtcNow
                    },
                    stoppingToken);
            }

            int minutes =
                Math.Max(5, _options.HeartbeatMinutes);

            await Task.Delay(
                TimeSpan.FromMinutes(minutes),
                stoppingToken);
        }
    }

    private async Task RunCycleAsync(
        CancellationToken cancellationToken)
    {
        object capabilities = new
        {
            inventory = true,
            networkDiscovery = _options.EnableNetworkDiscovery,
            offlineQueue = true,
            windowsService = true,
            pendingOfflineItems = _offlineQueue.CountPending()
        };

        HeartbeatResponse? heartbeat =
            await _apiClient.SendHeartbeatAsync(
                serviceStatus: "running",
                capabilities: capabilities,
                lastError: _lastError,
                cancellationToken: cancellationToken);

        await _stateStore.SaveLastSyncAsync(
            new
            {
                syncedAt = DateTimeOffset.UtcNow,
                heartbeat
            },
            cancellationToken);

        if (
            _options.EnableInventory &&
            DateTimeOffset.UtcNow >= _nextInventoryAt)
        {
            InventorySnapshot snapshot =
                await _inventoryCollector.CollectAsync(
                    cancellationToken);

            await _stateStore.SaveInventoryAsync(
                snapshot,
                cancellationToken);

            await _offlineQueue.EnqueueAsync(
                "inventory_snapshot",
                snapshot,
                cancellationToken);

            _nextInventoryAt =
                DateTimeOffset.UtcNow.AddHours(
                    Math.Max(1, _options.InventoryHours));
        }

        if (heartbeat?.Commands is { Count: > 0 })
        {
            foreach (HeartbeatCommand command in heartbeat.Commands)
            {
                _logger.LogInformation(
                    "Comando recebido: {CommandType} ({CommandId})",
                    command.Type,
                    command.Id);

                await _offlineQueue.EnqueueAsync(
                    "command_received",
                    command,
                    cancellationToken);
            }
        }
    }
}