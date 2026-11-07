// Kiuê — consumidor do tema correio: guichês, v1.
// Cada worker é um guichê na célula da grade: balcão na cor do serviço com tampo claro (a caixa
// pousa nele) e, atrás do atendente (robo.scad, posto pelo jogo), uma plaquinha numa haste com a
// luz de estado. Tudo baixo para não esconder a fileira de trás.
// Partes da peça: praca, detalhe. Por célula (exporta = true, origem no centro da célula, no chão
// da praça): balcao (cor do serviço), tampo (claro), haste (metal), placa (escuro), luz.
include <comum_tema.scad>

parte = "tudo";
exporta = false;
PARTES = ["praca", "detalhe"];
CELULA = ["balcao", "tampo", "haste", "placa", "luz"];
$fn = 12;

CTR = [36, 14, 16]; CTR_Y = -12;
SIGN = [12, 18, 34];               // x, y (atrás e à direita do atendente), altura da placa

module celula(n) {
    if (n == "balcao") translate([0, CTR_Y, -0.3]) rbox2(CTR[0], CTR[1], CTR[2] + 0.3, 1.5, 0.6);
    else if (n == "tampo") translate([0, CTR_Y - 1, CTR[2] - 0.3]) difference() {
        rbox2(CTR[0] + 2, CTR[1] + 3, 2.6, 1, 0.4);
        translate([-9, -6, 1.6]) cube([18, 12, 2]);   // bandeja rebaixada
    }
    else if (n == "haste") translate([SIGN[0], SIGN[1], -0.3]) cylinder(r = 1.3, h = SIGN[2] + 0.3);
    else if (n == "placa") translate([SIGN[0], SIGN[1] - 1.5, SIGN[2] - 1]) rbox2(14, 3, 10, 1, 0.4);
    else if (n == "luz") translate([SIGN[0], SIGN[1] - 3.2, SIGN[2] + 4]) rotate([90, 0, 0]) cylinder(r = 3, h = 1.4);
}
module peca(n) { if (n == "praca") c_praca(); else if (n == "detalhe") c_furo(); }

if (parte == "tudo") { union() { for (p = PARTES) peca(p); for (c = CELLS, n = CELULA) translate([c[0], c[1], C_PRACA[2]]) celula(n); } }
else if (exporta && len([for (c = CELULA) if (c == parte) 1]) > 0) celula(parte);
else peca(parte);
