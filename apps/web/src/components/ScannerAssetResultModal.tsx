import AppIcon from "./AppIcon";
import type { AssetRecord } from "../types/assets";
import { statusLabels } from "../types/assets";

type Props = {
  asset: AssetRecord;
  onClose: () => void;
  onOpenAsset: () => void;
  onScanAnother: () => void;
};

export default function ScannerAssetResultModal({
  asset,
  onClose,
  onOpenAsset,
  onScanAnother,
}: Props) {
  return (
    <div
      className="ativelo-modal-backdrop ativelo-scanner-result-backdrop"
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        className="ativelo-modal ativelo-scanner-result-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Equipamento identificado"
        onMouseDown={(event) =>
          event.stopPropagation()
        }
      >
        <header>
          <div>
            <span>EQUIPAMENTO IDENTIFICADO</span>
            <h2>{asset.name}</h2>
          </div>

          <button
            type="button"
            aria-label="Fechar resultado"
            onClick={onClose}
          >
            <AppIcon name="close" size={21} />
          </button>
        </header>

        <div className="ativelo-scanner-result-modal__body">
          <div className="ativelo-scanner-result-modal__success">
            <AppIcon name="scan" size={34} />
            <div>
              <strong>Leitura concluída</strong>
              <span>
                O patrimônio foi localizado no
                inventário.
              </span>
            </div>
          </div>

          <div className="ativelo-scanner-result-modal__identity">
            <span
              className={`status ${asset.operational_status}`}
            >
              {statusLabels[
                asset.operational_status
              ] ?? asset.operational_status}
            </span>

            <strong>{asset.asset_number}</strong>
            <small>{asset.name}</small>
          </div>

          <dl className="ativelo-scanner-result-modal__grid">
            <div>
              <dt>Número de série</dt>
              <dd>
                {asset.serial_number ||
                  "Não informado"}
              </dd>
            </div>

            <div>
              <dt>Service Tag</dt>
              <dd>
                {asset.service_tag ||
                  "Não informado"}
              </dd>
            </div>

            <div>
              <dt>Hostname</dt>
              <dd>
                {asset.hostname ||
                  "Não informado"}
              </dd>
            </div>

            <div>
              <dt>Responsável</dt>
              <dd>
                {asset.assigned_person_name ||
                  "Não atribuído"}
              </dd>
            </div>
          </dl>
        </div>

        <footer>
          <button
            type="button"
            className="secondary"
            onClick={onScanAnother}
          >
            Ler outra etiqueta
          </button>

          <button
            type="button"
            className="primary"
            onClick={onOpenAsset}
          >
            Abrir ficha do ativo
          </button>
        </footer>
      </section>
    </div>
  );
}