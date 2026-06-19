using System.Text.Json;
using Microsoft.Extensions.Options;
using Ativelo.Agent.Configuration;
using Ativelo.Agent.Models;

namespace Ativelo.Agent.Services;

public sealed class LocalStateStore
{
    private readonly AtiveloAgentOptions _options;
    private readonly JsonSerializerOptions _jsonOptions =
        new(JsonSerializerDefaults.Web)
        {
            WriteIndented = true
        };

    public LocalStateStore(
        IOptions<AtiveloAgentOptions> options)
    {
        _options = options.Value;
        Directory.CreateDirectory(
            _options.DataDirectory);
    }

    public string DataDirectory =>
        _options.DataDirectory;

    public string InventoryPath =>
        Path.Combine(
            _options.DataDirectory,
            "inventory.json");

    public string LastSyncPath =>
        Path.Combine(
            _options.DataDirectory,
            "last-sync.json");

    public async Task SaveInventoryAsync(
        InventorySnapshot snapshot,
        CancellationToken cancellationToken)
    {
        await using FileStream stream =
            File.Create(InventoryPath);

        await JsonSerializer.SerializeAsync(
            stream,
            snapshot,
            _jsonOptions,
            cancellationToken);
    }

    public async Task<InventorySnapshot?> ReadInventoryAsync(
        CancellationToken cancellationToken)
    {
        if (!File.Exists(InventoryPath))
        {
            return null;
        }

        await using FileStream stream =
            File.OpenRead(InventoryPath);

        return await JsonSerializer.DeserializeAsync<InventorySnapshot>(
            stream,
            _jsonOptions,
            cancellationToken);
    }

    public async Task SaveLastSyncAsync(
        object payload,
        CancellationToken cancellationToken)
    {
        await using FileStream stream =
            File.Create(LastSyncPath);

        await JsonSerializer.SerializeAsync(
            stream,
            payload,
            _jsonOptions,
            cancellationToken);
    }
}