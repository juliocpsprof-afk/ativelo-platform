import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";

type Props = {
  onCreated: () => Promise<void> | void;
};

function createSlug(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export default function OrganizationSetupPage({ onCreated }: Props) {
  const { user, signOut } = useAuth();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugWasEdited, setSlugWasEdited] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slugWasEdited) {
      setSlug(createSlug(name));
    }
  }, [name, slugWasEdited]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (name.trim().length < 2 || slug.length < 2) {
      setError("Informe o nome da empresa e um identificador válido.");
      return;
    }

    setIsSubmitting(true);

    try {
      const { error: rpcError } = await supabase.rpc(
        "create_organization_with_owner",
        {
          p_name: name.trim(),
          p_slug: slug,
        },
      );

      if (rpcError) {
        if (rpcError.message.toLowerCase().includes("duplicate key")) {
          setError("Este identificador já está sendo utilizado. Escolha outro.");
        } else {
          setError(rpcError.message);
        }
        return;
      }

      await onCreated();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="setup-shell">
      <section className="setup-card">
        <div className="setup-step">CONFIGURAÇÃO INICIAL</div>
        <h1>Vamos cadastrar sua empresa</h1>
        <p>
          Esta será a organização principal do Ativelo. Unidades, usuários e
          equipamentos serão vinculados a ela.
        </p>

        <form className="setup-form" onSubmit={handleSubmit}>
          <label>
            <span>Nome da empresa</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ex.: Instituto Wisdom"
              autoFocus
              required
            />
          </label>

          <label>
            <span>Identificador interno</span>
            <div className="slug-field">
              <span>ativelo/</span>
              <input
                value={slug}
                onChange={(event) => {
                  setSlugWasEdited(true);
                  setSlug(createSlug(event.target.value));
                }}
                placeholder="instituto-wisdom"
                required
              />
            </div>
            <small>Usaremos este endereço para organizar os dados da empresa.</small>
          </label>

          {error && <div className="auth-message error">{error}</div>}

          <button className="auth-submit" disabled={isSubmitting} type="submit">
            {isSubmitting ? "Criando empresa..." : "Criar empresa e continuar"}
          </button>
        </form>

        <footer className="setup-footer">
          <span>Conta: {user?.email}</span>
          <button type="button" onClick={() => void signOut()}>
            Sair
          </button>
        </footer>
      </section>
    </main>
  );
}