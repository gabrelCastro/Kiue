// Kiuê — produtor do tema correio: bancada de empacotamento, v1.
// Mesa clara com faixa na cor do serviço; papelão desmontado, caixa aberta e rolo de fita em cima;
// rampa de roletes até a saída. O robô (robo.scad) fica atrás da mesa (o jogo põe e anima).
// Partes: chao, mesa (tampo claro), faixa (cor do serviço), metal, detalhe (escuro), papelao, saida.
include <comum_tema.scad>

parte = "tudo";
PARTES = ["chao", "mesa", "faixa", "metal", "detalhe", "papelao", "saida"];
$fn = 14;

TB = [-14, 8]; TW = 74; TD = 34; TZ = 30;
RAMP = [[30, -6, TZ + 0.5], [70, -6, P_CHAO[2] + 18]];

module rampa_trilhos() {
    ang = atan2(RAMP[1][1] - RAMP[0][1], RAMP[1][0] - RAMP[0][0]);
    for (s = [-1, 1]) hull() for (m = RAMP) translate(m) rotate([0, 0, ang]) translate([0, s * 13.5, -2]) cube([0.1, 3, 6], center = true);
}
module rampa_roletes() {
    ang = atan2(RAMP[1][1] - RAMP[0][1], RAMP[1][0] - RAMP[0][0]);
    for (t = [0.06 : 0.12 : 0.95]) let(m = RAMP[0] + t * (RAMP[1] - RAMP[0])) translate(m - [0, 0, 2]) rotate([0, 0, ang]) rotate([90, 0, 0]) cylinder(r = 2, h = 25, center = true, $fn = 8);
}

module peca(n) {
    if (n == "chao") p_chao();
    else if (n == "saida") { p_saida(); translate([66, -6, P_CHAO[2] - 0.3]) rbox2(8, 28, 12.6, 2, 0.8); }
    else if (n == "mesa") translate([TB[0], TB[1], TZ]) rbox2(TW, TD, 3, 3, 0.8);
    else if (n == "faixa") translate([TB[0], TB[1] - TD / 2 + 1, TZ - 6]) rbox2(TW, 3, 6.3, 1, 0.5);
    else if (n == "metal") {
        for (sx = [-1, 1], sy = [-1, 1]) translate([TB[0] + sx * (TW / 2 - 5), TB[1] + sy * (TD / 2 - 5), P_CHAO[2] - 0.3]) cylinder(r = 2.2, h = TZ - P_CHAO[2] + 0.6);
        rampa_trilhos();
        // rolo de fita
        translate([TB[0] + 24, TB[1] + 4, TZ + 2.7]) difference() { cylinder(r = 6, h = 5); translate([0, 0, -1]) cylinder(r = 3, h = 7); }
    }
    else if (n == "detalhe") { p_furo(); rampa_roletes(); }
    else if (n == "papelao") {
        for (i = [0 : 4]) translate([-54, -32, P_CHAO[2] - 0.3 + i * 2.2]) rotate([0, 0, i * 4 - 8]) rbox2(28, 22, 2.5, 1, 0.4);
        // caixa aberta sendo enchida e uma pronta
        translate([TB[0] - 6, TB[1] - 2, TZ + 2.7]) difference() { caixa([0, 0, 0]); translate([-7.4, -7.4, 2]) cube([14.8, 14.8, 20]); }
        caixa([TB[0] + 8, TB[1] - 4, TZ + 2.7]);
    }
}
if (parte == "tudo") { union() for (p = PARTES) peca(p); } else peca(parte);
