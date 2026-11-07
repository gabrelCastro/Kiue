// Kiuê — função sob demanda do tema entregas: entregadores de aplicativo, v1 (do protótipo
// 19_lambda/opE_entregas_v3). Quando os pedidos apertam, entregadores chegam de moto pela rua
// (partida a frio), estacionam na vaga, pegam o pedido no balcão (a fonte, onde o cano chega) e
// guardam no baú. Sem pedidos, vão embora de moto.
// Partes da peça: base, asfalto, branco (faixas da rua e setas), corpo (quiosque e toldo),
// detalhe (furo, moldura da janela), janela (acesa), metal (bocal).
// Por posto (exporta = true): vaga_f / vaga_b (pintura em U aberta para o corredor), cones, luz.
// Moto (origem no chão, frente em −Y): moto_branco, moto_bau (cor do serviço), moto_rodas,
// moto_metal, moto_farol. Na cabeça do entregador: capacete.
include <patio.scad>

parte = "tudo";
exporta = false;
PARTES = ["base", "asfalto", "branco", "corpo", "detalhe", "janela", "metal"];
POSTO = ["vaga_f", "vaga_b", "cones", "luz"];
$fn = 16;

module seta(s = 4) polygon([[-s, -s * 0.5], [0, -s * 0.5], [0, -s], [s, 0], [0, s], [0, s * 0.5], [-s, s * 0.5]]);
module u_vaga() difference() { square([17, 24], center = true); translate([0, -2]) square([14.4, 24], center = true); }

module peca(n) {
    if (n == "base") base_patio();
    if (n == "asfalto") translate([10, -14, 7.7]) rbox2(220, 146, 1.2, 6, 0.4);
    if (n == "branco") {
        for (x = [-80 : 24 : 110]) translate([x, ROAD, 8.9]) linear_extrude(0.6) square([12, 1.6], center = true);
        for (x = [-40, 30, 90]) translate([x, ROAD - 7, 8.9]) linear_extrude(0.6) seta();
        for (y = [-50, -10]) translate([LANE_R, y, 8.9]) rotate([0, 0, 90]) linear_extrude(0.6) seta();
        for (x = [100, 40, -20]) translate([x, AISLE, 8.9]) rotate([0, 0, 180]) linear_extrude(0.6) seta();
    }
    if (n == "corpo") { translate([-100, 16, 7.7]) rbox2(26, 48, 50, 4, 1.5); translate([-96, 16, 54]) rotate([0, -12, 0]) rbox2(34, 54, 3, 1, 0.4); }
    if (n == "detalhe") { furo_entrada(); translate([-86.7, 16, 26]) rotate([0, 90, 0]) linear_extrude(1.4) offset(r = 1.5) square([10, 18], center = true); }
    if (n == "janela") translate([-86.2, 16, 26]) rotate([0, 90, 0]) linear_extrude(1) square([8, 16], center = true);
    if (n == "metal") bocal_entrada();
    // a pintura fica 0,2 acima do asfalto (o posto já começa em FLOOR − 0,1)
    if (n == "vaga_f") translate([0, 0, 0.3]) rotate([0, 0, 180]) linear_extrude(0.6) u_vaga();
    if (n == "vaga_b") translate([0, 0, 0.3]) linear_extrude(0.6) u_vaga();
    if (n == "cones") for (s = [-1, 1]) translate([s * 4.5, 0, 0]) { cylinder(r1 = 3, r2 = 0.8, h = 8.5, $fn = 14); cylinder(r = 3.8, h = 1, $fn = 14); }
    if (n == "luz") translate([0, 0, 0.2]) difference() { rbox2(19, 26, 1.2, 1.5, 0.3); translate([0, 0, -1]) cube([16.4, 23.4, 4], center = true); }
    // moto: corpo branco, baú atrás na cor do serviço, rodas, guidão e farol
    if (n == "moto_branco") { hull() { translate([0, 6, 7]) scale([1, 1.6, 0.7]) sphere(r = 4); translate([0, -6, 6]) sphere(r = 3); } translate([0, -9, 6]) cylinder(r = 2.4, h = 9); }
    if (n == "moto_rodas") for (y = [-10, 9]) translate([0, y, 4]) rotate([0, 90, 0]) cylinder(r = 4, h = 2.4, center = true);
    if (n == "moto_metal") translate([0, -9.5, 15]) rotate([0, 90, 0]) cylinder(r = 0.8, h = 12, center = true);
    if (n == "moto_bau") translate([0, 11, 10]) rbox2(10, 9, 9, 1.5, 0.6);
    if (n == "moto_farol") translate([0, -12.2, 11]) rotate([90, 0, 0]) cylinder(r = 1.6, h = 1);
    // capacete do entregador (escala do robo.scad)
    if (n == "capacete") translate([0, 0, 35]) { scale([1, 1.05, 0.85]) sphere(r = 10); }
}
module posto(i, p) translate([vaga(i)[0], vaga(i)[1], FLOOR - 0.1]) peca(p);
if (parte == "tudo") union() {
    for (p = PARTES) peca(p);
    for (i = [0 : N - 1]) { posto(i, i < 10 ? "vaga_f" : "vaga_b"); if (i >= 17) posto(i, "cones"); }
}
else if (exporta) peca(parte);
else if (search([parte], POSTO)[0] != []) for (i = [0 : N - 1]) posto(i, parte);
else peca(parte);
