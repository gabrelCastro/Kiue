// Kiuê — Consumidor como bancada de triagem com braços robóticos, v2.
// v2: braços miúdos na v1 (sumiriam na câmera do jogo): 50% maiores e mais grossos; braço
//     recua para (−15, 15) porque o anel de luz encostava na caixa; bancada 140 → 146 de fundo
//     para a fileira de trás caber.
// v3: no jogo os braços ainda sumiam perto das caixas: ~35% maiores (ombro 12, braço 30,
//     antebraço 32) e mais grossos; pedestal r 8.
// Cada worker é uma célula: um tapete onde a caixa (mensagem) pousa e um braço de 3 articulações.
// Escala: 1 unidade do jogo = 100 mm, antes do NODE_SCALE (1,3) que o jogo aplica.
// Convenções: Z para cima; frente em −Y (no jogo vira +z); origem no centro, no topo do pedestal.
// Entrada da fila pela esquerda (−X), na altura da conexão (30 mm).
// Células: grade de até 3 × 3 com passo de 45 mm (o jogo posiciona). Dentro da célula, a caixa
// fica 5 mm para a frente e para a direita do centro e o braço 15 mm para trás e para a esquerda.
// Partes (as do braço saem cada uma na própria articulação, para o jogo girar):
//   corpo      gabinete da bancada (cor do serviço; vermelho quando o consumidor cai)
//   detalhe    escuro: rodapé, bocal de entrada, puxadores
//   tampo      superfície de trabalho clara
//   celula     tapete + pedestal do braço; origem no centro da célula, no fundo do tapete
//   luz        anel de estado em volta do pedestal (ocioso/buscando/processando/caído)
//   giro       base giratória; origem no topo do pedestal; ombro a 12 mm de altura
//   superior   braço; origem no ombro, para cima (+Z), 30 mm até o cotovelo; eixo ao longo de Y
//   antebraco  antebraço + garra; origem no cotovelo, para cima, ponta a 32 mm

parte = "tudo";
PARTES = ["corpo", "detalhe", "tampo", "celula", "luz", "giro", "superior", "antebraco"];

W = 150; D = 146; H = 38;        // gabinete
CH = 3; R = 8;
TOP_T = 2;                       // tampo
PORT_Z = 30;
CELL = 45; MAT = 38; MAT_T = 1;
ARM_AT = [-15, 15];              // pedestal do braço na célula (x, y do .scad: atrás à esquerda)
PED_R = 8; PED_H = 6;
SHOULDER = 12; L1 = 30; L2 = 32;
$fn = 20;

module rbox(w, d, h, r, ch) {
    hull() for (sx = [-1, 1], sy = [-1, 1]) {
        translate([sx * (w / 2 - r), sy * (d / 2 - r), 0]) cylinder(r = r, h = h - ch);
        translate([sx * (w / 2 - r), sy * (d / 2 - r), 0]) cylinder(r = r - ch, h = h);
    }
}

module corpo() {
    difference() {
        rbox(W, D, H, R, CH);
        // rodapé recuado
        difference() {
            translate([-W, -D, -1]) cube([2 * W, 2 * D, 7]);
            translate([0, 0, -2]) rbox(W - 8, D - 8, 10, R - 4, 0.01);
        }
        // frisos das gavetas na frente
        for (x = [-W / 2 + 10, -2]) translate([x, -D / 2 - 1, 10]) difference() {
            cube([W / 2 - 18, 3, 22]);
            translate([1.5, -1, 1.5]) cube([W / 2 - 21, 5, 19]);
        }
        // furo do bocal
        translate([-W / 2 - 1, 0, PORT_Z]) rotate([0, 90, 0]) cylinder(r = 9, h = 6);
    }
}

module detalhe() {
    // rodapé escuro (dentro do recuo, encostado no gabinete)
    translate([0, 0, 0]) rbox(W - 8.6, D - 8.6, 6.3, R - 4.3, 0.01);
    // puxadores das gavetas
    for (x = [-W / 2 + 10, -2]) translate([x + (W / 2 - 18) / 2 - 10, -D / 2 - 2.2, 27]) cube([20, 2.5, 2.5]);
    // bocal de entrada à esquerda (anel saliente) e fundo escuro do furo
    translate([-W / 2 + 0.3, 0, PORT_Z]) rotate([0, -90, 0]) difference() {
        union() { cylinder(r = 14, h = 3.5); translate([0, 0, 3.5]) cylinder(r1 = 14, r2 = 12, h = 2.5); }
        translate([0, 0, -1]) cylinder(r = 9, h = 10);
    }
    translate([-W / 2 + 6.3, 0, PORT_Z]) rotate([0, -90, 0]) cylinder(r = 9.3, h = 2);
}

module tampo() {
    translate([0, 0, H - 0.3]) rbox(W - 6, D - 6, TOP_T + 0.3, R - 3, 0.6);
}

module celula() {
    // tapete com borda em relevo e o pedestal do braço
    difference() {
        translate([-MAT / 2, -MAT / 2, 0]) cube([MAT, MAT, MAT_T + 0.8]);
        translate([-MAT / 2 + 2, -MAT / 2 + 2, MAT_T]) cube([MAT - 4, MAT - 4, 2]);
    }
    translate([ARM_AT[0], ARM_AT[1], MAT_T - 0.3]) cylinder(r = PED_R, h = PED_H + 0.3);
}

module luz() {
    translate([ARM_AT[0], ARM_AT[1], MAT_T - 0.3]) difference() {
        cylinder(r = PED_R + 2, h = 2.3);
        translate([0, 0, -1]) cylinder(r = PED_R - 0.3, h = 5);
    }
}

module giro() {
    // disco giratório e garfo do ombro (placas em ±Y; o eixo do ombro é Y)
    cylinder(r = 8, h = 5);
    for (y = [-1, 1]) translate([-5.5, y * 5 - 1.8, 4.5]) hull() {
        cube([11, 3.6, 1]);
        translate([5.5, 0, SHOULDER - 4.5]) rotate([-90, 0, 0]) cylinder(r = 5.5, h = 3.6);
    }
}

module superior() {
    // elo entre ombro e cotovelo; cabe no garfo (folga de 0,1 de cada lado)
    hull() for (z = [0, L1]) translate([0, 0, z]) rotate([90, 0, 0]) cylinder(r = z == 0 ? 5 : 4.2, h = 6.2, center = true);
}

module antebraco() {
    hull() for (z = [0, L2 - 12]) translate([0, 0, z]) rotate([90, 0, 0]) cylinder(r = z == 0 ? 4 : 3.2, h = 5.4, center = true);
    // punho e dois dedos da garra
    translate([-5.5, -5.5, L2 - 12]) cube([11, 11, 3.5]);
    for (x = [-1, 1]) translate([x * 3.8 - 1.2, -4.2, L2 - 8.8]) cube([2.4, 8.4, 8.8]);
}

module peca(n) {
    // montagem de conferência: 3 × 3 células, braços em pose de trabalho
    if (n == "corpo") corpo();
    else if (n == "detalhe") detalhe();
    else if (n == "tampo") tampo();
    else for (cx = [-CELL, 0, CELL], cy = [-CELL, 0, CELL]) translate([cx, cy, H + TOP_T]) {
        if (n == "celula") celula();
        else if (n == "luz") luz();
        else translate([ARM_AT[0], ARM_AT[1], MAT_T + PED_H]) rotate([0, 0, -45]) {
            if (n == "giro") giro();
            else translate([0, 0, SHOULDER]) rotate([0, 50, 0]) {
                if (n == "superior") superior();
                else translate([0, 0, L1]) rotate([0, 80, 0]) if (n == "antebraco") antebraco();
            }
        }
    }
}

exporta = false;
if (parte == "tudo") union() for (p = PARTES) peca(p);
else if (exporta && parte == "celula") celula();
else if (exporta && parte == "luz") luz();
else if (exporta && parte == "giro") giro();
else if (exporta && parte == "superior") superior();
else if (exporta && parte == "antebraco") antebraco();
else peca(parte);
