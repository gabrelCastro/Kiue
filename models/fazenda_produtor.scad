// Kiuê — produtor do tema fazenda: horta com celeiro, v1.
// Celeiro de telhado quebrado (cor do serviço) com portão em X e um silo; horta com três leiras de
// verduras na frente; esteira até a saída. O robô fazendeiro (robo.scad, com chapéu) é posto pelo
// jogo em FARMER e mexe os braços a cada mensagem enviada.
// Escala: mm antes do NODE_SCALE 1,3; Z para cima; frente em −Y; origem no centro, no topo do
// pedestal (160 × 150). Saída pela direita: o cano começa em x = 80, z = 30.
// Partes: chao (cor do serviço clara), celeiro (paredes claras), telhado (cor do serviço), portao
// (madeira clara: X e moldura), detalhe (escuro: fundo do portão, lona, furo), silo (metal),
// terra, verde, esteira (metal), caixas (papelão, decoração).

parte = "tudo";
PARTES = ["chao", "celeiro", "telhado", "portao", "detalhe", "silo", "terra", "verde", "esteira", "caixas"];
$fn = 16;

W = 140; D = 112; BASE_H = 5;
BARN = [-28, 24]; BW = 56; BD = 40; BH = 28;
SILO = [-60, 32];
FIELD_X = [-64, 4]; FIELD_Y0 = -46;
BELT = [[34, 0], [76, 0]]; BELT_Z = BASE_H + 13;
OUT_Z = 30;

module rbox2(w, d, h, r, ch) {
    hull() for (sx = [-1, 1], sy = [-1, 1]) translate([sx * (w / 2 - r), sy * (d / 2 - r), 0]) {
        cylinder(r1 = r - ch, r2 = r, h = ch);
        translate([0, 0, ch]) cylinder(r = r, h = h - 2 * ch);
        translate([0, 0, h - ch]) cylinder(r1 = r, r2 = r - ch, h = ch);
    }
}
module perfil() polygon([[-BD / 2 - 3, 0], [-BD / 2 + 4, 12], [0, 21], [BD / 2 - 4, 12], [BD / 2 + 3, 0], [BD / 2 - 1, 0], [BD / 2 - 6, 9.5], [0, 17], [-BD / 2 + 6, 9.5], [-BD / 2 + 1, 0]]);
module empena() polygon([[-BD / 2 + 1.5, 0], [-BD / 2 + 6, 9.5], [0, 17], [BD / 2 - 6, 9.5], [BD / 2 - 1.5, 0]]);

module chao() rbox2(W, D, BASE_H, 8, 1.5);
module celeiro() {
    translate([BARN[0], BARN[1], BASE_H - 0.3]) rbox2(BW, BD, BH + 0.6, 2, 0.6);
    for (s = [-1, 1]) translate([BARN[0] + s * (BW / 2 - 1.5), BARN[1], BASE_H + BH - 0.6]) rotate([90, 0, 90]) linear_extrude(3, center = true) empena();
    // pé da esteira e caixa da saída (onde o cano encaixa)
    translate([BELT[1][0] - 2, 0, BASE_H - 0.3]) rbox2(8, 28, OUT_Z + 12 - BASE_H, 2, 1);
}
module telhado() translate([BARN[0] - BW / 2 - 2, BARN[1], BASE_H + BH - 0.5]) rotate([90, 0, 90]) linear_extrude(BW + 4) perfil();
module portao() translate([BARN[0], BARN[1] - BD / 2 - 0.8, BASE_H + 11]) rotate([90, 0, 0]) linear_extrude(1.4) {
    difference() { square([24, 22], center = true); square([20, 18], center = true); }
    for (a = [-1, 1]) intersection() { rotate(a * 42) square([30, 2.4], center = true); square([22, 20], center = true); }
}
module detalhe() {
    translate([BARN[0], BARN[1] - BD / 2 - 0.2, BASE_H + 11]) rotate([90, 0, 0]) linear_extrude(1) square([23, 21], center = true);
    hull() for (b = BELT) translate([b[0], b[1], BELT_Z - 1]) cube([0.1, 22, 2], center = true);
    translate([BELT[1][0] + 2.2, 0, OUT_Z]) rotate([0, 90, 0]) cylinder(r = 9, h = 2, center = true);
}
module silo() {
    translate([SILO[0], SILO[1], BASE_H - 0.3]) cylinder(r = 10, h = 46.3);
    for (z = [14, 28, 42]) translate([SILO[0], SILO[1], BASE_H + z]) cylinder(r = 10.6, h = 1.6);
    translate([SILO[0], SILO[1], BASE_H + 45.5]) scale([1, 1, 0.7]) sphere(r = 10);
}
module terra() for (i = [0 : 2]) translate([0, FIELD_Y0 + 6 + i * 12, BASE_H - 0.3]) hull() for (x = [FIELD_X[0] + 4, FIELD_X[1] - 4]) translate([x, 0, 0]) scale([1, 1, 0.5]) cylinder(r = 5, h = 6);
module verde() for (i = [0 : 2], j = [0 : 5]) translate([FIELD_X[0] + 8 + j * 11 + (i % 2) * 4, FIELD_Y0 + 6 + i * 12, BASE_H + 3.6]) scale([1, 1, 0.8]) sphere(r = 4.4, $fn = 10);
module esteira() {
    for (b = BELT) translate([b[0], b[1], BASE_H - 0.3]) rbox2(5, 26, BELT_Z - BASE_H - 0.7, 1, 0.5);
    hull() for (b = BELT) translate([b[0], b[1], BELT_Z - 3.5]) cube([0.1, 26, 3], center = true);
}
// caixas de decoração: uma esperando no canteiro e uma na esteira
module caixas() for (c = [[BARN[0] + 22, BARN[1] - BD / 2 - 12, BASE_H - 0.3], [52, 0, BELT_Z]]) translate(c) hull() for (sx = [-1, 1], sy = [-1, 1]) translate([sx * 8.8, sy * 8.8, 0]) cylinder(r = 1.2, h = 15, $fn = 8);

module peca(n) {
    if (n == "chao") chao(); else if (n == "celeiro") celeiro(); else if (n == "telhado") telhado();
    else if (n == "portao") portao(); else if (n == "detalhe") detalhe(); else if (n == "silo") silo();
    else if (n == "terra") terra(); else if (n == "verde") verde(); else if (n == "esteira") esteira();
    else if (n == "caixas") caixas();
}
if (parte == "tudo") { union() for (p = PARTES) peca(p); } else peca(parte);
