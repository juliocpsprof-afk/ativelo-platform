import {
  useMemo,
  useState,
  type FormEvent,
} from "react";

import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../lib/supabase";

export default function InviteFirstAccessPage() {
  const { user } = useAuth();

  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] =
    useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const invitationData = useMemo(
    () => ({
      name:
        String(
          user?.user_metadata?.full_name ??
            user?.email ??
            "Usuário",
        ).trim(),
      company:
        String(
          user?.user_metadata?.organization_name ??
            "sua empresa",
        ).trim(),
      role:
        String(
          user?.user_metadata?.role_label ??
            "Usuário",
        ).trim(),
    }),
    [user],
  );

  const submit = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    setFeedback(null);

    if (password.length < 8) {
      setFeedback({
        type: "error",
        text:
          "A senha precisa ter pelo menos 8 caracteres.",
      });
      return;
    }

    if (password !== confirmation) {
      setFeedback({
        type: "error",
        text: "As senhas não coincidem.",
      });
      return;
    }

    if (!user) {
      setFeedback({
        type: "error",
        text:
          "A sessão do convite não está disponível. Abra novamente o link recebido.",
      });
      return;
    }

    setIsSaving(true);

    const nextMetadata = {
      ...user.user_metadata,
      must_set_password: false,
      ativelo_invited: true,
      ativelo_first_access_completed_at:
        new Date().toISOString(),
    };

    const { error } = await supabase.auth.updateUser({
      password,
      data: nextMetadata,
    });

    if (error) {
      setFeedback({
        type: "error",
        text: error.message,
      });
      setIsSaving(false);
      return;
    }

    setFeedback({
      type: "success",
      text:
        "Senha criada com sucesso. O Ativelo será aberto agora.",
    });

    await supabase.auth.refreshSession();

    window.setTimeout(() => {
      window.location.replace(window.location.origin);
    }, 700);
  };

  return (
    <main className="ativelo-first-access">
      <section className="ativelo-first-access__card">
        <div className="ativelo-first-access__brand">
          <img
            src="/assets/ativelo-logo.png"
            alt="Ativelo"
          />
          <span>PRIMEIRO ACESSO</span>
        </div>

        <h1>Crie sua senha</h1>

        <p>
          Olá, <strong>{invitationData.name}</strong>.
          Você recebeu acesso à empresa{" "}
          <strong>{invitationData.company}</strong> com o
          perfil <strong>{invitationData.role}</strong>.
        </p>

        <form onSubmit={submit}>
          <label>
            <span>Nova senha</span>
            <input
              type="password"
              value={password}
              onChange={(event) =>
                setPassword(event.target.value)
              }
              minLength={8}
              autoComplete="new-password"
              required
            />
            <small>Mínimo de 8 caracteres.</small>
          </label>

          <label>
            <span>Confirmar senha</span>
            <input
              type="password"
              value={confirmation}
              onChange={(event) =>
                setConfirmation(event.target.value)
              }
              minLength={8}
              autoComplete="new-password"
              required
            />
          </label>

          {feedback && (
            <div
              className={`ativelo-first-access__feedback ${feedback.type}`}
            >
              {feedback.text}
            </div>
          )}

          <button
            type="submit"
            className="primary"
            disabled={isSaving}
          >
            {isSaving
              ? "Salvando senha..."
              : "Criar senha e entrar"}
          </button>
        </form>

        <small className="ativelo-first-access__security">
          O Ativelo nunca solicitará sua senha por e-mail
          ou WhatsApp.
        </small>
      </section>
    </main>
  );
}