// Kiuê — produtor do tema robôs gigantes: robô-canhão, v1.
// Um robô redondo e baixinho (claro) de rosto de tela, que dispara as caixas pelo cano da direita
// (a saída); pezinhos e escotilha de cima. O ajudante que carrega a escotilha (robo.scad) é posto
// pelo jogo. O cano é uma parte à parte para o jogo fazer o recuo a cada mensagem.
// Partes: chao, corpo (claro), clara (pés e escotilha, tom claro do serviço), rosto (escuro),
// olhos (acesos), cano (cor do serviço), metal (palete), papelao, saida, detalhe (furo, fundo da
// escotilha).
include <comum_tema.scad>

parte = "tudo";
PARTES = ["chao", "corpo", "clara", "rosto", "olhos", "cano", "metal", "papelao", "saida", "detalhe"];
$fn = 32;

C = [10, 6, 34]; CR = 28;
PAL = [-50, -26];

module peca(n) {
    if (n == "chao") p_chao();
    else if (n == "saida") p_saida();
    else if (n == "corpo") translate(C) scale([1, 1, 0.92]) sphere(r = CR);
    else if (n == "clara") {
        for (a = [45, 135, 225, 315]) translate([C[0] + 20 * cos(a), C[1] + 20 * sin(a), P_CHAO[2] - 0.3]) cylinder(r1 = 8, r2 = 6, h = 10);
        translate([C[0] - 4, C[1] + 4, C[2] + CR * 0.92 - 5]) difference() { cylinder(r = 11, h = 6); translate([0, 0, -1]) cylinder(r = 8, h = 8); }
    }
    else if (n == "rosto") translate([C[0], C[1] - CR + 2.6, C[2] + 2]) rotate([90, 0, 0]) linear_extrude(3) offset(r = 5) square([22, 10], center = true);
    else if (n == "olhos") {
        for (dx = [-7, 7]) translate([C[0] + dx, C[1] - CR - 0.8, C[2] + 4]) rotate([90, 0, 0]) linear_extrude(1) scale([0.8, 1.15]) circle(r = 3.6);
        translate([C[0], C[1] - CR - 0.8, C[2] - 1]) rotate([90, 0, 0]) linear_extrude(1) intersection() { difference() { circle(r = 5); circle(r = 3.6); } translate([-6, -6]) square([12, 4.5]); }
    }
    else if (n == "cano") {
        translate([C[0], 0, PORT_Z]) rotate([0, 90, 0]) cylinder(r = 11, h = 72 - C[0]);
        for (x = [C[0] + 30, C[0] + 44]) translate([x, 0, PORT_Z]) rotate([0, 90, 0]) cylinder(r = 12.5, h = 3, center = true);
        translate([60, 0, PORT_Z]) rotate([0, 90, 0]) cylinder(r = 13, h = 6);
    }
    else if (n == "metal") translate([PAL[0], PAL[1], P_CHAO[2] - 0.3]) rbox2(34, 30, 5, 1, 0.4);
    else if (n == "papelao") for (i = [0 : 1], j = [0 : 1]) caixa([PAL[0] - 7 + i * 14, PAL[1] - 6 + j * 13, P_CHAO[2] + 4.4], [0.65, 0.6, 0.8]);
    else if (n == "detalhe") { p_furo(); translate([C[0] - 4, C[1] + 4, C[2] + CR * 0.92 - 6]) cylinder(r = 8.3, h = 6); }
}
if (parte == "tudo") { union() for (p = PARTES) peca(p); } else peca(parte);
