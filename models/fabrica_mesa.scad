// Kiuê — consumidor do tema fábrica de brinquedos: mesinhas, v1.
// Cada worker é uma mesinha redonda (tampo claro com borda na cor do serviço, pé de metal) com um
// robô atrás (robo.scad, posto pelo jogo) abrindo a caixa que pousa no tampo; a luz de estado é um
// "brinquedo" aceso na beira da mesa.
// Partes da peça: praca, detalhe. Por célula (exporta = true): tampo (claro), borda (cor do
// serviço), pe (metal), luz.
include <comum_tema.scad>

parte = "tudo";
exporta = false;
PARTES = ["praca", "detalhe"];
CELULA = ["tampo", "borda", "pe", "luz"];
$fn = 24;

T = [0, -8]; TR = 16; TZ = 18;

module celula(n) {
    if (n == "tampo") translate([T[0], T[1], TZ - 2.5]) cylinder(r = TR, h = 2.5);
    else if (n == "borda") translate([T[0], T[1], TZ - 3]) difference() { cylinder(r = TR + 0.8, h = 2.2); translate([0, 0, -1]) cylinder(r = TR - 1.5, h = 4); }
    else if (n == "pe") translate([T[0], T[1], -0.3]) { cylinder(r1 = 7, r2 = 5, h = 2.3); cylinder(r = 2.2, h = TZ - 2.2); }
    else if (n == "luz") translate([T[0] + TR - 4, T[1] - 6, TZ - 0.3]) { cylinder(r = 1.2, h = 3); translate([0, 0, 4.5]) sphere(r = 2.8, $fn = 12); }
}
module peca(n) { if (n == "praca") c_praca(); else if (n == "detalhe") c_furo(); }

if (parte == "tudo") { union() { for (p = PARTES) peca(p); for (c = CELLS, n = CELULA) translate([c[0], c[1], C_PRACA[2]]) celula(n); } }
else if (exporta && len([for (c = CELULA) if (c == parte) 1]) > 0) celula(parte);
else peca(parte);
