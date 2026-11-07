// Kiuê — função sob demanda do tema robôs gigantes: mecânicos do pórtico, v1 (do protótipo
// 19_lambda/opG_gigantes_v1). No hangar, a ponte rolante desce mecânicos pendurados no gancho
// (partida a frio); cada um pega uma chapa na prateleira (a fonte, onde o cano chega), leva ao
// berço e solda. Sem trabalho, o gancho os leva de volta.
// Partes da peça: base, piso, faixas (amarelas: caminhos, alvos dos ganchos, viga), metal (bocal,
// rampa, pilares, prateleira), chapas, carrinhos (dos ganchos), detalhe (furo).
// Por posto (exporta = true): berco, garras, cones, luz. Na cabeça: mascara (de solda, levantada).
include <patio.scad>

parte = "tudo";
exporta = false;
PARTES = ["base", "piso", "faixas", "metal", "chapas", "carrinhos", "detalhe"];
POSTO = ["berco", "garras", "cones", "luz"];
$fn = 16;
CRANE_Z = 46;

module peca(n) {
    if (n == "base") base_patio();
    if (n == "piso") translate([10, 4, 7.7]) rbox2(220, 154, 1, 6, 0.4);
    if (n == "faixas") {
        for (y = [AISLE - 8, AISLE + 8]) translate([20, y, 8.5]) rbox2(200, 1.6, 0.5, 0.6, 0.1);
        for (x = [LANE_R - 8, LANE_R + 8]) translate([x, (AISLE + WALK_Y) / 2, 8.5]) rbox2(1.6, AISLE - WALK_Y, 0.5, 0.6, 0.1);
        for (y = [WALK_Y - 8, WALK_Y + 8]) translate([48, y, 8.5]) rbox2(144, 1.6, 0.5, 0.6, 0.1);
        for (x = BAY_X) translate([x, BAY_Y, 8.5]) difference() { cylinder(r = 9, h = 0.5); translate([0, 0, -1]) cylinder(r = 7, h = 3); }
        translate([45, BAY_Y, CRANE_Z]) rbox2(130, 5, 5, 1, 0.4);
    }
    if (n == "metal") {
        bocal_entrada();
        hull() { translate([-108, 0, PORT_Z]) rotate([0, 90, 0]) cylinder(r = 5, h = 2); translate([-100, 12, FLOOR + 30]) cylinder(r = 4, h = 1); }
        for (x = [-22, 112]) translate([x, BAY_Y, FLOOR]) rbox2(5, 5, CRANE_Z - FLOOR + 5, 1, 0.4);
        translate([-100, 18, FLOOR]) rbox2(22, 34, 3, 1, 0.4);
        for (y = [4, 32], s = [-1, 1]) translate([-100 + s * 9, y, FLOOR]) cylinder(r = 1.2, h = 30);
    }
    if (n == "chapas") for (k = [0 : 5]) translate([-100, 6 + k * 4.8, FLOOR + 3]) rbox2(18, 1.6, 24, 0.5, 0.2);
    if (n == "carrinhos") for (x = BAY_X) translate([x, BAY_Y, CRANE_Z - 6]) rbox2(9, 8, 6, 1, 0.4);
    if (n == "detalhe") furo_entrada();
    if (n == "berco") rbox2(15, 10, 6, 1, 0.4);
    if (n == "garras") for (s = [-1, 1]) translate([s * 6, 0, 6]) rbox2(2, 8, 2, 0.5, 0.2);
    if (n == "cones") for (s = [-1, 1]) translate([s * 4.5, 0, 6]) { cylinder(r1 = 3, r2 = 0.8, h = 8.5, $fn = 14); cylinder(r = 3.8, h = 1, $fn = 14); }
    if (n == "luz") luz_posto();
    // máscara de solda levantada no alto da cabeça (escala do robo.scad)
    if (n == "mascara") translate([0, -1.5, 37.5]) rotate([-25, 0, 0]) rbox2(15, 13, 5, 2.4, 0.6);
}
module posto(i, p) translate([vaga(i)[0], vaga(i)[1], FLOOR - 0.1]) peca(p);
if (parte == "tudo") union() {
    for (p = PARTES) peca(p);
    for (i = [0 : N - 1]) { posto(i, "berco"); posto(i, "garras"); if (i >= 17) posto(i, "cones"); }
}
else if (exporta) peca(parte);
else if (search([parte], POSTO)[0] != []) for (i = [0 : N - 1]) posto(i, parte);
else peca(parte);
