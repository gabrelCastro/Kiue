// Peças comuns aos modelos dos temas (fazenda, correio, entregas, fabrica, gigantes).
// Escala: mm antes do NODE_SCALE 1,3; Z para cima; frente em −Y (no jogo, +z).
// Produtor: pedestal 160 × 150, saída pela direita (o cano começa em x = 80, z = 30).
// Consumidor: pedestal 170 × 160, entrada pela esquerda a 30 mm; workers na grade de células
// de 45 mm (até 3 × 3) do jogo (layout.workerCell).

PORT_Z = 30;

module rbox2(w, d, h, r, ch) {
    hull() for (sx = [-1, 1], sy = [-1, 1]) translate([sx * (w / 2 - r), sy * (d / 2 - r), 0]) {
        cylinder(r1 = r - ch, r2 = r, h = ch);
        translate([0, 0, ch]) cylinder(r = r, h = h - 2 * ch);
        translate([0, 0, h - ch]) cylinder(r1 = r, r2 = r - ch, h = ch);
    }
}

// produtor: chão e o poste da saída (onde o cano encaixa); o furo escuro é a parte "detalhe"
P_CHAO = [140, 112, 5];
module p_chao() rbox2(P_CHAO[0], P_CHAO[1], P_CHAO[2], 8, 1.5);
module p_saida() translate([74, 0, P_CHAO[2] - 0.3]) rbox2(8, 28, PORT_Z + 12 - P_CHAO[2], 2, 1);
module p_furo() translate([78.2, 0, PORT_Z]) rotate([0, 90, 0]) cylinder(r = 9, h = 2, center = true);

// consumidor: praça e o poste da entrada (o furo é "detalhe")
C_PRACA = [136, 126, 6];
module c_praca() {
    rbox2(C_PRACA[0], C_PRACA[1], C_PRACA[2], 8, 1.5);
    translate([-C_PRACA[0] / 2 + 4, 0, C_PRACA[2] - 0.3]) rbox2(8, 26, PORT_Z + 12 - C_PRACA[2], 2, 1);
}
module c_furo() translate([-C_PRACA[0] / 2 - 0.2, 0, PORT_Z]) rotate([0, 90, 0]) cylinder(r = 8, h = 2, center = true);

// caixa de papelão (decoração), base no ponto dado
module caixa(p, s = 1) translate(p) scale(s) hull() for (sx = [-1, 1], sy = [-1, 1]) translate([sx * 8.8, sy * 8.8, 0]) cylinder(r = 1.2, h = 15, $fn = 8);

// grade 3 × 3 para conferir o conjunto (o jogo põe só as células dos workers)
CELLS = [for (i = [-1 : 1], j = [-1 : 1]) [i * 45, j * 45]];
