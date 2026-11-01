/*
 * Cores do Kiuê: fonte única para a cena 3D e para o TS. O CSS repete as mesmas escalas em :root
 * (styles.css); tests/theme.test.ts confere que os dois lados não divergem.
 *
 * Paleta de base: ciano #34BFD7, amarelo #D6C533, magenta #D6337C, petróleo #4A7981, oliva #575440.
 * São três matizes (ciano/petróleo ≈210°, amarelo/oliva ≈100°, magenta ≈359°), cada um claro e escuro.
 *
 * Como as escalas foram feitas (estilo Tailwind/Radix, em OKLCH):
 * - mesma luminosidade percebida por degrau em todas as cores, então o degrau diz o contraste:
 *   600 é o mais claro que serve de texto sobre branco (≥4,5:1), 500 serve para ícone e borda (≥3:1);
 * - o croma segue a cor de base e cai nas pontas; os cinzas ("neutro") levam um tico do matiz da oliva.
 * Ciano e amarelo de base têm 2,2:1 e 1,8:1 contra branco: só como preenchimento, nunca como texto.
 */

export const PALETTE = {
  ciano: '#34bfd7',
  amarelo: '#d6c533',
  magenta: '#d6337c',
  petroleo: '#4a7981',
  oliva: '#575440',
} as const;

type Ramp = Record<50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950, string>;

export const RAMP: Record<'ciano' | 'amarelo' | 'magenta' | 'petroleo' | 'neutro' | 'verde' | 'vermelho', Ramp> = {
  ciano: { 50: '#eefbfd', 100: '#ddf3f8', 200: '#bae7f1', 300: '#8ad7e7', 400: '#37c1d9', 500: '#1ca0b6', 600: '#137e8f', 700: '#0e6674', 800: '#084c58', 900: '#04343c', 950: '#011e23' },
  amarelo: { 50: '#faf9ea', 100: '#f4f0cf', 200: '#e9e19c', 300: '#dbcc4e', 400: '#c1b11c', 500: '#9f9115', 600: '#7d720e', 700: '#655c09', 800: '#4c4505', 900: '#342f02', 950: '#1d1a01' },
  magenta: { 50: '#fef5f8', 100: '#ffe8ee', 200: '#fdd0dd', 300: '#f9b1c8', 400: '#f188ac', 500: '#e3538d', 600: '#c2256e', 700: '#9f1c59', 800: '#791342', 900: '#550a2d', 950: '#330419' },
  petroleo: { 50: '#f3f9fa', 100: '#eaf0f1', 200: '#d5e0e2', 300: '#bbcdd0', 400: '#99b4b8', 500: '#71979d', 600: '#4a7981', 700: '#396269', 800: '#294a4f', 900: '#1a3236', 950: '#0d1c1f' },
  neutro: { 50: '#f8f8f4', 100: '#efefeb', 200: '#dfdeda', 300: '#c9c9c5', 400: '#afaeaa', 500: '#908f8b', 600: '#71706c', 700: '#5b5b57', 800: '#444440', 900: '#2e2e2b', 950: '#1a1917' },
  // estados (ok, erro): convenção que todo mundo já lê, ajustada à luminosidade e ao croma da paleta.
  // O vermelho fica em ≈28° para não se confundir com o magenta (≈359°). O alerta usa o amarelo.
  verde: { 50: '#f0fbf1', 100: '#e5f3e7', 200: '#cce6d0', 300: '#aad6b2', 400: '#7dc18b', 500: '#3fa75d', 600: '#1c8641', 700: '#156d34', 800: '#0d5225', 900: '#073818', 950: '#02200b' },
  vermelho: { 50: '#fef6f4', 100: '#fee9e6', 200: '#fcd3cd', 300: '#f8b6ad', 400: '#f09083', 500: '#e25f53', 600: '#c63029', 700: '#a22620', 800: '#7b1a16', 900: '#560f0c', 950: '#340605' },
};

/**
 * Cor de cada serviço na cena e na interface. Escolhida por busca exaustiva: das atribuições
 * possíveis, a que mais separa peças que costumam ficar ligadas (produtor→fila, fila→consumidor,
 * tópico→Lambda...) também para protanopia, deuteranopia e tritanopia (simulação de Machado 2009).
 * A DLQ é a "fila escura": bordô, com as faixas de alerta amarelas.
 */
export const SERVICE = {
  producer: PALETTE.oliva,
  topic: PALETTE.ciano,
  queue: PALETTE.amarelo,
  dlq: RAMP.magenta[800],
  consumer: PALETTE.magenta,
  lambda: PALETTE.petroleo,
} as const;

/** Estado de cada worker / instância (luz do alçapão, legenda, linha do tempo). */
export const WORKER = {
  idle: RAMP.neutro[400],
  polling: RAMP.ciano[500],
  busy: RAMP.verde[500],
  cold: RAMP.ciano[200],
  down: RAMP.vermelho[600],
  off: RAMP.neutro[100],
} as const;

/** Resultado de uma invocação / tempo contra o timeout. */
export const OUTCOME = {
  ok: RAMP.verde[500],
  warn: PALETTE.amarelo,
  bad: RAMP.vermelho[600],
} as const;

/** Neutros da cena 3D: tons quentes da oliva no lugar dos cinzas frios. */
export const SCENE = {
  fog: RAMP.neutro[100],
  ground: [RAMP.neutro[50], '#e6e5df'] as const,
  /** detalhes escuros: pneus, saias, bocal */
  ink: RAMP.neutro[900],
  /** peças escuras médias: bandejas, células, alçapões */
  dark: RAMP.neutro[700],
  /** metal: rolos, portão */
  metal: RAMP.neutro[500],
  /** plataformas, bases claras */
  light: RAMP.neutro[200],
  /** quase branco: tampos, corpo dos robôs */
  white: RAMP.neutro[50],
  /** contorno da peça selecionada */
  select: RAMP.neutro[950],
  /** ação ligando duas peças / colocando uma */
  connect: RAMP.ciano[500],
  dim: RAMP.neutro[300],
} as const;

/**
 * Cores categóricas (tipos de mensagem, grupos FIFO). Variam em luminosidade além de matiz, como
 * a paleta Okabe-Ito: só matiz some para quem tem daltonismo. Escolhidas por busca exaustiva.
 */
export const CATEGORY = {
  ciano: PALETTE.ciano,
  amarelo: PALETTE.amarelo,
  magenta: PALETTE.magenta,
  bordo: RAMP.magenta[800],
  violeta: '#7b57c8',
  laranja: '#e48233',
  verde: RAMP.verde[700],
} as const;
