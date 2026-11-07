// Kiuê — função sob demanda do tema indústria: robôs do elevador, v1 (do protótipo
// 19_lambda/opI_industria_v1). Quando a esteira acumula caixas, robôs sobem pelos elevadores do
// piso (partida a frio), pegam a caixa no fim da esteira (a fonte, onde o cano chega) e a fecham
// na prensinha (o pistão desce e sobe). Sem trabalho, descem pelo elevador.
// Partes da peça: base, piso, faixas (amarelas), pocos (escuro: poços dos elevadores, lona da
// esteira), metal (bocal, rampa, pés e roletes da esteira).
// Por posto (exporta = true): prensa (mesa), colunas_f / colunas_b, travessa_f / travessa_b
// (fileira da frente / do fundo: a prensa fica do lado de fora), cones, luz.
// À parte: pistao (origem na base da cabeça, o jogo sobe e desce), capacete.
include <patio.scad>

parte = "tudo";
exporta = false;
PARTES = ["base", "piso", "faixas", "pocos", "metal"];
POSTO = ["prensa", "colunas_f", "colunas_b", "travessa_f", "travessa_b", "cones", "luz"];
$fn = 16;
PRESS_H = 8;

module peca(n) {
    if (n == "base") base_patio();
    if (n == "piso") translate([10, 4, 7.7]) rbox2(220, 154, 1, 6, 0.4);
    if (n == "faixas") {
        for (y = [AISLE - 8, AISLE + 8]) translate([20, y, 8.5]) rbox2(200, 1.6, 0.5, 0.6, 0.1);
        for (x = [LANE_R - 8, LANE_R + 8]) translate([x, (AISLE + WALK_Y) / 2, 8.5]) rbox2(1.6, AISLE - WALK_Y, 0.5, 0.6, 0.1);
        for (y = [WALK_Y - 8, WALK_Y + 8]) translate([48, y, 8.5]) rbox2(144, 1.6, 0.5, 0.6, 0.1);
        for (x = BAY_X) translate([x, BAY_Y, 8.4]) difference() { rbox2(20, 20, 0.6, 2, 0.1); translate([0, 0, -1]) cube([16, 16, 4], center = true); }
    }
    if (n == "pocos") {
        for (x = BAY_X) translate([x, BAY_Y, 8.4]) rbox2(16, 16, 0.7, 1, 0.1);
        translate([-96, 18, FLOOR + 10]) rbox2(30, 14, 1.4, 1, 0.3);
    }
    if (n == "metal") {
        bocal_entrada();
        hull() { translate([-108, 0, PORT_Z]) rotate([0, 90, 0]) cylinder(r = 5, h = 2); translate([-108, 18, FLOOR + 14]) cylinder(r = 4, h = 1); }
        translate([-96, 18, FLOOR]) for (s = [-1, 1], t = [-1, 1]) translate([s * 12, t * 5, 0]) cylinder(r = 1.4, h = 10);
        for (x = [-108 : 6 : -84]) translate([x, 18, FLOOR + 10]) rotate([90, 0, 0]) cylinder(r = 1.6, h = 15, center = true);
    }
    if (n == "prensa") rbox2(15, 10, PRESS_H, 1, 0.4);
    for (r = [["_f", -3], ["_b", 3]]) {
        if (n == str("colunas", r[0])) for (s = [-1, 1]) translate([s * 6.5, r[1], PRESS_H]) cylinder(r = 1, h = 22);
        if (n == str("travessa", r[0])) translate([0, r[1], PRESS_H + 20]) rbox2(16, 4, 4, 1, 0.4);
    }
    if (n == "cones") for (s = [-1, 1]) translate([s * 4.5, 0, PRESS_H]) { cylinder(r1 = 3, r2 = 0.8, h = 8.5, $fn = 14); cylinder(r = 3.8, h = 1, $fn = 14); }
    if (n == "luz") luz_posto();
    if (n == "pistao") { rbox2(9, 7, 3, 1, 0.3); cylinder(r = 1.2, h = 14); }
    // capacete de obra (escala do robo.scad)
    if (n == "capacete") translate([0, 0, 36.5]) { scale([1, 1, 0.75]) sphere(r = 9.4); cylinder(r = 11.5, h = 1.2); }
}
module posto(i, p) translate([vaga(i)[0], vaga(i)[1], FLOOR - 0.1]) peca(p);
if (parte == "tudo") union() {
    for (p = PARTES) peca(p);
    for (i = [0 : N - 1]) { posto(i, "prensa"); posto(i, i < 10 ? "colunas_f" : "colunas_b"); posto(i, i < 10 ? "travessa_f" : "travessa_b"); if (i >= 17) posto(i, "cones"); }
}
else if (exporta) peca(parte);
else if (search([parte], POSTO)[0] != []) for (i = [0 : N - 1]) posto(i, parte);
else peca(parte);
