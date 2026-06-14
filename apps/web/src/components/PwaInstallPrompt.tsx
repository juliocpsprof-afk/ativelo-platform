import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  activateWaitingServiceWorker,
  PWA_UPDATE_EVENT,
} from "../pwa/registerServiceWorker";

type BeforeInstallPromptEvent = Event & {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
};

type PromptMode =
  | "install"
  | "ios"
  | "update"
  | null;

function isStandalone(): boolean {
  return (
    window.matchMedia(
      "(display-mode: standalone)",
    ).matches ||
    (
      "standalone" in window.navigator &&
      Boolean(
        (
          window.navigator as Navigator & {
            standalone?: boolean;
          }
        ).standalone,
      )
    )
  );
}

function isIosDevice(): boolean {
  return /iphone|ipad|ipod/i.test(
    window.navigator.userAgent,
  );
}

export default function PwaInstallPrompt() {
  const [
    installEvent,
    setInstallEvent,
  ] = useState<BeforeInstallPromptEvent | null>(
    null,
  );
  const [updateAvailable, setUpdateAvailable] =
    useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [installed, setInstalled] = useState(
    () =>
      typeof window !== "undefined" &&
      isStandalone(),
  );

  useEffect(() => {
    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();

      setInstallEvent(
        event as BeforeInstallPromptEvent,
      );
      setDismissed(false);
    };

    const handleInstalled = () => {
      setInstalled(true);
      setInstallEvent(null);
      setDismissed(true);
    };

    const handleUpdate = () => {
      setUpdateAvailable(true);
      setDismissed(false);
    };

    window.addEventListener(
      "beforeinstallprompt",
      handleInstallPrompt,
    );
    window.addEventListener(
      "appinstalled",
      handleInstalled,
    );
    window.addEventListener(
      PWA_UPDATE_EVENT,
      handleUpdate,
    );

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleInstallPrompt,
      );
      window.removeEventListener(
        "appinstalled",
        handleInstalled,
      );
      window.removeEventListener(
        PWA_UPDATE_EVENT,
        handleUpdate,
      );
    };
  }, []);

  const mode = useMemo<PromptMode>(() => {
    if (dismissed) {
      return null;
    }

    if (updateAvailable) {
      return "update";
    }

    if (!installed && installEvent) {
      return "install";
    }

    if (
      !installed &&
      isIosDevice()
    ) {
      return "ios";
    }

    return null;
  }, [
    dismissed,
    installEvent,
    installed,
    updateAvailable,
  ]);

  if (!mode) {
    return null;
  }

  const handlePrimaryAction = async () => {
    if (mode === "update") {
      const activated =
        await activateWaitingServiceWorker();

      if (!activated) {
        setUpdateAvailable(false);
        window.location.reload();
      }

      return;
    }

    if (mode === "install" && installEvent) {
      await installEvent.prompt();
      const choice = await installEvent.userChoice;

      setInstallEvent(null);

      if (choice.outcome === "accepted") {
        setInstalled(true);
      }

      setDismissed(true);
    }
  };

  return (
    <aside
      className={`ativelo-pwa-prompt ativelo-pwa-prompt--${mode}`}
      aria-live="polite"
    >
      <img
        src="/icons/ativelo-192.png"
        alt=""
        width="44"
        height="44"
      />

      <div className="ativelo-pwa-prompt__content">
        <strong>
          {mode === "update"
            ? "Nova versão disponível"
            : "Instale o Ativelo"}
        </strong>

        <span>
          {mode === "update"
            ? "Atualize para usar as melhorias mais recentes."
            : mode === "ios"
              ? "No iPhone, toque em Compartilhar e depois em Adicionar à Tela de Início."
              : "Abra mais rápido e use o aplicativo pela tela inicial."}
        </span>
      </div>

      {mode !== "ios" && (
        <button
          type="button"
          className="ativelo-pwa-prompt__primary"
          onClick={() => {
            void handlePrimaryAction();
          }}
        >
          {mode === "update"
            ? "Atualizar"
            : "Instalar"}
        </button>
      )}

      <button
        type="button"
        className="ativelo-pwa-prompt__close"
        aria-label="Fechar aviso"
        onClick={() => setDismissed(true)}
      >
        ×
      </button>
    </aside>
  );
}