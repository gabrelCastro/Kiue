// Kiuê — produtor do tema fábrica de brinquedos: fabriquinha, v1.
// Prédio claro de cantos redondos, telhado em dente de serra e chaminé (cor do serviço), duas
// janelas redondas acesas que fazem de olhos (pupilas escuras) e a porta de boca; as caixas saem
// por uma portinhola na direita numa esteira. A fumaça é uma parte à parte, com origem na boca da
// chaminé, para o jogo "soprar" a cada mensagem enviada.
// Partes: chao, paredes (claro), telhado (cor do serviço), janelas (acesas), rosto (escuro: pupilas,
// porta, fundo da portinhola, furo), metal (aros das janelas, esteira), papelao, saida, fumaca
// (exporta = true: origem na chaminé).
include <comum_tema.scad>

parte = "tudo";
exporta = false;
PARTES = ["chao", "paredes", "telhado", "janelas", "rosto", "metal", "papelao", "saida", "fumaca"];
$fn = 24;

F = [-18, 10]; FW = 84; FD = 62; FH = 40;
CHIM = [-44, 26]; CHIM_TOP = P_CHAO[2] + FH + 34;
BELT = [[F[0] + FW / 2 - 2, 0], [72, 0]]; BELT_Z = P_CHAO[2] + 14;

module fumaca() for (i = [0 : 2]) translate([i * 5, i * 3, 6 + i * 7]) sphere(r = 5 + i * 1.6, $fn = 14);

module peca(n) {
    if (n == "chao") p_chao();
    else if (n == "saida") p_saida();
    else if (n == "paredes") difference() {
        translate([F[0], F[1], P_CHAO[2] - 0.3]) rbox2(FW, FD, FH + 0.6, 7, 1.5);
        translate([F[0] + FW / 2 - 4, 0, P_CHAO[2] + 13]) cube([12, 24, 22], center = true);
    }
    else if (n == "telhado") {
        for (i = [0 : 2]) let(x0 = F[0] - FW / 2 + i * FW / 3)
            translate([x0, F[1] - FD / 2 - 2, P_CHAO[2] + FH - 0.3]) rotate([90, 0, 0]) translate([0, 0, -(FD + 4)])
                linear_extrude(FD + 4) polygon([[0, 0], [FW / 3, 0], [FW / 3, 3], [0, 20]]);
        translate([CHIM[0], CHIM[1], P_CHAO[2] + FH - 1]) cylinder(r = 7, h = 34);
        translate([CHIM[0], CHIM[1], CHIM_TOP - 3]) cylinder(r = 8.5, h = 4);
    }
    else if (n == "janelas") for (dx = [-17, 17]) translate([F[0] + dx, F[1] - FD / 2 + 0.6, P_CHAO[2] + 28]) rotate([90, 0, 0]) cylinder(r = 8, h = 1.4);
    else if (n == "rosto") {
        for (dx = [-17, 17]) translate([F[0] + dx + 1.5, F[1] - FD / 2 - 0.6, P_CHAO[2] + 27]) rotate([90, 0, 0]) cylinder(r = 3.6, h = 1);
        translate([F[0], F[1] - FD / 2 + 0.5, P_CHAO[2] + 9]) rotate([90, 0, 0]) linear_extrude(1.6) hull() { translate([-8, -9]) square([16, 9]); circle(r = 8); }
        translate([F[0] + FW / 2 - 9.5, 0, P_CHAO[2] + 13]) cube([1.5, 24, 22], center = true);
        p_furo();
        hull() for (b = BELT) translate([b[0], b[1], BELT_Z - 1]) cube([0.1, 22, 2], center = true);
    }
    else if (n == "metal") {
        for (dx = [-17, 17]) translate([F[0] + dx, F[1] - FD / 2 + 0.6, P_CHAO[2] + 28]) rotate([90, 0, 0]) difference() { cylinder(r = 10, h = 2.2); translate([0, 0, -1]) cylinder(r = 8, h = 4); }
        for (b = BELT) translate([b[0], b[1], P_CHAO[2] - 0.3]) rbox2(5, 26, BELT_Z - P_CHAO[2] - 0.7, 1, 0.5);
        hull() for (b = BELT) translate([b[0], b[1], BELT_Z - 3.5]) cube([0.1, 26, 3], center = true);
    }
    else if (n == "papelao") { caixa([F[0] + FW / 2 + 6, 0, BELT_Z]); caixa([-60, -36, P_CHAO[2] - 0.3]); }
    else if (n == "fumaca") translate([CHIM[0], CHIM[1], CHIM_TOP]) fumaca();
}
if (parte == "tudo") { union() for (p = PARTES) peca(p); }
else if (exporta && parte == "fumaca") fumaca();
else peca(parte);
