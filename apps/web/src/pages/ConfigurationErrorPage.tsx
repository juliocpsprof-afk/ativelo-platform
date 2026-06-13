type Props = {
  message: string;
};

export default function ConfigurationErrorPage({ message }: Props) {
  return (
    <main className="configuration-shell">
      <section className="configuration-card">
        <span className="configuration-icon">!</span>
        <h1>Configuração incompleta</h1>
        <p>{message}</p>
        <code>apps/web/.env.local</code>
      </section>
    </main>
  );
}