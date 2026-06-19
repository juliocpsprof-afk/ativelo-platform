namespace Ativelo.Agent.Services;

public static class SecretProtectionCli
{
    public static bool TryHandle(string[] args)
    {
        if (
            args.Length == 2 &&
            args[0] == "--protect-secret")
        {
            Console.Write(
                ProtectedSecretStore.ProtectForLocalMachine(
                    args[1]));

            return true;
        }

        return false;
    }
}