import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "./ativelo-ui.css";
import "./ativelo-branding.css";
import "./ativelo-assets.css";
import "./ativelo-asset-tools.css";
import "./ativelo-support.css";
import "./ativelo-logistics.css";
import "./ativelo-network.css";
import "./ativelo-capture.css";
import "./ativelo-audit-reports.css";
import "./ativelo-settings.css";
import "./ativelo-users.css";
import "./ativelo-worker.css";
import "./ativelo-pwa.css";
import "./pwa/registerServiceWorker";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("O elemento raiz da aplicação não foi encontrado.");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
