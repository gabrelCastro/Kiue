// Kiuê — produtor do tema entregas: caminhão de pedidos, v1.
// Caminhão estacionado com a traseira aberta e o baú cheio de caixas; rampa até o chão e esteira
// até a saída. O robô que leva a caixa (robo.scad) é posto e animado pelo jogo.
// Partes: chao, cabine (cor do serviço), bau (claro), faixa (cor do serviço), rodas (escuro),
// vidros (escuro), farois (acesos), metal (rampa e esteira), detalhe (lona, furo), papelao, saida.
include <comum_tema.scad>

parte = "tudo";
PARTES = ["chao", "cabine", "bau", "faixa", "rodas", "vidros", "farois", "metal", "detalhe", "papelao", "saida"];
$fn = 16;

TR = [-24, 8]; BAU = [50, 40, 40]; BAU_Z = 16;
CAB = [-59, 8];
BELT = [[34, -2], [72, 0]]; BELT_Z = P_CHAO[2] + 14;

module peca(n) {
    if (n == "chao") {
        p_chao();
    } else if (n == "saida") {
        p_saida();
    } else if (n == "cabine") {
        translate([CAB[0], CAB[1], 10]) rbox2(22, 38, 34, 5, 2);
    } else if (n == "bau") {
        // baú aberto atrás (+X)
        difference() {
            translate([TR[0], TR[1], BAU_Z]) rbox2(BAU[0], BAU[1], BAU[2], 3, 1);
            translate([TR[0] - BAU[0] / 2 + 3, TR[1] - BAU[1] / 2 + 2, BAU_Z + 2]) cube([BAU[0], BAU[1] - 4, BAU[2] - 4]);
        }
    } else if (n == "faixa") {
        translate([TR[0], TR[1] - BAU[1] / 2 - 0.4, BAU_Z + 22]) rbox2(BAU[0] - 6, 1.6, 7, 0.6, 0.3);
    } else if (n == "rodas") {
        for (x = [CAB[0], TR[0] - 12, TR[0] + 14], s = [-1, 1]) translate([x, TR[1] + s * 18, 9]) rotate([90, 0, 0]) cylinder(r = 8, h = 6, center = true);
        translate([(CAB[0] + TR[0] + BAU[0] / 2) / 2 - 6, TR[1], 9]) cube([BAU[0] + 34, 30, 6], center = true);
    } else if (n == "vidros") {
        translate([CAB[0] - 10.6, CAB[1], 34]) rotate([0, 90, 0]) linear_extrude(1.6) offset(r = 2) square([10, 28], center = true);
        translate([CAB[0] + 1, CAB[1] - 18.7, 34]) rotate([90, 0, 0]) linear_extrude(1.5) offset(r = 1.5) square([12, 8], center = true);
    } else if (n == "farois") {
        for (s = [-1, 1]) translate([CAB[0] - 10.7, CAB[1] + s * 13, 20]) rotate([0, -90, 0]) cylinder(r = 3.2, h = 1.4);
    } else if (n == "metal") {
        hull() { translate([TR[0] + BAU[0] / 2, TR[1], BAU_Z + 1]) cube([1, 30, 2], center = true); translate([TR[0] + BAU[0] / 2 + 24, TR[1] - 8, P_CHAO[2] + 0.5]) cube([1, 30, 1.6], center = true); }
        for (b = BELT) translate([b[0], b[1], P_CHAO[2] - 0.3]) rbox2(5, 26, BELT_Z - P_CHAO[2] - 0.7, 1, 0.5);
        hull() for (b = BELT) translate([b[0], b[1], BELT_Z - 3.5]) cube([0.1, 26, 3], center = true);
    } else if (n == "detalhe") {
        p_furo();
        hull() for (b = BELT) translate([b[0], b[1], BELT_Z - 1]) cube([0.1, 22, 2], center = true);
    } else if (n == "papelao") {
        for (i = [0 : 2], j = [-1, 1], k = [0 : 1]) caixa([TR[0] - 13 + i * 12, TR[1] + j * 9, BAU_Z + 2 + k * 14.7], [0.6, 0.42, 1]);
        caixa([52, -1, BELT_Z]);
    }
}
if (parte == "tudo") { union() for (p = PARTES) peca(p); } else peca(parte);
