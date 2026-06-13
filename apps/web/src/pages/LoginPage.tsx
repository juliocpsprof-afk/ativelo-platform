import { useState, type FormEvent } from "react";
import { useAuth } from "../contexts/AuthContext";

type Mode = "login" | "signup";

function translateAuthError(message: string) {
  const normalized = message.toLowerCase();

  if (normalized.includes("invalid login credentials")) {
    return "E-mail ou senha incorretos.";
  }

  if (normalized.includes("email not confirmed")) {
    return "Confirme o e-mail antes de entrar.";
  }

  if (normalized.includes("user already registered")) {
    return "Este e-mail já possui uma conta.";
  }

  if (normalized.includes("password should be")) {
    return "A senha precisa ter pelo menos 8 caracteres.";
  }

  return message;
}

export default function LoginPage() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<"error" | "success">("error");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    if (mode === "signup" && fullName.trim().length < 3) {
      setMessageType("error");
      setMessage("Informe seu nome completo.");
      return;
    }

    if (password.length < 8) {
      setMessageType("error");
      setMessage("A senha precisa ter pelo menos 8 caracteres.");
      return;
    }

    setIsSubmitting(true);

    try {
      if (mode === "login") {
        const result = await signIn(email, password);

        if (result.error) {
          setMessageType("error");
          setMessage(translateAuthError(result.error));
        }
      } else {
        const result = await signUp(fullName, email, password);

        if (result.error) {
          setMessageType("error");
          setMessage(translateAuthError(result.error));
        } else if (result.needsEmailConfirmation) {
          setMessageType("success");
          setMessage(
            "Conta criada. Abra seu e-mail, confirme o cadastro e depois entre no Ativelo.",
          );
          setMode("login");
          setPassword("");
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  function changeMode(nextMode: Mode) {
    setMode(nextMode);
    setMessage(null);
    setPassword("");
  }

  return (
    <main className="auth-shell">
      <section className="auth-showcase">
        <div className="auth-showcase-content">
          <div className="auth-brand">
            <span className="auth-brand-mark">A</span>
            <div>
              <strong>Ativelo</strong>
              <span>Do patrimônio ao diagnóstico.</span>
            </div>
          </div>

          <div className="auth-copy">
            <span className="auth-kicker">GESTÃO INTELIGENTE DE TI</span>
            <h1>Todo equipamento tem uma história. O Ativelo organiza cada capítulo.</h1>
            <p>
              Inventário, QR Code, chamados, manutenção, auditorias e diagnóstico
              em uma plataforma única.
            </p>
          </div>

          <div className="auth-feature-grid" aria-label="Recursos do Ativelo">
            <div>
              <span>▦</span>
              <strong>Identificação rápida</strong>
              <small>QR Code e leitura de etiquetas</small>
            </div>
            <div>
              <span>⚙</span>
              <strong>Manutenção organizada</strong>
              <small>Preventivas e corretivas</small>
            </div>
            <div>
              <span>⌁</span>
              <strong>Inventário conectado</strong>
              <small>Agentes e descoberta de rede</small>
            </div>
          </div>
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-card">
          <div className="auth-mobile-brand">
            <span className="auth-brand-mark">A</span>
            <strong>Ativelo</strong>
          </div>

          <div className="auth-card-heading">
            <span>{mode === "login" ? "ACESSO SEGURO" : "PRIMEIRO ACESSO"}</span>
            <h2>{mode === "login" ? "Entre na sua conta" : "Crie sua conta"}</h2>
            <p>
              {mode === "login"
                ? "Use suas credenciais para acessar o painel."
                : "O primeiro usuário poderá criar a empresa no próximo passo."}
            </p>
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
            {mode === "signup" && (
              <label>
                <span>Nome completo</span>
                <input
                  autoComplete="name"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  placeholder="Seu nome completo"
                  required
                />
              </label>
            )}

            <label>
              <span>E-mail</span>
              <input
                autoComplete="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="nome@empresa.com.br"
                required
              />
            </label>

            <label>
              <span>Senha</span>
              <input
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Mínimo de 8 caracteres"
                required
                minLength={8}
              />
            </label>

            {message && (
              <div className={`auth-message ${messageType}`} role="alert">
                {message}
              </div>
            )}

            <button className="auth-submit" disabled={isSubmitting} type="submit">
              {isSubmitting
                ? "Processando..."
                : mode === "login"
                  ? "Entrar no Ativelo"
                  : "Criar minha conta"}
            </button>
          </form>

          <div className="auth-switch">
            <span>
              {mode === "login" ? "Ainda não possui acesso?" : "Já possui uma conta?"}
            </span>
            <button
              type="button"
              onClick={() => changeMode(mode === "login" ? "signup" : "login")}
            >
              {mode === "login" ? "Criar conta inicial" : "Voltar ao login"}
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}