// Kiuê — função sob demanda do tema fazenda: mutirão, v1 (do protótipo 19_lambda/opF_fazenda_v3).
// Quando a colheita aperta, vizinhos vêm de bicicleta ajudar: deixam a bicicleta no bicicletário,
// pegam um caixote na carroça (a fonte, onde o cano chega) e trabalham num fardo de feno.
// Pátio comum: models/patio.scad. Partes da peça: base (cor do serviço, clara), grama, terra
// (corredor, faixa da direita, estradinha, bicicletário), carroca (madeira), sino (telhadinho e
// placa), metal (bocal, sino, bicicletário), detalhe (furo da entrada).
// Por posto (exporta = true: origem no centro do posto, no chão): fardo, cerca (posto travado),
// aviso (listras da cerca), luz (fita em volta do fardo).
// Bicicleta (origem no chão entre as rodas, frente em −X): bike_metal, bike_rodas, bike_farol.
include <patio.scad>

parte = "tudo";
exporta = false;
PARTES = ["base", "grama", "terra", "carroca", "sino", "metal", "detalhe"];
$fn = 16;
RACK_Y = -50;

module fardo() rbox2(15, 11, 10, 2, 1);
module cerca() for (s = [-1, 1]) translate([s * 9 - 0.7, -8, 0]) cube([1.4, 16, 8]);
module aviso() intersection() {
    for (s = [-1, 1]) translate([s * 9 - 1, -8.1, 0]) cube([2, 16.2, 8.2]);
    for (k = [-4 : 4]) translate([0, k * 6, 4]) rotate([45, 0, 0]) cube([40, 2.6, 20], center = true);
}
module bike(n) {
    if (n == "bike_rodas") for (x = [-8, 8]) translate([x, 0, 5]) rotate([90, 0, 0]) rotate_extrude($fn = 16) translate([4.4, 0]) circle(r = 0.8, $fn = 8);
    if (n == "bike_metal") { hull() { translate([-8, 0, 5]) sphere(r = 0.8); translate([0, 0, 9]) sphere(r = 0.8); } hull() { translate([8, 0, 5]) sphere(r = 0.8); translate([0, 0, 9]) sphere(r = 0.8); } hull() { translate([-8, 0, 5]) sphere(r = 0.8); translate([-7, 0, 12]) sphere(r = 0.8); } translate([0, 0, 9]) cube([5, 3, 1.2], center = true); }
    if (n == "bike_farol") translate([-10.2, 0, 10]) rotate([0, 90, 0]) cylinder(r = 1.4, h = 1);
}

module peca(n) {
    if (n == "base") base_patio();
    if (n == "grama") translate([10, 4, 7.7]) rbox2(220, 154, 1, 6, 0.4);
    if (n == "terra") {
        translate([20, AISLE, 7.7]) rbox2(200, 14, 1.4, 4, 0.4);
        translate([LANE_R, (AISLE + ROAD) / 2, 7.7]) rbox2(14, AISLE - ROAD + 14, 1.4, 4, 0.4);
        translate([16, ROAD, 7.7]) rbox2(226, 16, 1.4, 4, 0.4);
        translate([38, RACK_Y, 7.7]) rbox2(160, 24, 1.4, 3, 0.4);
    }
    if (n == "carroca") {
        translate([-100, 18, 12]) rbox2(26, 40, 14, 2, 0.6);
        for (y = [-6, 42]) translate([-100, y, 7.7]) rotate([90, 0, 0]) cylinder(r = 5, h = 3, center = true);
        for (s = [-1, 1]) translate([-100, -20 + s * 9, 7.7]) cylinder(r = 1.8, h = 46);
        translate([-100, -20, 53]) cube([4, 22, 3], center = true);
    }
    if (n == "sino") { translate([-100, -20, 56]) rotate([90, 0, 0]) linear_extrude(26, center = true) polygon([[-9, 0], [9, 0], [0, 7]]); translate([-109, 0, 7.7]) rbox2(8, 22, 46, 2, 0.8); }
    if (n == "metal") {
        bocal_entrada(); translate([-100, -20, 44]) cylinder(r1 = 6, r2 = 3, h = 8);
        translate([-34, RACK_Y + 9, 8.6]) cube([148, 1.4, 1.4]);
        for (x = [-30 : 24 : 110]) translate([x, RACK_Y + 9.7, 8.6]) cylinder(r = 0.8, h = 1.6);
    }
    if (n == "detalhe") furo_entrada();
    if (n == "fardo") fardo();
    if (n == "cerca") cerca();
    if (n == "aviso") aviso();
    if (n == "luz") difference() { rbox2(15.6, 11.6, 3, 2, 0.4); translate([0, 0, -1]) cube([13, 9, 6], center = true); }
    bike(n);
}
if (parte == "tudo") {
    union() { for (p = PARTES) peca(p); for (i = [0 : N - 1]) translate([vaga(i)[0], vaga(i)[1], FLOOR - 0.1]) { peca("fardo"); peca("luz"); if (i >= 17) { peca("cerca"); peca("aviso"); } } }
} else if (exporta) peca(parte);
else if (parte == "fardo" || parte == "cerca" || parte == "aviso" || parte == "luz") for (i = [0 : N - 1]) translate([vaga(i)[0], vaga(i)[1], FLOOR - 0.1]) peca(parte);
else peca(parte);
