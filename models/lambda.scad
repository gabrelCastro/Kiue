// Kiuê — Lambda como estação de robôs sob demanda, v2.
// v2: robô afundado 0,3 no alçapão (na v1 encostava face com face: não-manifold); robô com
//     $fn 16 (até 20 por Lambda); torre 50 → 40 de altura para não dominar a peça; apoio do
//     tubo termina 3 mm abaixo do eixo; faixa de janelas 2 mm mais baixa (o topo dela, em z 38,
//     encostava na base do tubo de entrada: aresta compartilhada, não-manifold).
// Cada instância da função é um robô que sobe de um alçapão quando a Lambda escala e afunda
// quando ela encolhe. Alçapões além do MaximumConcurrency ficam com a tampa travada.
// Escala: 1 unidade do jogo = 100 mm, antes do NODE_SCALE (1,3) que o jogo aplica.
// Convenções: Z para cima; frente em −Y (no jogo vira +z); origem no centro, no chão (a Lambda
// não tem pedestal: a plataforma é a base).
// Entrada da fila pela esquerda (−X), na altura da conexão: 46 mm (PORT_Y 0,6 / 1,3).
// 20 alçapões (teto de concorrência do jogo) num anel de raio 88, deixando livre ±20° em volta
// da entrada (180°). O jogo posiciona os alçapões, robôs, travas e luzes (ver RING_* abaixo).
// Partes:
//   deck         plataforma redonda (cinza-claro)
//   hub          torre hexagonal central (cor do serviço, laranja)
//   hub_detalhe  escuro: faixa de janelas da torre, bocal de entrada
//   baia         um alçapão (disco escuro com aro); origem no centro, no topo da plataforma
//   trava        tampa travada de um alçapão sem instância permitida; mesma origem
//   luz          anel de estado em volta de um alçapão; mesma origem
//   robo_corpo   robô (branco); origem no centro da base do robô; o visor olha para +X
//   robo_faixa   faixa laranja do robô
//   robo_detalhe escuro: saia/rodas, visor, bandeja em cima (onde vai o lote)

parte = "tudo";
PARTES = ["deck", "hub", "hub_detalhe", "baia", "trava", "luz", "robo_corpo", "robo_faixa", "robo_detalhe"];

DECK_R = 110; DECK_H = 14;
HUB_R = 52; HUB_H = 40;             // raio circunscrito do hexágono, altura acima do deck
PORT_Z = 46; PORT_X = 82;
RING_R = 88; RING_N = 20; RING_GAP = 20; // graus livres de cada lado da entrada
BAY_R = 11;
ROBOT_R = 8.5; ROBOT_H = 24.5;      // topo da bandeja
$fn = 32;

function ang(j) = 180 + RING_GAP + j * (360 - 2 * RING_GAP) / (RING_N - 1);

module deck() {
    // disco com chanfro no topo
    cylinder(r = DECK_R, h = DECK_H - 2.5, $fn = 72);
    translate([0, 0, DECK_H - 2.5]) cylinder(r1 = DECK_R, r2 = DECK_R - 2.5, h = 2.5, $fn = 72);
}

module hub() {
    translate([0, 0, DECK_H - 0.3]) {
        cylinder(r = HUB_R, h = HUB_H - 4, $fn = 6);
        translate([0, 0, HUB_H - 4]) cylinder(r1 = HUB_R, r2 = HUB_R - 4, h = 4, $fn = 6);
    }
}

module hub_detalhe() {
    // faixa escura de janelas em volta da torre (saliente 0,6)
    translate([0, 0, DECK_H + 14]) difference() {
        cylinder(r = HUB_R + 0.6, h = 8, $fn = 6);
        translate([0, 0, -1]) cylinder(r = HUB_R - 2, h = 10, $fn = 6);
    }
    // bocal de entrada: tubo da face da torre até a conexão, com anel na ponta
    hull() {
        translate([-HUB_R * cos(30) + 1, 0, PORT_Z]) rotate([0, -90, 0]) cylinder(r = 8, h = 1);
        translate([-PORT_X + 6, 0, PORT_Z]) rotate([0, -90, 0]) cylinder(r = 8, h = 1);
    }
    translate([-PORT_X + 6.3, 0, PORT_Z]) rotate([0, -90, 0]) difference() {
        cylinder(r = 12, h = 4.3);
        translate([0, 0, -1]) cylinder(r = 7, h = 7);
    }
    // apoio do tubo até a plataforma
    translate([-PORT_X + 16, 0, DECK_H - 0.3]) cylinder(r = 3, h = PORT_Z - DECK_H - 3);
}

module baia() {
    // alçapão: disco escuro rebaixado visualmente por um aro
    cylinder(r = BAY_R - 1.5, h = 0.8);
    difference() {
        cylinder(r = BAY_R, h = 1.4);
        translate([0, 0, -1]) cylinder(r = BAY_R - 1.5, h = 3);
    }
}

module trava() {
    // tampa com duas barras cruzadas: "vaga não permitida"
    translate([0, 0, 1]) cylinder(r = BAY_R - 1.2, h = 1.4);
    for (a = [45, -45]) rotate(a) translate([-BAY_R + 2, -1.4, 2.1]) cube([2 * BAY_R - 4, 2.8, 1.6]);
}

module luz() {
    // anel de estado logo fora do aro do alçapão
    difference() {
        cylinder(r = BAY_R + 2.4, h = 1.2);
        translate([0, 0, -1]) cylinder(r = BAY_R + 0.2, h = 3);
    }
}

module robo_corpo() {
    $fn = 16;
    // corpo cilíndrico com cúpula achatada
    translate([0, 0, 2]) cylinder(r = ROBOT_R, h = 14);
    translate([0, 0, 16]) scale([1, 1, 0.55]) sphere(r = ROBOT_R);
}

module robo_faixa() {
    $fn = 16;
    translate([0, 0, 9]) cylinder(r = ROBOT_R + 0.5, h = 3);
}

module robo_detalhe() {
    $fn = 16;
    // saia com rodas
    cylinder(r = ROBOT_R + 0.8, h = 2.3);
    // visor olhando para +X
    translate([ROBOT_R - 2.2, -4.5, 12.5]) cube([3, 9, 3]);
    // mastro e bandeja do lote
    translate([0, 0, 19]) cylinder(r = 2, h = 4);
    translate([0, 0, 22.5]) cylinder(r = 7.5, h = ROBOT_H - 22.5);
}

module em_cada_baia() {
    for (j = [0 : RING_N - 1]) rotate(ang(j)) translate([RING_R, 0, DECK_H]) children();
}

module peca(n) {
    if (n == "deck") deck();
    else if (n == "hub") hub();
    else if (n == "hub_detalhe") hub_detalhe();
    else if (n == "baia") em_cada_baia() baia();
    // conferência: as 4 últimas vagas travadas, robô nas 16 primeiras
    else if (n == "trava") for (j = [RING_N - 4 : RING_N - 1]) rotate(ang(j)) translate([RING_R, 0, DECK_H]) trava();
    else if (n == "luz") em_cada_baia() luz();
    else for (j = [0 : RING_N - 5]) rotate(ang(j)) translate([RING_R, 0, DECK_H + 0.5]) {
        if (n == "robo_corpo") robo_corpo();
        else if (n == "robo_faixa") robo_faixa();
        else if (n == "robo_detalhe") robo_detalhe();
    }
}

exporta = false;
if (parte == "tudo") union() for (p = PARTES) peca(p);
else if (exporta && parte == "baia") baia();
else if (exporta && parte == "trava") trava();
else if (exporta && parte == "luz") luz();
else if (exporta && parte == "robo_corpo") robo_corpo();
else if (exporta && parte == "robo_faixa") robo_faixa();
else if (exporta && parte == "robo_detalhe") robo_detalhe();
else peca(parte);
