// Kiuê — consumidor do tema robôs gigantes: robô-polvo, v1.
// Um robô só, suspenso num poste no fundo, com um braço por worker (os braços são do jogo e vão do
// corpo até o tapete de cada worker). Cada worker tem um tapete escuro com o anel de luz de estado.
// Partes da peça: praca, detalhe (furo), poste (metal), cabeca (claro, origem no centro), rosto
// (escuro), olhos (acesos). Por célula (exporta = true): tapete (escuro), luz (anel).
include <comum_tema.scad>

parte = "tudo";
exporta = false;
PARTES = ["praca", "detalhe", "poste", "cabeca", "rosto", "olhos"];
CELULA = ["tapete", "luz"];
$fn = 28;

HEAD = [0, 52, 78]; HR = 21;      // corpo suspenso atrás da grade, alto

module peca(n) {
    if (n == "praca") c_praca();
    else if (n == "detalhe") c_furo();
    else if (n == "poste") {
        translate([HEAD[0], HEAD[1] + 8, C_PRACA[2] - 0.3]) { cylinder(r1 = 9, r2 = 7, h = 4); cylinder(r = 3.2, h = HEAD[2] - C_PRACA[2]); }
    }
    else if (n == "cabeca") translate(HEAD) { scale([1, 1, 0.9]) sphere(r = HR); translate([0, 0, -HR * 0.9 + 1]) cylinder(r1 = 12, r2 = 15, h = 6); }
    else if (n == "rosto") translate([HEAD[0], HEAD[1] - HR + 2.4, HEAD[2] + 2]) rotate([90, 0, 0]) linear_extrude(3) offset(r = 4) square([16, 7], center = true);
    else if (n == "olhos") {
        for (dx = [-5, 5]) translate([HEAD[0] + dx, HEAD[1] - HR - 0.7, HEAD[2] + 3.5]) rotate([90, 0, 0]) linear_extrude(1) scale([0.8, 1.15]) circle(r = 2.6);
        translate([HEAD[0], HEAD[1] - HR - 0.7, HEAD[2] - 0.5]) rotate([90, 0, 0]) linear_extrude(1) intersection() { difference() { circle(r = 3.6); circle(r = 2.6); } translate([-5, -5]) square([10, 3.4]); }
    }
}
module celula(n) {
    if (n == "tapete") translate([0, 0, -0.3]) cylinder(r = 14, h = 1.8);
    else if (n == "luz") translate([0, 0, -0.3]) difference() { cylinder(r = 16.5, h = 2.3); translate([0, 0, -1]) cylinder(r = 14.3, h = 4); }
}

if (parte == "tudo") { union() { for (p = PARTES) peca(p); for (c = CELLS, n = CELULA) translate([c[0], c[1], C_PRACA[2]]) celula(n); } }
else if (exporta && len([for (c = CELULA) if (c == parte) 1]) > 0) celula(parte);
else peca(parte);
