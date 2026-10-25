// Kiuê — Fila SQS (tubo de vidro com esteira), v2.
// v2: bocal mais curto (saía 1,7 mm da área da peça no chão: 196,7 > 195); aros de 3 → 4 mm.
// v3: no jogo, as guias de dentro somem sob a fila cheia; a FIFO ganha um trilho no meio do teto
//     com setas para a saída, visível sempre.
// v4: menos triângulos para o jogo: $fn 32 → 16 (bocais e roletes são pequenos na tela);
//     faixas de alerta só nas placas (de 17 para 9 por tampa).
// Escala: 1 unidade do jogo = 100 mm; a fila é modelada no tamanho final (o jogo não amplia).
// Convenções: Z para cima; frente em −Y (no jogo vira +z); X ao longo da fila, cabeça à direita (+X).
// Origem no centro, no topo do pedestal. O vidro (caixa 360 × 100 × 110) e a faixa da esteira que
// rola ficam no código do jogo; aqui está o que é sólido em volta deles.
// Conexões: entrada em x = −180 e saída em x = +180, a 44 mm do pedestal (PORT_Y 0,6 − LIFT 0,16).
// Mensagens: 9 colunas × 4 camadas de pacotes 30 × 22 × 30 sobre a esteira (z ≈ 6,5 a 103).
// Partes:
//   moldura  cor do serviço (rosa; vermelho na DLQ): tampas das pontas, aros e barras de cima
//   base     cinza-escuro: bandeja e saias laterais da esteira
//   detalhe  grafite: bocais de entrada e saída, fundo dos bocais, placas das tampas
//   rolos    metal: roletes das pontas da esteira
//   guias    só na FIFO: paredes baixas que formam uma pista única + trilho com setas no teto
//   alerta   só na DLQ: faixas inclinadas (amarelas) sobre as placas das tampas

parte = "tudo";
fifo = true;
dlq = true;
PARTES = ["moldura", "base", "detalhe", "rolos", "guias", "alerta"];

L = 360; D = 100; H = 110;     // vidro
CAP_T = 16; CAP_D = 114; CAP_H = 122; CAP_CH = 4;
PORT_Z = 44;
BAR = 6;                        // barra de cima (seção quadrada)
HOOP_X = [-60, 60]; HOOP_T = 4; HOOP_W = 4;
TRAY_H = 6; SKIRT_H = 12; SKIRT_T = 4;
ROLL_X = 164; ROLL_R = 6;
GUIDE_Y = 19; GUIDE_T = 3; GUIDE_H = 10;
$fn = 16;

// caixa centrada em XY, de z = 0 a h, com chanfro c em todas as arestas
module cbox(w, d, h, c) {
    hull() {
        translate([-w / 2 + c, -d / 2, c]) cube([w - 2 * c, d, h - 2 * c]);
        translate([-w / 2, -d / 2 + c, c]) cube([w, d - 2 * c, h - 2 * c]);
        translate([-w / 2 + c, -d / 2 + c, 0]) cube([w - 2 * c, d - 2 * c, h]);
    }
}

module tampa(s) {
    // s = −1 (entrada, esquerda) ou +1 (saída, direita)
    difference() {
        translate([s * (L / 2), 0, 0]) cbox(CAP_T, CAP_D, CAP_H, CAP_CH);
        translate([s * (L / 2 + CAP_T / 2 - 6), 0, PORT_Z]) rotate([0, 90, 0]) cylinder(r = 9, h = 12, center = true);
    }
}

module moldura() {
    tampa(-1); tampa(1);
    // barras ao longo das arestas de cima do vidro (afundadas 0,3 nas tampas)
    for (y = [-1, 1]) translate([0, y * (D / 2), H]) cbox(L + 0.6, BAR, BAR, 1.2);
    // aros em volta do vidro: dão a leitura de "tubo"
    for (x = HOOP_X) translate([x, 0, 0]) difference() {
        translate([0, 0, TRAY_H - 0.3]) cbox(HOOP_W, D + 2 * HOOP_T, H - TRAY_H + HOOP_T + 0.3, 0.8);
        translate([-HOOP_W, -D / 2, -1]) cube([2 * HOOP_W, D, H + 1]);
    }
}

module base() {
    // bandeja: vai de tampa a tampa e encosta nelas
    cbox(L + 0.6, D, TRAY_H, 1.5);
    // saias laterais, com recorte nos roletes
    for (y = [-1, 1]) translate([0, y * (D / 2 - SKIRT_T / 2), 0]) cbox(L + 0.6, SKIRT_T, SKIRT_H, 1);
}

module rolos() {
    // roletes nas pontas, entre as saias (sobrepostos 0,3 nelas e na bandeja)
    for (x = [-ROLL_X, ROLL_X]) translate([x, 0, TRAY_H]) rotate([90, 0, 0])
        cylinder(r = ROLL_R, h = D - 2 * SKIRT_T + 0.6, center = true);
}

module bocal(s) {
    // anel saliente para fora da tampa, com fundo escuro (a conexão "entra" nele)
    translate([s * (L / 2 + CAP_T / 2 - 0.3), 0, PORT_Z]) rotate([0, s * 90, 0])
        difference() {
            union() {
                cylinder(r = 15, h = 3.5);
                translate([0, 0, 3.5]) cylinder(r1 = 15, r2 = 13, h = 2.5);
            }
            translate([0, 0, -1]) cylinder(r = 9, h = 12);
        }
    // fundo do furo da tampa: encosta no fim do furo (sem bolsão de ar)
    translate([s * (L / 2 + CAP_T / 2 - 12.3), 0, PORT_Z]) rotate([0, 90, 0]) cylinder(r = 9.3, h = 2, center = true);
}

module placa(s) {
    // placa em cima da tampa
    translate([s * (L / 2), 0, CAP_H - 0.3]) cbox(CAP_T - 4, CAP_D - 14, 3.3, 0.8);
}

module detalhe() { bocal(-1); bocal(1); placa(-1); placa(1); }

module guias() {
    for (y = [-GUIDE_Y, GUIDE_Y]) translate([0, y, TRAY_H - 0.3]) cbox(2 * (ROLL_X - ROLL_R - 2), GUIDE_T, GUIDE_H + 0.3, 1);
    // trilho no meio do teto, de tampa a tampa, com setas ">" apontando para a cabeça (+X)
    translate([0, 0, H]) cbox(L + 0.6, 8, 5, 1.2);
    for (x = [-140 : 56 : 140]) translate([x, 0, H + 4.7])
        linear_extrude(height = 2.8) polygon([[-10, -17], [-1, -17], [10, 0], [-1, 17], [-10, 17], [-1, 0]]);
}

module alerta() {
    // faixas a 45° sobre as placas: um ressalto de 1 mm recortado no formato da placa
    for (s = [-1, 1]) intersection() {
        translate([s * (L / 2), 0, CAP_H + 2.7]) cbox(CAP_T - 4, CAP_D - 14, 1.3, 0.3);
        for (i = [-4 : 4]) translate([s * (L / 2) + 0, i * 14, CAP_H]) rotate([0, 0, 45]) cube([4.5, 40, 10], center = true);
    }
}

module peca(n) {
    if (n == "moldura") moldura();
    else if (n == "base") base();
    else if (n == "detalhe") detalhe();
    else if (n == "rolos") rolos();
    else if (n == "guias") { if (fifo) guias(); }
    else if (n == "alerta") { if (dlq) alerta(); }
}

if (parte == "tudo") union() for (p = PARTES) peca(p);
else peca(parte);
