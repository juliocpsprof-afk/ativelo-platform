export const PWA_UPDATE_EVENT = "ativelo:pwa-update";

let shouldReloadAfterControllerChange = false;
let controllerChangeHandled = false;

function notifyUpdateAvailable(
  registration: ServiceWorkerRegistration,
): void {
  window.dispatchEvent(
    new CustomEvent(PWA_UPDATE_EVENT, {
      detail: {
        registration,
      },
    }),
  );
}

async function registerAtiveloServiceWorker(): Promise<void> {
  if (
    import.meta.env.DEV ||
    !("serviceWorker" in navigator)
  ) {
    return;
  }

  try {
    const registration =
      await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
        updateViaCache: "none",
      });

    if (
      registration.waiting &&
      navigator.serviceWorker.controller
    ) {
      notifyUpdateAvailable(registration);
    }

    registration.addEventListener("updatefound", () => {
      const installingWorker = registration.installing;

      if (!installingWorker) {
        return;
      }

      installingWorker.addEventListener(
        "statechange",
        () => {
          if (
            installingWorker.state === "installed" &&
            navigator.serviceWorker.controller
          ) {
            notifyUpdateAvailable(registration);
          }
        },
      );
    });

    window.setInterval(() => {
      void registration.update();
    }, 60 * 60 * 1000);
  } catch (error) {
    console.warn(
      "Não foi possível registrar o modo aplicativo.",
      error,
    );
  }
}

export async function activateWaitingServiceWorker(): Promise<boolean> {
  if (!("serviceWorker" in navigator)) {
    return false;
  }

  const registration =
    await navigator.serviceWorker.getRegistration("/");

  if (!registration?.waiting) {
    await registration?.update();
    return false;
  }

  shouldReloadAfterControllerChange = true;

  registration.waiting.postMessage({
    type: "SKIP_WAITING",
  });

  return true;
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener(
    "controllerchange",
    () => {
      if (
        !shouldReloadAfterControllerChange ||
        controllerChangeHandled
      ) {
        return;
      }

      controllerChangeHandled = true;
      window.location.reload();
    },
  );
}

window.addEventListener("load", () => {
  void registerAtiveloServiceWorker();
});