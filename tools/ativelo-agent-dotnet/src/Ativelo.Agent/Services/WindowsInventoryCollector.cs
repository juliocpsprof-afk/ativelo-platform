using System.Management;
using Ativelo.Agent.Models;

using System.Runtime.InteropServices;

namespace Ativelo.Agent.Services;

[System.Runtime.Versioning.SupportedOSPlatform("windows")]
public sealed class WindowsInventoryCollector
{
    public Task<InventorySnapshot> CollectAsync(
        CancellationToken cancellationToken)
    {
        string hostname =
            Environment.MachineName;

        string operatingSystem =
            Environment.OSVersion.Platform.ToString();

        string osVersion =
            Environment.OSVersion.VersionString;

        string architecture =
            RuntimeInformation.ProcessArchitecture.ToString();

        string? manufacturer =
            QueryFirst("Win32_ComputerSystem", "Manufacturer");

        string? model =
            QueryFirst("Win32_ComputerSystem", "Model");

        string? serial =
            QueryFirst("Win32_BIOS", "SerialNumber");

        string? bios =
            QueryFirst("Win32_BIOS", "SMBIOSBIOSVersion");

        string? processor =
            QueryFirst("Win32_Processor", "Name");

        ulong memory =
            QueryUlong("Win32_ComputerSystem", "TotalPhysicalMemory");

        List<DiskInfo> disks =
            QueryDisks();

        List<NetworkAdapterInfo> adapters =
            QueryNetworkAdapters();

        InventorySnapshot snapshot =
            new(
                CollectedAt: DateTimeOffset.UtcNow,
                Hostname: hostname,
                OperatingSystem: operatingSystem,
                OsVersion: osVersion,
                Architecture: architecture,
                Manufacturer: manufacturer,
                Model: model,
                SerialNumber: serial,
                BiosVersion: bios,
                Processor: processor,
                TotalMemoryBytes: memory,
                Disks: disks,
                NetworkAdapters: adapters);

        return Task.FromResult(snapshot);
    }

    private static string? QueryFirst(
        string className,
        string propertyName)
    {
        try
        {
            using ManagementObjectSearcher searcher =
                new($"select {propertyName} from {className}");

            foreach (ManagementObject item in searcher.Get())
            {
                return item[propertyName]?.ToString()?.Trim();
            }
        }
        catch
        {
            return null;
        }

        return null;
    }

    private static ulong QueryUlong(
        string className,
        string propertyName)
    {
        string? value =
            QueryFirst(className, propertyName);

        return ulong.TryParse(value, out ulong result)
            ? result
            : 0;
    }

    private static List<DiskInfo> QueryDisks()
    {
        List<DiskInfo> disks = [];

        try
        {
            using ManagementObjectSearcher searcher =
                new("select Name, Model, SerialNumber, Size from Win32_DiskDrive");

            foreach (ManagementObject item in searcher.Get())
            {
                disks.Add(
                    new DiskInfo(
                        Name: item["Name"]?.ToString()?.Trim() ?? "",
                        Model: item["Model"]?.ToString()?.Trim() ?? "",
                        SerialNumber: item["SerialNumber"]?.ToString()?.Trim() ?? "",
                        SizeBytes: ulong.TryParse(
                            item["Size"]?.ToString(),
                            out ulong size)
                                ? size
                                : 0));
            }
        }
        catch
        {
            return disks;
        }

        return disks;
    }

    private static List<NetworkAdapterInfo> QueryNetworkAdapters()
    {
        List<NetworkAdapterInfo> adapters = [];

        try
        {
            using ManagementObjectSearcher searcher =
                new("select Description, MACAddress, IPAddress, IPEnabled from Win32_NetworkAdapterConfiguration where IPEnabled = true");

            foreach (ManagementObject item in searcher.Get())
            {
                string[] ips =
                    item["IPAddress"] is string[] values
                        ? values
                        : [];

                adapters.Add(
                    new NetworkAdapterInfo(
                        Name: item["Description"]?.ToString()?.Trim() ?? "",
                        MacAddress: item["MACAddress"]?.ToString()?.Trim() ?? "",
                        IpAddresses: ips));
            }
        }
        catch
        {
            return adapters;
        }

        return adapters;
    }
}