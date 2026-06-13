import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { supabase } from "../lib/supabase";

type OrganizationContext = {
  organizationId: string;
  organizationName: string;
  role: string;
};

type CatalogTab = "categories" | "manufacturers" | "models";

type CategoryRecord = {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  is_active: boolean;
};

type ManufacturerRecord = {
  id: string;
  name: string;
  website: string | null;
  support_phone: string | null;
  is_active: boolean;
};

type ModelRecord = {
  id: string;
  name: string;
  model_number: string | null;
  part_number: string | null;
  expected_life_months: number | null;
  default_warranty_months: number | null;
  category_id: string;
  manufacturer_id: string | null;
};

type Props = {
  organization: OrganizationContext;
  onBack: () => void;
};

const tabLabels: Record<CatalogTab, string> = {
  categories: "Categorias",
  manufacturers: "Fabricantes",
  models: "Modelos",
};

export default function AssetCatalogPage({
  organization,
  onBack,
}: Props) {
  const [activeTab, setActiveTab] = useState<CatalogTab>("categories");
  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [manufacturers, setManufacturers] = useState<ManufacturerRecord[]>([]);
  const [models, setModels] = useState<ModelRecord[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("");
  const [supportPhone, setSupportPhone] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [manufacturerId, setManufacturerId] = useState("");
  const [modelNumber, setModelNumber] = useState("");
  const [partNumber, setPartNumber] = useState("");
  const [expectedLifeMonths, setExpectedLifeMonths] = useState("");
  const [warrantyMonths, setWarrantyMonths] = useState("");

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setFeedback(null);

    const organizationId = organization.organizationId;

    const [categoriesResult, manufacturersResult, modelsResult] =
      await Promise.all([
        supabase
          .from("asset_categories")
          .select("id,name,code,description,is_active")
          .eq("organization_id", organizationId)
          .order("name"),
        supabase
          .from("manufacturers")
          .select("id,name,website,support_phone,is_active")
          .eq("organization_id", organizationId)
          .order("name"),
        supabase
          .from("asset_models")
          .select(
            "id,name,model_number,part_number,expected_life_months,default_warranty_months,category_id,manufacturer_id",
          )
          .eq("organization_id", organizationId)
          .order("name"),
      ]);

    const firstError = [
      categoriesResult.error,
      manufacturersResult.error,
      modelsResult.error,
    ].find(Boolean);

    if (firstError) {
      setFeedback({ type: "error", text: firstError.message });
      setIsLoading(false);
      return;
    }

    setCategories((categoriesResult.data ?? []) as CategoryRecord[]);
    setManufacturers(
      (manufacturersResult.data ?? []) as ManufacturerRecord[],
    );
    setModels((modelsResult.data ?? []) as ModelRecord[]);
    setIsLoading(false);
  }, [organization.organizationId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    setName("");
    setCode("");
    setDescription("");
    setWebsite("");
    setSupportPhone("");
    setCategoryId("");
    setManufacturerId("");
    setModelNumber("");
    setPartNumber("");
    setExpectedLifeMonths("");
    setWarrantyMonths("");
    setFeedback(null);
  }, [activeTab]);

  const categoryName = (id: string) =>
    categories.find((item) => item.id === id)?.name ??
    "Categoria não encontrada";

  const manufacturerName = (id: string | null) =>
    id
      ? manufacturers.find((item) => item.id === id)?.name ??
        "Fabricante não encontrado"
      : "Fabricante não definido";

  const counts = useMemo(
    () => ({
      categories: categories.length,
      manufacturers: manufacturers.length,
      models: models.length,
    }),
    [categories, manufacturers, models],
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFeedback(null);

    if (!name.trim()) {
      setFeedback({ type: "error", text: "Informe o nome." });
      return;
    }

    if (activeTab === "models" && !categoryId) {
      setFeedback({
        type: "error",
        text: "Selecione a categoria do modelo.",
      });
      return;
    }

    setIsSaving(true);
    const organization_id = organization.organizationId;

    let result: { error: { message: string } | null };

    if (activeTab === "categories") {
      result = await supabase.from("asset_categories").insert({
        organization_id,
        name: name.trim(),
        code: code.trim() || null,
        description: description.trim() || null,
      });
    } else if (activeTab === "manufacturers") {
      result = await supabase.from("manufacturers").insert({
        organization_id,
        name: name.trim(),
        website: website.trim() || null,
        support_phone: supportPhone.trim() || null,
        notes: description.trim() || null,
      });
    } else {
      result = await supabase.from("asset_models").insert({
        organization_id,
        category_id: categoryId,
        manufacturer_id: manufacturerId || null,
        name: name.trim(),
        model_number: modelNumber.trim() || null,
        part_number: partNumber.trim() || null,
        description: description.trim() || null,
        expected_life_months: expectedLifeMonths
          ? Number.parseInt(expectedLifeMonths, 10)
          : null,
        default_warranty_months: warrantyMonths
          ? Number.parseInt(warrantyMonths, 10)
          : null,
      });
    }

    if (result.error) {
      setFeedback({ type: "error", text: result.error.message });
      setIsSaving(false);
      return;
    }

    setFeedback({
      type: "success",
      text: `${tabLabels[activeTab].slice(0, -1)} cadastrado com sucesso.`,
    });

    setName("");
    setCode("");
    setDescription("");
    setWebsite("");
    setSupportPhone("");
    setCategoryId("");
    setManufacturerId("");
    setModelNumber("");
    setPartNumber("");
    setExpectedLifeMonths("");
    setWarrantyMonths("");
    setIsSaving(false);

    await loadData();
  };

  const records = useMemo(() => {
    if (activeTab === "categories") {
      return categories.map((item) => ({
        id: item.id,
        title: item.name,
        subtitle: item.description || "Sem descrição",
        badge: item.code,
      }));
    }

    if (activeTab === "manufacturers") {
      return manufacturers.map((item) => ({
        id: item.id,
        title: item.name,
        subtitle: item.website || item.support_phone || "Sem contato informado",
        badge: null,
      }));
    }

    return models.map((item) => ({
      id: item.id,
      title: item.name,
      subtitle: `${categoryName(item.category_id)} · ${manufacturerName(
        item.manufacturer_id,
      )}`,
      badge: item.model_number || item.part_number,
    }));
  }, [activeTab, categories, manufacturers, models]);

  return (
    <main className="ativelo-catalog-page">
      <header className="ativelo-catalog-header">
        <div>
          <button type="button" onClick={onBack}>
            ← Voltar ao painel
          </button>
          <p>BASE DO INVENTÁRIO</p>
          <h1>Catálogos</h1>
          <span>
            Padronize categorias, fabricantes e modelos antes de cadastrar os
            equipamentos.
          </span>
        </div>

        <aside>
          <small>Empresa atual</small>
          <strong>{organization.organizationName}</strong>
          <span>{organization.role}</span>
        </aside>
      </header>

      <section className="ativelo-catalog-tabs">
        {(Object.keys(tabLabels) as CatalogTab[]).map((tab) => (
          <button
            className={activeTab === tab ? "active" : ""}
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
          >
            <span>{tabLabels[tab]}</span>
            <strong>{counts[tab]}</strong>
          </button>
        ))}
      </section>

      <section className="ativelo-catalog-content">
        <article className="ativelo-catalog-panel">
          <div className="ativelo-catalog-panel-heading">
            <div>
              <span>NOVO CADASTRO</span>
              <h2>{tabLabels[activeTab].slice(0, -1)}</h2>
            </div>
          </div>

          <form className="ativelo-catalog-form" onSubmit={handleSubmit}>
            <label>
              <span>Nome *</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Informe o nome"
                maxLength={120}
              />
            </label>

            {activeTab === "categories" && (
              <label>
                <span>Código interno</span>
                <input
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  placeholder="Ex.: NOTEBOOK"
                  maxLength={40}
                />
              </label>
            )}

            {activeTab === "manufacturers" && (
              <>
                <label>
                  <span>Site</span>
                  <input
                    value={website}
                    onChange={(event) => setWebsite(event.target.value)}
                    placeholder="https://fabricante.com"
                    maxLength={250}
                  />
                </label>

                <label>
                  <span>Telefone de suporte</span>
                  <input
                    value={supportPhone}
                    onChange={(event) => setSupportPhone(event.target.value)}
                    placeholder="Ex.: 0800 000 0000"
                    maxLength={40}
                  />
                </label>
              </>
            )}

            {activeTab === "models" && (
              <>
                <label>
                  <span>Categoria *</span>
                  <select
                    value={categoryId}
                    onChange={(event) => setCategoryId(event.target.value)}
                  >
                    <option value="">Selecione uma categoria</option>
                    {categories.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>Fabricante</span>
                  <select
                    value={manufacturerId}
                    onChange={(event) =>
                      setManufacturerId(event.target.value)
                    }
                  >
                    <option value="">Não definido</option>
                    {manufacturers.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="ativelo-catalog-row">
                  <label>
                    <span>Número do modelo</span>
                    <input
                      value={modelNumber}
                      onChange={(event) => setModelNumber(event.target.value)}
                      placeholder="Ex.: Latitude 5420"
                      maxLength={120}
                    />
                  </label>

                  <label>
                    <span>Part Number</span>
                    <input
                      value={partNumber}
                      onChange={(event) => setPartNumber(event.target.value)}
                      placeholder="Ex.: PN-001"
                      maxLength={120}
                    />
                  </label>
                </div>

                <div className="ativelo-catalog-row">
                  <label>
                    <span>Vida útil em meses</span>
                    <input
                      type="number"
                      min="1"
                      value={expectedLifeMonths}
                      onChange={(event) =>
                        setExpectedLifeMonths(event.target.value)
                      }
                      placeholder="Ex.: 60"
                    />
                  </label>

                  <label>
                    <span>Garantia padrão em meses</span>
                    <input
                      type="number"
                      min="0"
                      value={warrantyMonths}
                      onChange={(event) =>
                        setWarrantyMonths(event.target.value)
                      }
                      placeholder="Ex.: 12"
                    />
                  </label>
                </div>
              </>
            )}

            <label>
              <span>Descrição ou observações</span>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Informações adicionais"
                rows={4}
                maxLength={600}
              />
            </label>

            {feedback && (
              <div className={`ativelo-catalog-feedback ${feedback.type}`}>
                {feedback.text}
              </div>
            )}

            <button type="submit" disabled={isSaving}>
              {isSaving
                ? "Salvando..."
                : `Cadastrar ${tabLabels[activeTab]
                    .slice(0, -1)
                    .toLowerCase()}`}
            </button>
          </form>
        </article>

        <article className="ativelo-catalog-panel list">
          <div className="ativelo-catalog-panel-heading">
            <div>
              <span>REGISTROS</span>
              <h2>{tabLabels[activeTab]}</h2>
            </div>

            <button type="button" onClick={() => void loadData()}>
              Atualizar
            </button>
          </div>

          {isLoading ? (
            <div className="ativelo-catalog-empty">Carregando registros...</div>
          ) : records.length === 0 ? (
            <div className="ativelo-catalog-empty">
              <strong>Nenhum registro encontrado</strong>
              <span>Use o formulário ao lado para iniciar o catálogo.</span>
            </div>
          ) : (
            <div className="ativelo-catalog-records">
              {records.map((record) => (
                <div key={record.id}>
                  <i>{record.title.slice(0, 1).toUpperCase()}</i>
                  <span>
                    <strong>{record.title}</strong>
                    <small>{record.subtitle}</small>
                  </span>
                  {record.badge && <b>{record.badge}</b>}
                </div>
              ))}
            </div>
          )}
        </article>
      </section>
    </main>
  );
}
