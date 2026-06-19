using System.Runtime.Versioning;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Options;
using Ativelo.Agent.Configuration;

namespace Ativelo.Agent.Services;

[SupportedOSPlatform("windows")]
public sealed class ProtectedSecretStore
{
    private readonly AtiveloAgentOptions _options;

    public ProtectedSecretStore(
        IOptions<AtiveloAgentOptions> options)
    {
        _options = options.Value;
    }

    public string? UnprotectAgentSecret()
    {
        if (string.IsNullOrWhiteSpace(
                _options.AgentSecretProtected))
        {
            return null;
        }

        byte[] protectedBytes =
            Convert.FromBase64String(
                _options.AgentSecretProtected);

        byte[] plainBytes =
            ProtectedData.Unprotect(
                protectedBytes,
                optionalEntropy: null,
                scope: DataProtectionScope.LocalMachine);

        return Encoding.UTF8.GetString(plainBytes);
    }

    public static string ProtectForLocalMachine(
        string plainSecret)
    {
        byte[] plainBytes =
            Encoding.UTF8.GetBytes(plainSecret);

        byte[] protectedBytes =
            ProtectedData.Protect(
                plainBytes,
                optionalEntropy: null,
                scope: DataProtectionScope.LocalMachine);

        return Convert.ToBase64String(protectedBytes);
    }
}