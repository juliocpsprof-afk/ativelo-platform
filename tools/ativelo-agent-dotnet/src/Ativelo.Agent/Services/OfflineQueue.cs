using System.Text.Json;
using Ativelo.Agent.Configuration;
using Microsoft.Extensions.Options;

namespace Ativelo.Agent.Services;

public sealed class OfflineQueue
{
    private readonly AtiveloAgentOptions _options;
    private readonly JsonSerializerOptions _jsonOptions =
        new(JsonSerializerDefaults.Web)
        {
            WriteIndented = true
        };

    public OfflineQueue(
        IOptions<AtiveloAgentOptions> options)
    {
        _options = options.Value;
        Directory.CreateDirectory(QueueDirectory);
    }

    public string QueueDirectory =>
        Path.Combine(
            _options.DataDirectory,
            "queue");

    public async Task EnqueueAsync(
        string type,
        object payload,
        CancellationToken cancellationToken)
    {
        string file =
            Path.Combine(
                QueueDirectory,
                $"{DateTimeOffset.UtcNow:yyyyMMddHHmmssfff}-{Guid.NewGuid():N}.json");

        await using FileStream stream =
            File.Create(file);

        await JsonSerializer.SerializeAsync(
            stream,
            new
            {
                type,
                createdAt = DateTimeOffset.UtcNow,
                payload
            },
            _jsonOptions,
            cancellationToken);
    }

    public int CountPending()
    {
        return Directory.Exists(QueueDirectory)
            ? Directory.GetFiles(QueueDirectory, "*.json").Length
            : 0;
    }
}