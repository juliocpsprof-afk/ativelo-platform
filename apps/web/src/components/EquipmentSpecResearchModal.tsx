import {
  useMemo,
  useState,
} from "react";

import AppIcon from "./AppIcon";
import {
  researchEquipmentSpecs,
  type EquipmentSpecResearchResult,
  type EquipmentSpecSuggestion,
} from "../lib/equipmentSpecResearch";
import { AtiveloApiError } from "../lib/ativeloApi";

export type EquipmentSpecApplyValues = {
  manufacturer: string;
  model: string;
  processor: string;
  memory: string;
  storage: string;
  categoryHint: string;
  operatingSystem: string;
  notesAppend: string;
};

type Props = {
  initialManufacturer: string;
  initialModel: string;
  categoryHint: string;
  rawOcrText: string;
  onClose: () => void;
  onApply: (
    values: EquipmentSpecApplyValues,
  ) => void | Promise<void>;
};

type FieldKey =
  | "manufacturer"
  | "model"
  | "processor"
  | "memory"
  | "storage"
  | "categoryHint"
  | "operatingSystem";

const fieldLabels: Record<
  FieldKey,
  string
> = {
  manufacturer: "Fabricante",
  model: "Modelo completo",
  processor: "Processador",
  memory: "Memória",
  storage: "Armazenamento",
  categoryHint: "Tipo de equipamento",
  operatingSystem:
    "Sistema operacional original",
};

const fieldKeys = Object.keys(
  fieldLabels,
) as FieldKey[];

function confidenceLabel(
  value: number,
): string {
  if (value >= 80) {
    return "Alta";
  }

  if (value >= 55) {
    return "Média";
  }

  if (value > 0) {
    return "Baixa";
  }

  return "Sem evidência";
}

function sourceTypeLabel(
  value: string,
): string {
  const labels: Record<string, string> = {
    official: "Fabricante",
    support: "Suporte oficial",
    manual: "Manual",
    documentation: "Documentação",
    distributor: "Loja ou distribuidor",
    other: "Outra fonte",
  };

  return labels[value] ?? value;
}

export default function EquipmentSpecResearchModal({
  initialManufacturer,
  initialModel,
  categoryHint,
  rawOcrText,
  onClose,
  onApply,
}: Props) {
  const [manufacturer, setManufacturer] =
    useState(initialManufacturer);
  const [model, setModel] =
    useState(initialModel);
  const [manualUrls, setManualUrls] =
    useState("");
  const [isResearching, setIsResearching] =
    useState(false);
  const [isApplying, setIsApplying] =
    useState(false);
  const [result, setResult] =
    useState<EquipmentSpecResearchResult | null>(
      null,
    );
  const [selectedFields, setSelectedFields] =
    useState<Set<FieldKey>>(
      () => new Set(),
    );
  const [appendSources, setAppendSources] =
    useState(true);
  const [feedback, setFeedback] =
    useState<string | null>(null);

  const manualSourceUrls = useMemo(
    () =>
      manualUrls
        .split(/\r?\n/)
        .map((value) => value.trim())
        .filter(Boolean)
        .slice(0, 3),
    [manualUrls],
  );

  const guidedSearchQuery = useMemo(
    () =>
      [
        manufacturer.trim(),
        model.trim(),
        "especificações ficha técnica manual processador memória armazenamento",
      ]
        .filter(Boolean)
        .join(" "),
    [manufacturer, model],
  );

  const guidedSearchLinks = useMemo(
    () => {
      const encoded = encodeURIComponent(
        guidedSearchQuery,
      );

      return [
        {
          label: "Buscar no Google",
          url: `https://www.google.com/search?q=${encoded}`,
        },
        {
          label: "Buscar no Bing",
          url: `https://www.bing.com/search?q=${encoded}`,
        },
        {
          label: "Buscar no DuckDuckGo",
          url: `https://duckduckgo.com/?q=${encoded}`,
        },
      ];
    },
    [guidedSearchQuery],
  );

  const research = async () => {
    if (manualSourceUrls.length === 0) {
      setFeedback(
        "Abra uma busca gratuita, encontre uma página oficial e cole pelo menos uma URL antes de analisar.",
      );
      return;
    }

    setIsResearching(true);
    setFeedback(null);
    setResult(null);

    const controller =
      new AbortController();
    const timeout = window.setTimeout(
      () => controller.abort(),
      50000,
    );

    try {
      const response =
        await researchEquipmentSpecs(
          {
            manufacturer:
              manufacturer.trim(),
            model: model.trim(),
            categoryHint,
            rawOcrText,
            sourceUrls:
              manualSourceUrls,
          },
          controller.signal,
        );

      setResult(response);

      const available = new Set<FieldKey>();

      fieldKeys.forEach((field) => {
        if (
          response.suggestion[field]
        ) {
          available.add(field);
        }
      });

      setSelectedFields(available);
    } catch (error) {
      if (
        error instanceof DOMException &&
        error.name === "AbortError"
      ) {
        setFeedback(
          "A pesquisa demorou mais que o esperado. Tente novamente ou informe URLs oficiais.",
        );
      } else if (
        error instanceof AtiveloApiError
      ) {
        setFeedback(error.message);
      } else {
        setFeedback(
          error instanceof Error
            ? error.message
            : "Não foi possível concluir a pesquisa.",
        );
      }
    } finally {
      window.clearTimeout(timeout);
      setIsResearching(false);
    }
  };

  const toggleField = (
    field: FieldKey,
  ) => {
    setSelectedFields((current) => {
      const next = new Set(current);

      if (next.has(field)) {
        next.delete(field);
      } else {
        next.add(field);
      }

      return next;
    });
  };

  const apply = async () => {
    if (!result) {
      return;
    }

    const suggestion =
      result.suggestion;

    const selected = (
      field: FieldKey
    ) =>
      selectedFields.has(field)
        ? suggestion[field]
        : "";

    const sourceNotes = appendSources
      ? [
          "",
          "Pesquisa técnica assistida:",
          ...result.sources.map(
            (source) =>
              `- ${source.title}: ${source.url}`,
          ),
        ].join("\n")
      : "";

    setIsApplying(true);
    setFeedback(null);

    try {
      await onApply({
        manufacturer:
          selected("manufacturer"),
        model: selected("model"),
        processor:
          selected("processor"),
        memory: selected("memory"),
        storage: selected("storage"),
        categoryHint:
          selected("categoryHint"),
        operatingSystem:
          selected("operatingSystem"),
        notesAppend: sourceNotes,
      });
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : "Não foi possível aplicar as sugestões.",
      );
    } finally {
      setIsApplying(false);
    }
  };

  const suggestion:
    | EquipmentSpecSuggestion
    | null = result?.suggestion ?? null;

  return (
    <div
      className="ativelo-modal-backdrop"
      role="presentation"
    >
      <section
        className="ativelo-modal large ativelo-spec-research-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Pesquisa de especificações"
      >
        <header>
          <div>
            <span>PESQUISA ASSISTIDA</span>
            <h2>
              Especificações do equipamento
            </h2>
          </div>

          <button
            type="button"
            aria-label="Fechar"
            onClick={onClose}
          >
            <AppIcon name="close" size={21} />
          </button>
        </header>

        <div className="ativelo-spec-research-body">
          <div className="ativelo-spec-research-safety">
            <AppIcon name="search" size={22} />
            <div>
              <strong>
                Nada será salvo automaticamente
              </strong>
              <span>
                Abra uma pesquisa gratuita, cole fontes
                oficiais, confira os resultados e selecione
                apenas os campos que deseja aplicar ao
                pré-cadastro.
              </span>
            </div>
          </div>

          <section className="ativelo-spec-research-inputs">
            <label>
              <span>Fabricante identificado</span>
              <input
                value={manufacturer}
                onChange={(event) =>
                  setManufacturer(
                    event.target.value,
                  )
                }
                placeholder="Ex.: Acer"
              />
            </label>

            <label>
              <span>Modelo identificado</span>
              <input
                value={model}
                onChange={(event) =>
                  setModel(event.target.value)
                }
                placeholder="Ex.: Aspire A515-57"
              />
            </label>

            <div className="ativelo-spec-research-guided">
              <div>
                <strong>
                  1. Abra uma pesquisa gratuita
                </strong>
                <span>
                  O Ativelo prepara a busca. Prefira
                  fabricante, suporte oficial ou ficha
                  técnica. Nenhuma API de busca será
                  cobrada.
                </span>
              </div>

              <div className="ativelo-spec-research-search-links">
                {guidedSearchLinks.map((link) => (
                  <a
                    key={link.label}
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <AppIcon
                      name="search"
                      size={17}
                    />
                    {link.label}
                  </a>
                ))}
              </div>
            </div>

            <label className="urls">
              <span>
                2. Cole de uma a três URLs
                <small>
                  Prefira páginas oficiais em HTML. Links
                  de PDF serão preservados como manual,
                  mas podem oferecer menos dados para a
                  extração automática.
                </small>
              </span>

              <textarea
                rows={4}
                value={manualUrls}
                onChange={(event) =>
                  setManualUrls(
                    event.target.value,
                  )
                }
                placeholder={
                  "https://fabricante.com/modelo\nhttps://fabricante.com/manual.pdf"
                }
              />
            </label>

            <button
              type="button"
              className="primary"
              disabled={isResearching}
              onClick={() => void research()}
            >
              <AppIcon name="search" size={18} />
              {isResearching
                ? "Analisando e comparando..."
                : "Analisar URLs informadas"}
            </button>
          </section>

          {feedback && (
            <div className="ativelo-spec-research-feedback">
              {feedback}
            </div>
          )}

          {suggestion && result && (
            <>
              <section className="ativelo-spec-research-summary">
                <div>
                  <span>Confiança geral</span>
                  <strong>
                    {suggestion.confidence}%
                  </strong>
                </div>

                <div>
                  <span>Fontes analisadas</span>
                  <strong>
                    {result.sources.length}
                  </strong>
                </div>

                <div>
                  <span>Pesquisa</span>
                  <strong>
                    {result.cached
                      ? "Resultado reutilizado"
                      : "Resultado novo"}
                  </strong>
                </div>
              </section>

              <section className="ativelo-spec-research-fields">
                <header>
                  <span>Aplicar</span>
                  <span>Campo</span>
                  <span>Sugestão</span>
                  <span>Confiança</span>
                </header>

                {fieldKeys.map((field) => {
                  const value =
                    suggestion[field];
                  const confidence =
                    suggestion.fieldConfidence[
                      field
                    ] ?? 0;

                  return (
                    <article
                      key={field}
                      className={
                        value ? "" : "empty"
                      }
                    >
                      <input
                        type="checkbox"
                        checked={
                          Boolean(value) &&
                          selectedFields.has(
                            field,
                          )
                        }
                        disabled={!value}
                        aria-label={`Aplicar ${fieldLabels[field]}`}
                        onChange={() =>
                          toggleField(field)
                        }
                      />

                      <strong>
                        {fieldLabels[field]}
                      </strong>

                      <span>
                        {value ||
                          "Não encontrado nas fontes"}
                      </span>

                      <small
                        className={`confidence c${Math.floor(
                          confidence / 20,
                        )}`}
                      >
                        {confidenceLabel(
                          confidence,
                        )}{" "}
                        · {confidence}%
                      </small>
                    </article>
                  );
                })}
              </section>

              {(suggestion.documentationUrl ||
                suggestion.imageUrl) && (
                <section className="ativelo-spec-research-resources">
                  {suggestion.documentationUrl && (
                    <a
                      href={
                        suggestion.documentationUrl
                      }
                      target="_blank"
                      rel="noreferrer"
                    >
                      <AppIcon
                        name="search"
                        size={20}
                      />
                      Abrir documentação ou manual
                    </a>
                  )}

                  {suggestion.imageUrl && (
                    <a
                      href={suggestion.imageUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <AppIcon
                        name="image"
                        size={20}
                      />
                      Abrir imagem encontrada
                    </a>
                  )}
                </section>
              )}

              {suggestion.warnings.length > 0 && (
                <section className="ativelo-spec-research-warnings">
                  <strong>
                    Pontos para revisão
                  </strong>

                  <ul>
                    {suggestion.warnings.map(
                      (warning) => (
                        <li key={warning}>
                          {warning}
                        </li>
                      ),
                    )}
                  </ul>
                </section>
              )}

              <section className="ativelo-spec-research-sources">
                <header>
                  <div>
                    <span>FONTES</span>
                    <h3>
                      Verifique antes de aplicar
                    </h3>
                  </div>
                </header>

                <div>
                  {result.sources.map(
                    (source) => (
                      <a
                        key={source.id}
                        href={source.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <span>
                          {sourceTypeLabel(
                            source.sourceType,
                          )}
                        </span>

                        <strong>
                          {source.title}
                        </strong>

                        <small>
                          {source.host}
                        </small>

                        <p>
                          {source.snippet ||
                            "Sem resumo disponível."}
                        </p>
                      </a>
                    ),
                  )}
                </div>
              </section>

              <label className="ativelo-spec-research-append">
                <input
                  type="checkbox"
                  checked={appendSources}
                  onChange={(event) =>
                    setAppendSources(
                      event.target.checked,
                    )
                  }
                />
                Adicionar os links das fontes às
                observações do equipamento
              </label>
            </>
          )}
        </div>

        <footer className="ativelo-spec-research-footer">
          <button
            type="button"
            className="secondary"
            onClick={onClose}
          >
            Cancelar
          </button>

          <button
            type="button"
            className="primary"
            disabled={
              !result ||
              selectedFields.size === 0 ||
              isApplying
            }
            onClick={() => void apply()}
          >
            {isApplying
              ? "Aplicando..."
              : "Aplicar campos selecionados"}
          </button>
        </footer>
      </section>
    </div>
  );
}