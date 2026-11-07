/** Estrelas de uma fase (home, resultado). Arquivo próprio para a home não carregar a tela de resultado. */
export function Stars({ n, total = 3 }: { n: number; total?: number }) {
  return (
    <span class="stars" aria-label={`${n} de ${total} estrelas`}>
      {Array.from({ length: total }, (_, i) => (
        <span class={i < n ? 'on' : 'off'}>★</span>
      ))}
    </span>
  );
}
