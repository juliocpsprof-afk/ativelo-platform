using Ativelo.Agent;
using Ativelo.Agent.Configuration;
using Ativelo.Agent.Services;
using Microsoft.Extensions.Hosting.WindowsServices;

if (Ativelo.Agent.Services.SecretProtectionCli.TryHandle(args))
{
    return;
}

HostApplicationBuilder builder =
    Host.CreateApplicationBuilder(args);

builder.Services
    .AddWindowsService(options =>
    {
        options.ServiceName = "AtiveloAgent";
    });

builder.Services
    .Configure<AtiveloAgentOptions>(
        builder.Configuration.GetSection("AtiveloAgent"));

builder.Services.AddHttpClient<AtiveloApiClient>();
builder.Services.AddSingleton<ProtectedSecretStore>();
builder.Services.AddSingleton<LocalStateStore>();
builder.Services.AddSingleton<WindowsInventoryCollector>();
builder.Services.AddSingleton<OfflineQueue>();
builder.Services.AddHostedService<Worker>();

IHost host = builder.Build();

await host.RunAsync();