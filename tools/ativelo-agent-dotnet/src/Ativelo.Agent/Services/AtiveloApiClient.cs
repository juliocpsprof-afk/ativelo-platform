using System.Net.Http.Json;
using Ativelo.Agent.Configuration;
using Ativelo.Agent.Models;
using Microsoft.Extensions.Options;

namespace Ativelo.Agent.Services;

public sealed class AtiveloApiClient
{
    private readonly HttpClient _httpClient;
    private readonly AtiveloAgentOptions _options;
    private readonly ProtectedSecretStore _secretStore;

    public AtiveloApiClient(
        HttpClient httpClient,
        IOptions<AtiveloAgentOptions> options,
        ProtectedSecretStore secretStore)
    {
        _httpClient = httpClient;
        _options = options.Value;
        _secretStore = secretStore;

        _httpClient.BaseAddress =
            new Uri(_options.ApiBaseUrl.TrimEnd('/') + "/");

        _httpClient.Timeout =
            TimeSpan.FromSeconds(45);
    }

    public async Task<HeartbeatResponse?> SendHeartbeatAsync(
        string serviceStatus,
        object capabilities,
        string? lastError,
        CancellationToken cancellationToken)
    {
        string? secret =
            _secretStore.UnprotectAgentSecret();

        if (
            string.IsNullOrWhiteSpace(_options.AgentId) ||
            string.IsNullOrWhiteSpace(secret))
        {
            throw new InvalidOperationException(
                "Agente ainda nao vinculado. Configure AgentId e AgentSecretProtected.");
        }

        using HttpRequestMessage request =
            new(
                HttpMethod.Post,
                "agent/heartbeat");

        request.Headers.Add(
            "X-Ativelo-Agent-Id",
            _options.AgentId);

        request.Headers.Add(
            "X-Ativelo-Agent-Key",
            secret);

        request.Content =
            JsonContent.Create(
                new HeartbeatRequest(
                    AgentVersion: AgentVersion.Current,
                    ServiceStatus: serviceStatus,
                    Capabilities: capabilities,
                    LastError: lastError));

        using HttpResponseMessage response =
            await _httpClient.SendAsync(
                request,
                cancellationToken);

        response.EnsureSuccessStatusCode();

        return await response.Content.ReadFromJsonAsync<HeartbeatResponse>(
            cancellationToken: cancellationToken);
    }
}

public static class AgentVersion
{
    public const string Current = "0.1.0";
}