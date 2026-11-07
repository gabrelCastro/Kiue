// Kiuê — função sob demanda do tema correio: guichês extras, v1 (do protótipo 19_lambda/opC_correio_v1).
// Quando a fila da agência aperta, abrem guichês extras: atendentes entram pela porta dos
// funcionários, batem o ponto (partida a frio), pegam a carta no malote (a fonte, onde o cano
// chega) e atendem na mesinha. Pátio comum: models/patio.scad.
// Partes da peça: base, piso, tapete (caminhos), corpo (relógios de ponto, carrinho do malote),
// celula (sacos), parede, detalhe (furo, visores, portas), metal (bocal, rampa, rodinhas).
// Por posto (exporta = true: origem no centro do posto, no chão): mesa, tampo, placa_f / placa_b
// (plaquinha do lado de fora, fileira da frente / do fundo), cones (posto travado), luz.
// Na cabeça do atendente: bone.
include <patio.scad>

parte = "tudo";
exporta = false;
PARTES = ["base", "piso", "tapete", "corpo", "celula", "parede", "detalhe", "metal"];
POSTO = ["mesa", "tampo", "placa_f", "placa_b", "cones", "luz"];
$fn = 16;
DESK_H = 11;

module caminhos(w = 16) {
    translate([20, AISLE, 8.5]) rbox2(200, w, 0.5, 3, 0.2);
    translate([LANE_R, (AISLE + WALK_Y) / 2, 8.5]) rbox2(w, AISLE - WALK_Y + w, 0.5, 3, 0.2);
    translate([48, WALK_Y, 8.5]) rbox2(144, w, 0.5, 3, 0.2);
}
module cones() for (s = [-1, 1]) translate([s * 4.5, 0, DESK_H + 1]) { cylinder(r1 = 3, r2 = 0.8, h = 8.5, $fn = 14); cylinder(r = 3.8, h = 1, $fn = 14); }

module peca(n) {
    if (n == "base") base_patio();
    if (n == "piso") translate([10, 4, 7.7]) rbox2(220, 154, 1, 6, 0.4);
    if (n == "tapete") caminhos();
    if (n == "corpo") {
        for (x = BAY_X) translate([x + 10, BAY_Y + 2, FLOOR]) rbox2(5, 4, 20, 1, 0.4);
        translate([-100, 18, FLOOR + 6]) rbox2(24, 30, 12, 2, 0.6);
    }
    if (n == "celula") for (y = [8, 18, 28]) translate([-102, y, FLOOR + 18]) scale([1, 0.9, 0.8]) sphere(r = 6.5);
    if (n == "parede") translate([46, -76, FLOOR]) rbox2(130, 4, 24, 1, 0.4);
    if (n == "detalhe") {
        furo_entrada();
        for (x = BAY_X) translate([x + 10, BAY_Y + 0.2, FLOOR + 14]) rbox2(3.4, 0.6, 3, 0.5, 0.1);
        for (x = BAY_X) translate([x, -73.5, FLOOR]) rbox2(12, 1, 22, 1, 0.2);
    }
    if (n == "metal") {
        bocal_entrada();
        hull() { translate([-108, 0, PORT_Z]) rotate([0, 90, 0]) cylinder(r = 5, h = 2); translate([-98, 14, FLOOR + 19]) cylinder(r = 4, h = 1); }
        for (s = [-1, 1], t = [-1, 1]) translate([-100 + s * 10, 18 + t * 13, FLOOR]) cylinder(r = 2.4, h = 6);
        translate([-114, 18, FLOOR + 10]) rotate([90, 0, 0]) cylinder(r = 0.9, h = 26, center = true);
    }
    if (n == "mesa") rbox2(15, 10, DESK_H, 1.5, 0.6);
    if (n == "tampo") translate([0, 0, DESK_H - 0.2]) rbox2(16, 11, 1.2, 1.5, 0.4);
    if (n == "placa_f") translate([0, -6, DESK_H]) rbox2(9, 1.2, 6, 0.5, 0.2);
    if (n == "placa_b") translate([0, 6, DESK_H]) rbox2(9, 1.2, 6, 0.5, 0.2);
    if (n == "cones") cones();
    if (n == "luz") luz_posto();
    // boné do carteiro (escala do robo.scad: cabeça até 38,6 mm; aba para a frente, −Y)
    if (n == "bone") translate([0, 0, 37.5]) { cylinder(r1 = 9.4, r2 = 8.4, h = 5.6); translate([0, -7.5, 0]) scale([1, 1.2, 1]) cylinder(r = 6, h = 1.3); }
}
module posto(i, p) translate([vaga(i)[0], vaga(i)[1], FLOOR - 0.1]) peca(p);
if (parte == "tudo") union() {
    for (p = PARTES) peca(p);
    for (i = [0 : N - 1]) { posto(i, "mesa"); posto(i, "tampo"); posto(i, i < 10 ? "placa_f" : "placa_b"); if (i >= 17) posto(i, "cones"); }
}
else if (exporta) peca(parte);
else if (search([parte], POSTO)[0] != []) for (i = [0 : N - 1]) posto(i, parte);
else peca(parte);
