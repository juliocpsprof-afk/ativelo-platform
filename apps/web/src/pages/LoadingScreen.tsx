export default function LoadingScreen() {
  return (
    <main className="loading-shell" aria-live="polite">
      <div className="loading-brand-mark">A</div>
      <strong>Ativelo</strong>
      <span>Preparando seu ambiente...</span>
      <div className="loading-line" />
    </main>
  );
}