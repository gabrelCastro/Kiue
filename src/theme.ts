/*
 * Cores do Kiuê: fonte única para a cena 3D e para o TS. O CSS repete as escalas e os tokens em
 * :root (styles.css); tests/game/theme.test.ts confere que os dois lados não divergem.
 *
 * Paleta "azul elétrico": interface quase neutra (ardósia), um azul forte como cor principal e um
 * coral para o próximo passo. Dois modos, claro e noturno, com os mesmos papéis.
 *
 * Escalas em OKLCH com a mesma luminosidade por degrau em todas as cores: o degrau diz o contraste
 * (600 serve de texto sobre branco, ≥4,5:1; 500 serve para ícone e borda, ≥3:1).
 */

export type ThemeMode = 'light' | 'dark';

export const PALETTE = {
  azul: '#2f5bea',
  coral: '#ff7a59',
  ambar: '#ffc531',
  teal: '#16a394',
  ardosia: '#59606d',
  bordo: '#9b1d3a',
} as const;

type Ramp = Record<50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950, string>;

export const RAMP: Record<'azul' | 'coral' | 'ambar' | 'teal' | 'bordo' | 'neutro' | 'verde' | 'vermelho', Ramp> = {
  azul: { 50: '#f5f8fe', 100: '#e7effe', 200: '#cfdeff', 300: '#b0c8fe', 400: '#89abfd', 500: '#5c88f8', 600: '#325fee', 700: '#244acb', 800: '#19369b', 900: '#0e246e', 950: '#051344' },
  coral: { 50: '#fff5f3', 100: '#ffe9e3', 200: '#fed3c7', 300: '#ffb4a0', 400: '#ff8769', 500: '#de6547', 600: '#b04e36', 700: '#903f2b', 800: '#6d2e1e', 900: '#4c1e12', 950: '#2d0f08' },
  ambar: { 50: '#fef7e8', 100: '#ffedc7', 200: '#ffd988', 300: '#f9bf27', 400: '#d9a513', 500: '#b3880e', 600: '#8d6a08', 700: '#735605', 800: '#564003', 900: '#3b2b01', 950: '#221801' },
  teal: { 50: '#effbf9', 100: '#e3f2ef', 200: '#c7e6e0', 300: '#a2d5cc', 400: '#6ebfb3', 500: '#1aa596', 600: '#028276', 700: '#026a5f', 800: '#024f47', 900: '#023630', 950: '#011f1b' },
  bordo: { 50: '#fef5f6', 100: '#fbeaea', 200: '#f2d6d8', 300: '#e8bcbf', 400: '#da9a9f', 500: '#c8727b', 600: '#b24757', 700: '#a0233e', 800: '#7e0f2b', 900: '#58071c', 950: '#35030e' },
  // cinza ardósia: um tico de azul, para conversar com a cor principal
  neutro: { 50: '#f5f8fe', 100: '#ebeff4', 200: '#dbdee4', 300: '#c6c9cf', 400: '#aaaeb4', 500: '#8c8f96', 600: '#6d7076', 700: '#585b61', 800: '#414449', 900: '#2b2e32', 950: '#171a1d' },
  // estados: a convenção que todo mundo lê, na luminosidade da paleta
  verde: { 50: '#f0fbf2', 100: '#e5f2e8', 200: '#cce6d2', 300: '#abd5b5', 400: '#7ec090', 500: '#42a665', 600: '#218548', 700: '#196c3a', 800: '#10512a', 900: '#08381b', 950: '#03200d' },
  vermelho: { 50: '#fef6f5', 100: '#fee9e7', 200: '#fcd3cf', 300: '#f8b6b0', 400: '#f08f89', 500: '#e35e5b', 600: '#c62e35', 700: '#a2242a', 800: '#7b191d', 900: '#560f12', 950: '#340607' },
};

/**
 * Tudo o que a cena 3D pinta, num modo. A cor de cada serviço foi escolhida por busca exaustiva com
 * simulação de daltonismo (Machado 2009): o tópico é âmbar porque o violeta se confundia com o azul
 * da fila. No noturno as peças ficam um pouco mais claras, para aparecer sobre o chão escuro.
 */
interface SceneTheme {
  service: { producer: string; topic: string; queue: string; dlq: string; consumer: string; lambda: string };
  worker: { idle: string; polling: string; busy: string; cold: string; down: string; off: string };
  outcome: { ok: string; warn: string; bad: string };
  scene: {
    fog: string;
    /** degradê do fundo (em cima, embaixo) e a vinheta nos cantos */
    ground: readonly [string, string];
    vignette: string;
    /** ladrilho do chão: fundo, linhas finas, borda do ladrilho */
    tile: readonly [string, string, string];
    /** canos comuns e os do tópico (base, faixa que corre) */
    pipe: readonly [string, string];
    topicPipe: readonly [string, string];
    /** esteira da fila (borracha, ripas) */
    belt: readonly [string, string];
    ink: string;
    dark: string;
    metal: string;
    light: string;
    white: string;
    select: string;
    connect: string;
    dim: string;
    /** braços e faixas de alerta */
    accent: string;
    /** barra de progresso parada e consumidor caído */
    bar: string;
    downBody: string;
    /** cor para onde as bases das peças se misturam (claras no dia, grafite à noite) */
    base: string;
  };
}

const LIGHT: SceneTheme = {
  service: { producer: PALETTE.ardosia, topic: PALETTE.ambar, queue: PALETTE.azul, dlq: PALETTE.bordo, consumer: PALETTE.coral, lambda: PALETTE.teal },
  worker: { idle: RAMP.neutro[400], polling: RAMP.azul[500], busy: RAMP.verde[500], cold: RAMP.azul[200], down: RAMP.vermelho[600], off: RAMP.neutro[100] },
  outcome: { ok: RAMP.verde[500], warn: PALETTE.ambar, bad: RAMP.vermelho[600] },
  scene: {
    fog: RAMP.neutro[100],
    ground: [RAMP.neutro[50], '#e4e8ee'],
    vignette: 'rgba(110, 120, 140, 0.18)',
    tile: ['#f7f9fc', RAMP.neutro[100], RAMP.neutro[200]],
    pipe: [RAMP.neutro[200], RAMP.neutro[400]],
    topicPipe: [RAMP.ambar[100], RAMP.ambar[300]],
    belt: [RAMP.neutro[800], RAMP.neutro[700]],
    ink: RAMP.neutro[900],
    dark: RAMP.neutro[700],
    metal: RAMP.neutro[500],
    light: RAMP.neutro[200],
    white: RAMP.neutro[50],
    select: RAMP.neutro[950],
    connect: RAMP.azul[500],
    dim: RAMP.neutro[300],
    accent: PALETTE.ambar,
    bar: RAMP.neutro[800],
    downBody: RAMP.vermelho[300],
    base: '#ffffff',
  },
};

const DARK: SceneTheme = {
  service: { producer: '#8a93a3', topic: PALETTE.ambar, queue: '#4f7bff', dlq: '#c23a5a', consumer: '#ff8a6b', lambda: '#2cc2b0' },
  worker: { idle: RAMP.neutro[600], polling: RAMP.azul[400], busy: RAMP.verde[400], cold: RAMP.azul[200], down: RAMP.vermelho[500], off: RAMP.neutro[800] },
  outcome: { ok: RAMP.verde[400], warn: PALETTE.ambar, bad: RAMP.vermelho[500] },
  scene: {
    fog: '#0e1117',
    ground: ['#151a23', '#0b0e13'],
    vignette: 'rgba(0, 0, 0, 0.35)',
    tile: ['#121620', '#1a1f2a', '#232a37'],
    pipe: ['#2a303c', '#4a5366'],
    topicPipe: [RAMP.ambar[900], RAMP.ambar[400]],
    belt: ['#1b1f27', '#2b313d'],
    ink: '#14171d',
    dark: '#2c323d',
    metal: '#626b7c',
    light: '#3a4150',
    white: '#c9cfd9',
    select: '#e9edf3',
    connect: RAMP.azul[400],
    dim: '#3a4150',
    accent: PALETTE.ambar,
    bar: '#9aa3b2',
    downBody: RAMP.vermelho[400],
    base: '#1c2230',
  },
};

let current: ThemeMode = 'light';

/* Objetos vivos: a cena lê daqui quando é montada. `setThemeMode` troca o conteúdo deles. */
export const SERVICE = { ...LIGHT.service };
export const WORKER = { ...LIGHT.worker };
export const OUTCOME = { ...LIGHT.outcome };
export const SCENE = { ...LIGHT.scene };

export function themeMode(): ThemeMode {
  return current;
}

/** Troca as cores da cena (a interface troca sozinha pelo CSS). A cena precisa ser remontada. */
export function setThemeMode(mode: ThemeMode): void {
  current = mode;
  const t = mode === 'dark' ? DARK : LIGHT;
  Object.assign(SERVICE, t.service);
  Object.assign(WORKER, t.worker);
  Object.assign(OUTCOME, t.outcome);
  Object.assign(SCENE, t.scene);
}

/** Cores de cada modo (os testes conferem contra o CSS). */
export const SCENE_THEMES = { light: LIGHT, dark: DARK } as const;

/**
 * Cores categóricas (tipos de mensagem, grupos FIFO): variam em luminosidade além de matiz, como a
 * paleta Okabe-Ito, e foram escolhidas por busca exaustiva para não se confundirem com daltonismo.
 * Iguais nos dois modos (as mensagens viajam sobre a esteira escura nos dois).
 */
export const CATEGORY = {
  azulClaro: RAMP.azul[400],
  violeta: '#7c5cff',
  ambar: PALETTE.ambar,
  rosa: '#df5e97',
  marrom: RAMP.coral[700],
  coral: PALETTE.coral,
  verdeEscuro: RAMP.teal[700],
  mostarda: RAMP.ambar[600],
} as const;
