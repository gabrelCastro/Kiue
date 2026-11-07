// Kiuê — consumidor do tema entregas: vagas dos carrinhos, v1.
// Cada worker é um carrinho-robô (rover.scad, posto e animado pelo jogo) na sua vaga: faixas
// pintadas no chão e um poste de recarga com a luz de estado, atrás. A caixa pousa na caçamba do
// carrinho.
// Partes da peça: praca, detalhe. Por célula (exporta = true, origem no centro da célula, no chão
// da praça): faixa (pintura clara), poste (metal), luz.
include <comum_tema.scad>

parte = "tudo";
exporta = false;
PARTES = ["praca", "detalhe"];
CELULA = ["faixa", "poste", "luz"];
$fn = 12;

BAY = [38, 40];
POST = [-14, 17];

module celula(n) {
    if (n == "faixa") for (s = [-1, 1]) translate([s * BAY[0] / 2, 0, 0.25]) cube([1.6, BAY[1], 1.1], center = true);
    else if (n == "poste") translate([POST[0], POST[1], -0.3]) { cylinder(r = 2.4, h = 24.3); translate([0, 0, 18]) rbox2(7, 5, 9, 1, 0.4); }
    else if (n == "luz") translate([POST[0], POST[1] - 2.8, 24]) rotate([90, 0, 0]) cylinder(r = 2.4, h = 1);
}
module peca(n) { if (n == "praca") c_praca(); else if (n == "detalhe") c_furo(); }

if (parte == "tudo") { union() { for (p = PARTES) peca(p); for (c = CELLS, n = CELULA) translate([c[0], c[1], C_PRACA[2]]) celula(n); } }
else if (exporta && len([for (c = CELULA) if (c == parte) 1]) > 0) celula(parte);
else peca(parte);
