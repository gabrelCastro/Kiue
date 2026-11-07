// Kiuê — função sob demanda do tema fábrica de brinquedos: robôs montados na hora, v1 (do
// protótipo 19_lambda/opT_fabrica_v1). Quando chegam muitas caixas de peças, as cabines de
// montagem montam um robô na hora (partida a frio); ele pega a caixa na caçamba (a fonte, onde o
// cano chega), leva à bancada e monta o brinquedo. Sem trabalho, volta à cabine e é desmontado.
// Partes da peça: base, piso, tapete, metal (bocal, rampa, colunas das cabines), corpo (caçamba,
// tetos), celula (piso das cabines), vidro (paredes das cabines), detalhe (furo, botões), pecas_a,
// pecas_b, pecas_c (bolinhas coloridas na caçamba).
// Por posto (exporta = true): bancada (tampo), pernas, cones, luz. Na cabeça: helice.
include <patio.scad>

parte = "tudo";
exporta = false;
PARTES = ["base", "piso", "tapete", "metal", "corpo", "celula", "vidro", "detalhe", "pecas_a", "pecas_b", "pecas_c"];
POSTO = ["bancada", "pernas", "cones", "luz"];
$fn = 16;
BENCH_H = 11;

module caminhos(w = 16) {
    translate([20, AISLE, 8.5]) rbox2(200, w, 0.5, 3, 0.2);
    translate([LANE_R, (AISLE + WALK_Y) / 2, 8.5]) rbox2(w, AISLE - WALK_Y + w, 0.5, 3, 0.2);
    translate([48, WALK_Y, 8.5]) rbox2(144, w, 0.5, 3, 0.2);
}
module peca(n) {
    if (n == "base") base_patio();
    if (n == "piso") translate([10, 4, 7.7]) rbox2(220, 154, 1, 6, 0.4);
    if (n == "tapete") caminhos();
    if (n == "metal") {
        bocal_entrada();
        hull() { translate([-108, 0, PORT_Z]) rotate([0, 90, 0]) cylinder(r = 5, h = 2); translate([-100, 12, FLOOR + 22]) cylinder(r = 4, h = 1); }
        for (x = BAY_X, s = [-1, 1], t = [-1, 1]) translate([x + s * 9, BAY_Y + t * 9, FLOOR]) cylinder(r = 1.2, h = 30);
    }
    if (n == "corpo") {
        translate([-100, 18, FLOOR]) difference() { rbox2(26, 34, 18, 3, 0.8); translate([0, 0, 3]) rbox2(22, 30, 20, 2, 0.4); }
        for (x = BAY_X) translate([x, BAY_Y, FLOOR + 30]) rbox2(21, 21, 3, 2, 0.6);
    }
    if (n == "celula") for (x = BAY_X) translate([x, BAY_Y, FLOOR]) rbox2(19, 19, 1, 2, 0.3);
    if (n == "vidro") for (x = BAY_X) translate([x, BAY_Y, FLOOR]) difference() { rbox2(18.6, 18.6, 30, 1, 0.2); translate([0, 0, -1]) cube([17, 17, 40], center = true); translate([0, 9, 15]) cube([15, 6, 32], center = true); }
    if (n == "detalhe") { furo_entrada(); for (x = BAY_X) translate([x, BAY_Y, FLOOR + 33]) cylinder(r = 2.2, h = 2.4); }
    for (k = [1 : 3]) if (n == ["", "pecas_a", "pecas_b", "pecas_c"][k]) for (j = [0 : 4]) translate([-106 + ((j + k) % 3) * 6, 6 + j * 6 + k, FLOOR + 14]) sphere(r = 3.4);
    if (n == "bancada") translate([0, 0, BENCH_H - 2]) rbox2(16, 11, 2, 1, 0.4);
    if (n == "pernas") for (s = [-1, 1], t = [-1, 1]) translate([s * 6, t * 3.5, 0]) cylinder(r = 0.9, h = BENCH_H - 1.5);
    if (n == "cones") for (s = [-1, 1]) translate([s * 4.5, 0, BENCH_H]) { cylinder(r1 = 3, r2 = 0.8, h = 8.5, $fn = 14); cylinder(r = 3.8, h = 1, $fn = 14); }
    if (n == "luz") luz_posto();
    // hélice de brinquedo (escala do robo.scad)
    if (n == "helice") translate([0, 0, 38]) { cylinder(r = 1.6, h = 9); translate([0, 0, 9]) for (a = [0, 90]) rotate([0, 0, a]) scale([1, 0.3, 0.2]) sphere(r = 10); }
}
module posto(i, p) translate([vaga(i)[0], vaga(i)[1], FLOOR - 0.1]) peca(p);
if (parte == "tudo") union() {
    for (p = PARTES) peca(p);
    for (i = [0 : N - 1]) { posto(i, "bancada"); posto(i, "pernas"); if (i >= 17) posto(i, "cones"); }
}
else if (exporta) peca(parte);
else if (search([parte], POSTO)[0] != []) for (i = [0 : N - 1]) posto(i, parte);
else peca(parte);
