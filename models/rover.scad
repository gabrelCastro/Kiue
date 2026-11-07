// Kiuê — carrinho-robô (tema entregas), v1. Um por worker, posto e animado pelo jogo.
// Origem no chão, no centro; frente em −Y (no jogo, +z: de frente para a câmera). 32 × 20 mm.
// Partes: corpo (claro), parachoque (cor do serviço), rodas (escuro), cacamba (metal),
// visor (escuro), olhos (acesos).
parte = "tudo";
PARTES = ["corpo", "parachoque", "rodas", "cacamba", "visor", "olhos"];
$fn = 14;

module peca(n) {
    if (n == "corpo") {
        hull() for (sx = [-1, 1], sy = [-1, 1]) translate([sx * 7, sy * 11, 4]) { cylinder(r = 3, h = 7); translate([0, 0, 7]) sphere(r = 3, $fn = 10); }
        // cabine com o rosto, na frente
        hull() for (sx = [-1, 1], sy = [0, 1]) translate([sx * 6, -8 - sy * 5, 12]) { sphere(r = 3, $fn = 10); translate([0, 0, 7]) sphere(r = 3, $fn = 10); }
    } else if (n == "parachoque") {
        translate([0, 0, 5.5]) hull() for (sx = [-1, 1], sy = [-1, 1]) translate([sx * 7.4, sy * 11.4, 0]) cylinder(r = 3, h = 2.6);
    } else if (n == "rodas") {
        for (sx = [-1, 1], sy = [-1, 1]) translate([sx * 10.4, sy * 8, 4.3]) rotate([0, 90, 0]) cylinder(r = 4.6, h = 3, center = true);
    } else if (n == "cacamba") {
        translate([-8, -1, 13.7]) cube([16, 14, 1.6]);
    } else if (n == "visor") {
        translate([0, -15.6, 17.5]) rotate([90, 0, 0]) linear_extrude(1.6) offset(r = 1.8) square([10, 5], center = true);
    } else if (n == "olhos") {
        for (s = [-1, 1]) translate([s * 2.8, -17, 18]) rotate([90, 0, 0]) cylinder(r = 1.5, h = 0.9, $fn = 10);
    }
}
if (parte == "tudo") { union() for (p = PARTES) peca(p); } else peca(parte);
