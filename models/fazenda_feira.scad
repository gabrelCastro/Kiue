// Kiuê — consumidor do tema fazenda: feira, v1.
// Cada worker é uma barraquinha na célula da grade do jogo (passo 45 mm, até 3 × 3): balcão de
// madeira na frente (a caixa pousa nele), toldo listrado atrás e acima do vendedor (o robô de
// chapéu, robo.scad, posto pelo jogo), dois postes e uma lanterna de estado. O toldo fica baixo e
// recuado para não esconder a fileira de trás na câmera do jogo.
// Escala: mm antes do NODE_SCALE 1,3; Z para cima; frente em −Y; entrada pela esquerda a 30 mm.
// Partes da peça: praca (cor do serviço), detalhe (furo da entrada, base do poste da entrada).
// Partes por célula (exporta = true, origem no centro da célula, no chão da praça): balcao,
// toldo_a (listras na cor do serviço), toldo_b (listras claras), poste (metal), luz (lanterna).

parte = "tudo";
exporta = false;
PARTES = ["praca", "detalhe"];
CELULA = ["balcao", "toldo_a", "toldo_b", "poste", "luz"];
$fn = 12;

W = 160; D = 150; PRACA_H = 6;
CELL = 45;
// a grade de 3 × 3 (para conferir o conjunto; o jogo põe só as células dos workers)
CELLS = [for (i = [-1 : 1], j = [-1 : 1]) [i * CELL, j * CELL]];
CTR = [36, 15, 14];              // balcão: largura, fundo, altura
CTR_Y = -12;
AWN = [40, 20]; AWN_Z = 46; AWN_Y = 12; AWN_TILT = 10;
PORT_Z = 30;

module rbox2(w, d, h, r, ch) {
    hull() for (sx = [-1, 1], sy = [-1, 1]) translate([sx * (w / 2 - r), sy * (d / 2 - r), 0]) {
        cylinder(r1 = r - ch, r2 = r, h = ch);
        translate([0, 0, ch]) cylinder(r = r, h = h - 2 * ch);
        translate([0, 0, h - ch]) cylinder(r1 = r, r2 = r - ch, h = ch);
    }
}

module praca() {
    rbox2(W - 24, D - 24, PRACA_H, 8, 1.5);
    // poste da entrada (onde o cano chega)
    translate([-(W - 24) / 2 + 4, 0, PRACA_H - 0.3]) rbox2(8, 26, PORT_Z + 12 - PRACA_H, 2, 1);
}
module detalhe() translate([-(W - 24) / 2 - 0.2, 0, PORT_Z]) rotate([0, 90, 0]) cylinder(r = 8, h = 2, center = true);

// célula (origem no centro, no chão da praça)
module balcao() translate([0, CTR_Y, -0.3]) rbox2(CTR[0], CTR[1], CTR[2] + 0.3, 1.5, 0.6);
module listras(par) translate([0, AWN_Y, AWN_Z]) rotate([AWN_TILT, 0, 0]) for (i = [0 : 4]) if ((i % 2 == 0) == par)
    translate([-AWN[0] / 2 + i * AWN[0] / 5, -AWN[1] / 2, 0]) cube([AWN[0] / 5 + (i < 4 ? 0.2 : 0), AWN[1], 1.6]);
module poste() for (s = [-1, 1]) translate([s * (AWN[0] / 2 - 2), AWN_Y + AWN[1] / 2 - 3, -0.3]) cylinder(r = 1.4, h = AWN_Z + 2.5);
module luz() translate([AWN[0] / 2 - 4, AWN_Y - AWN[1] / 2 + 3, AWN_Z - 6]) { sphere(r = 2.8, $fn = 12); translate([0, 0, 2]) cylinder(r = 0.5, h = 4.5, $fn = 6); }

module celula(n) {
    if (n == "balcao") balcao(); else if (n == "toldo_a") listras(true); else if (n == "toldo_b") listras(false);
    else if (n == "poste") poste(); else if (n == "luz") luz();
}
module peca(n) { if (n == "praca") praca(); else if (n == "detalhe") detalhe(); }

if (parte == "tudo") { union() { for (p = PARTES) peca(p); for (c = CELLS, n = CELULA) translate([c[0], c[1], PRACA_H]) celula(n); } }
else if (exporta && len([for (c = CELULA) if (c == parte) 1]) > 0) celula(parte);   // a praça sai normal
else peca(parte);
