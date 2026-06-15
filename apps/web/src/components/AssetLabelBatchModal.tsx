import {
  useMemo,
  useState,
} from "react";

import AppIcon from "./AppIcon";
import {
  getLabelPageCapacity,
  labelSizes,
  printAssetLabels,
  type LabelSize,
} from "../lib/assetLabelPrinting";
import type { AssetRecord } from "../types/assets";
import { statusLabels } from "../types/assets";

type Option = {
  id: string;
  name: string;
};

type BuildingOption = Option & {
  unit_id: string;
};

type FloorOption = Option & {
  building_id: string;
};

type DepartmentOption = Option & {
  unit_id: string | null;
};

type RoomOption = Option & {
  floor_id: string;
};

type Props = {
  assets: AssetRecord[];
  categories: Option[];
  units: Option[];
  buildings: BuildingOption[];
  floors: FloorOption[];
  departments: DepartmentOption[];
  rooms: RoomOption[];
  organizationName: string;
  organizationLogoUrl?: string | null;
  onClose: () => void;
};

function normalizedText(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function clampCopies(value: number): number {
  return Math.max(
    1,
    Math.min(20, Math.round(value || 1)),
  );
}

export default function AssetLabelBatchModal({
  assets,
  categories,
  units,
  buildings,
  floors,
  departments,
  rooms,
  organizationName,
  organizationLogoUrl = null,
  onClose,
}: Props) {
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] =
    useState("");
  const [status, setStatus] = useState("");
  const [unitId, setUnitId] = useState("");
  const [buildingId, setBuildingId] =
    useState("");
  const [floorId, setFloorId] =
    useState("");
  const [departmentId, setDepartmentId] =
    useState("");
  const [roomId, setRoomId] = useState("");

  const [selectedIds, setSelectedIds] =
    useState<Set<string>>(
      () => new Set(),
    );

  const [copiesByAsset, setCopiesByAsset] =
    useState<Record<string, number>>({});

  const [globalCopies, setGlobalCopies] =
    useState(1);

  const [labelSize, setLabelSize] =
    useState<LabelSize>("standard");

  const [isPrinting, setIsPrinting] =
    useState(false);

  const [feedback, setFeedback] =
    useState<string | null>(null);

  const buildingOptions = useMemo(
    () =>
      buildings.filter(
        (item) =>
          !unitId || item.unit_id === unitId,
      ),
    [buildings, unitId],
  );

  const floorOptions = useMemo(
    () =>
      floors.filter(
        (item) =>
          !buildingId ||
          item.building_id === buildingId,
      ),
    [floors, buildingId],
  );

  const roomOptions = useMemo(
    () =>
      rooms.filter(
        (item) =>
          !floorId ||
          item.floor_id === floorId,
      ),
    [rooms, floorId],
  );

  const departmentOptions = useMemo(
    () =>
      departments.filter(
        (item) =>
          !unitId ||
          !item.unit_id ||
          item.unit_id === unitId,
      ),
    [departments, unitId],
  );

  const filteredAssets = useMemo(() => {
    const query = normalizedText(search);

    return assets.filter((asset) => {
      const matchesSearch =
        !query ||
        [
          asset.asset_number,
          asset.name,
          asset.serial_number,
          asset.service_tag,
          asset.hostname,
        ]
          .filter(Boolean)
          .some((value) =>
            normalizedText(value).includes(query),
          );

      return (
        matchesSearch &&
        (!categoryId ||
          asset.category_id === categoryId) &&
        (!status ||
          asset.operational_status === status) &&
        (!unitId ||
          asset.unit_id === unitId) &&
        (!buildingId ||
          asset.building_id === buildingId) &&
        (!floorId ||
          asset.floor_id === floorId) &&
        (!departmentId ||
          asset.department_id === departmentId) &&
        (!roomId ||
          asset.room_id === roomId)
      );
    });
  }, [
    assets,
    buildingId,
    categoryId,
    departmentId,
    floorId,
    roomId,
    search,
    status,
    unitId,
  ]);

  const selectedAssets = useMemo(
    () =>
      assets.filter((asset) =>
        selectedIds.has(asset.id),
      ),
    [assets, selectedIds],
  );

  const totalLabels = useMemo(
    () =>
      selectedAssets.reduce(
        (total, asset) =>
          total +
          clampCopies(
            copiesByAsset[asset.id] ?? 1,
          ),
        0,
      ),
    [copiesByAsset, selectedAssets],
  );

  const estimatedPages = Math.max(
    0,
    Math.ceil(
      totalLabels /
        getLabelPageCapacity(labelSize),
    ),
  );

  const nameOf = (
    list: Option[],
    id: string | null,
  ) =>
    list.find((item) => item.id === id)
      ?.name ?? "Não definido";

  const locationOf = (
    asset: AssetRecord,
  ) => {
    const parts = [
      nameOf(units, asset.unit_id),
      nameOf(rooms, asset.room_id),
    ].filter(
      (value) => value !== "Não definido",
    );

    return parts.length > 0
      ? parts.join(" · ")
      : "Local não definido";
  };

  const toggleAsset = (
    assetId: string,
  ) => {
    setSelectedIds((current) => {
      const next = new Set(current);

      if (next.has(assetId)) {
        next.delete(assetId);
      } else {
        next.add(assetId);
      }

      return next;
    });
  };

  const selectFiltered = () => {
    setSelectedIds((current) => {
      const next = new Set(current);

      filteredAssets.forEach((asset) => {
        next.add(asset.id);
      });

      return next;
    });
  };

  const unselectFiltered = () => {
    setSelectedIds((current) => {
      const next = new Set(current);

      filteredAssets.forEach((asset) => {
        next.delete(asset.id);
      });

      return next;
    });
  };

  const applyGlobalCopies = () => {
    setCopiesByAsset((current) => {
      const next = { ...current };

      selectedAssets.forEach((asset) => {
        next[asset.id] =
          clampCopies(globalCopies);
      });

      return next;
    });
  };

  const printBatch = async () => {
    if (selectedAssets.length === 0) {
      setFeedback(
        "Selecione pelo menos um equipamento.",
      );
      return;
    }

    const printWindow = window.open(
      "",
      "_blank",
      "width=1200,height=850",
    );

    if (!printWindow) {
      setFeedback(
        "O navegador bloqueou a janela de impressão. Libere os pop-ups e tente novamente.",
      );
      return;
    }

    setIsPrinting(true);
    setFeedback(null);

    try {
      await printAssetLabels(printWindow, {
        items: selectedAssets.map(
          (asset) => ({
            asset,
            copies: clampCopies(
              copiesByAsset[asset.id] ?? 1,
            ),
            locationLabel:
              locationOf(asset),
          }),
        ),
        labelSize,
        organizationName,
        organizationLogoUrl,
      });
    } catch (error) {
      printWindow.close();
      setFeedback(
        error instanceof Error
          ? error.message
          : "Não foi possível preparar as etiquetas.",
      );
    } finally {
      setIsPrinting(false);
    }
  };

  return (
    <div
      className="ativelo-modal-backdrop"
      role="presentation"
    >
      <section
        className="ativelo-modal large ativelo-label-batch-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Impressão de etiquetas em lote"
      >
        <header>
          <div>
            <span>IDENTIFICAÇÃO EM LOTE</span>
            <h2>Imprimir etiquetas</h2>
          </div>

          <button
            type="button"
            aria-label="Fechar"
            onClick={onClose}
          >
            <AppIcon name="close" size={21} />
          </button>
        </header>

        <div className="ativelo-label-batch-body">
          <section className="ativelo-label-batch-filters">
            <label className="search">
              <span>Buscar equipamento</span>
              <input
                value={search}
                onChange={(event) =>
                  setSearch(event.target.value)
                }
                placeholder="Patrimônio, nome, serial ou hostname"
              />
            </label>

            <label>
              <span>Tipo de equipamento</span>
              <select
                value={categoryId}
                onChange={(event) =>
                  setCategoryId(
                    event.target.value,
                  )
                }
              >
                <option value="">
                  Todas as categorias
                </option>
                {categories.map((item) => (
                  <option
                    key={item.id}
                    value={item.id}
                  >
                    {item.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Status</span>
              <select
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value)
                }
              >
                <option value="">
                  Todos os status
                </option>
                {Object.entries(
                  statusLabels,
                ).map(([value, label]) => (
                  <option
                    key={value}
                    value={value}
                  >
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Unidade</span>
              <select
                value={unitId}
                onChange={(event) => {
                  setUnitId(event.target.value);
                  setBuildingId("");
                  setFloorId("");
                  setRoomId("");
                  setDepartmentId("");
                }}
              >
                <option value="">
                  Todas as unidades
                </option>
                {units.map((item) => (
                  <option
                    key={item.id}
                    value={item.id}
                  >
                    {item.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Prédio</span>
              <select
                value={buildingId}
                onChange={(event) => {
                  setBuildingId(
                    event.target.value,
                  );
                  setFloorId("");
                  setRoomId("");
                }}
              >
                <option value="">
                  Todos os prédios
                </option>
                {buildingOptions.map(
                  (item) => (
                    <option
                      key={item.id}
                      value={item.id}
                    >
                      {item.name}
                    </option>
                  ),
                )}
              </select>
            </label>

            <label>
              <span>Andar</span>
              <select
                value={floorId}
                onChange={(event) => {
                  setFloorId(
                    event.target.value,
                  );
                  setRoomId("");
                }}
              >
                <option value="">
                  Todos os andares
                </option>
                {floorOptions.map((item) => (
                  <option
                    key={item.id}
                    value={item.id}
                  >
                    {item.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Setor</span>
              <select
                value={departmentId}
                onChange={(event) =>
                  setDepartmentId(
                    event.target.value,
                  )
                }
              >
                <option value="">
                  Todos os setores
                </option>
                {departmentOptions.map(
                  (item) => (
                    <option
                      key={item.id}
                      value={item.id}
                    >
                      {item.name}
                    </option>
                  ),
                )}
              </select>
            </label>

            <label>
              <span>Sala</span>
              <select
                value={roomId}
                onChange={(event) =>
                  setRoomId(event.target.value)
                }
              >
                <option value="">
                  Todas as salas
                </option>
                {roomOptions.map((item) => (
                  <option
                    key={item.id}
                    value={item.id}
                  >
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
          </section>

          <section className="ativelo-label-batch-selection-bar">
            <div>
              <strong>
                {filteredAssets.length}
              </strong>
              <span>ativos no filtro</span>
            </div>

            <div>
              <strong>
                {selectedAssets.length}
              </strong>
              <span>ativos selecionados</span>
            </div>

            <div>
              <strong>{totalLabels}</strong>
              <span>etiquetas</span>
            </div>

            <div>
              <strong>
                {estimatedPages}
              </strong>
              <span>
                {estimatedPages === 1
                  ? "folha estimada"
                  : "folhas estimadas"}
              </span>
            </div>

            <button
              type="button"
              className="secondary"
              onClick={selectFiltered}
            >
              Selecionar filtrados
            </button>

            <button
              type="button"
              className="secondary"
              onClick={unselectFiltered}
            >
              Desmarcar filtrados
            </button>
          </section>

          <section className="ativelo-label-batch-copy-tools">
            <label>
              <span>Tamanho</span>
              <select
                value={labelSize}
                onChange={(event) =>
                  setLabelSize(
                    event.target
                      .value as LabelSize,
                  )
                }
              >
                {(
                  Object.keys(
                    labelSizes,
                  ) as LabelSize[]
                ).map((size) => (
                  <option
                    key={size}
                    value={size}
                  >
                    {labelSizes[size].label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Cópias para os selecionados</span>
              <input
                type="number"
                min={1}
                max={20}
                value={globalCopies}
                onChange={(event) =>
                  setGlobalCopies(
                    clampCopies(
                      Number(
                        event.target.value,
                      ),
                    ),
                  )
                }
              />
            </label>

            <button
              type="button"
              className="secondary"
              disabled={
                selectedAssets.length === 0
              }
              onClick={applyGlobalCopies}
            >
              Aplicar quantidade
            </button>
          </section>

          <section className="ativelo-label-batch-list">
            <header>
              <span>Selecionar</span>
              <span>Equipamento</span>
              <span>Tipo</span>
              <span>Localização</span>
              <span>Cópias</span>
            </header>

            {filteredAssets.length === 0 ? (
              <div className="ativelo-label-batch-empty">
                Nenhum equipamento encontrado
                com estes filtros.
              </div>
            ) : (
              filteredAssets.map((asset) => {
                const selected =
                  selectedIds.has(asset.id);

                return (
                  <article
                    key={asset.id}
                    className={
                      selected
                        ? "selected"
                        : ""
                    }
                  >
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() =>
                          toggleAsset(asset.id)
                        }
                      />
                    </label>

                    <div>
                      <strong>
                        {asset.asset_number}
                      </strong>
                      <span>{asset.name}</span>
                      <small>
                        {asset.serial_number ||
                          asset.service_tag ||
                          "Sem serial"}
                      </small>
                    </div>

                    <span>
                      {nameOf(
                        categories,
                        asset.category_id,
                      )}
                    </span>

                    <span>
                      {locationOf(asset)}
                    </span>

                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={
                        copiesByAsset[
                          asset.id
                        ] ?? 1
                      }
                      disabled={!selected}
                      aria-label={`Cópias de ${asset.asset_number}`}
                      onChange={(event) =>
                        setCopiesByAsset(
                          (current) => ({
                            ...current,
                            [asset.id]:
                              clampCopies(
                                Number(
                                  event.target
                                    .value,
                                ),
                              ),
                          }),
                        )
                      }
                    />
                  </article>
                );
              })
            )}
          </section>

          {feedback && (
            <div className="ativelo-label-batch-feedback">
              {feedback}
            </div>
          )}
        </div>

        <footer className="ativelo-label-batch-footer">
          <button
            type="button"
            className="secondary"
            onClick={onClose}
          >
            Fechar
          </button>

          <button
            type="button"
            className="primary"
            disabled={
              isPrinting ||
              selectedAssets.length === 0
            }
            onClick={() =>
              void printBatch()
            }
          >
            <AppIcon name="print" size={18} />
            {isPrinting
              ? "Preparando etiquetas..."
              : `Imprimir ${totalLabels} ${
                  totalLabels === 1
                    ? "etiqueta"
                    : "etiquetas"
                }`}
          </button>
        </footer>
      </section>
    </div>
  );
}