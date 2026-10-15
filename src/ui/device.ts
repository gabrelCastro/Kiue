import { useEffect, useState } from 'preact/hooks';

/** Telas estreitas ou baixas (celular em pé ou deitado): layout com palco cheio e painel recolhível. */
const COMPACT = '(max-width: 900px), (max-height: 500px)';
/** Aparelho de toque como entrada principal (celular, tablet). */
const COARSE = '(pointer: coarse)';
/** Tamanho de celular, em pé: o jogo fica melhor deitado. */
const PHONE_PORTRAIT = '(pointer: coarse) and (max-width: 600px) and (orientation: portrait)';

function useMedia(query: string): boolean {
  const get = () => typeof matchMedia === 'function' && matchMedia(query).matches;
  const [matches, setMatches] = useState(get);
  useEffect(() => {
    const mq = matchMedia(query);
    const on = () => setMatches(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return matches;
}

export const useCompact = () => useMedia(COMPACT);
export const useTouchUI = () => useMedia(COARSE);
export const usePhonePortrait = () => useMedia(PHONE_PORTRAIT);
