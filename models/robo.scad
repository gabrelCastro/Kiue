// Kiuê — robozinho articulado (tema fazenda), v1.
// Família dos robôs dos guichês e da função sob demanda: corpo de cápsula, cabeça arredondada com
// visor escuro e dois olhos acesos, chapéu de palha. Escala 1 = 40 mm de altura (sem o chapéu);
// o jogo amplia/encolhe por instância.
// Convenções: Z para cima; frente em −Y (no jogo vira +z, de frente para a câmera); origem no chão,
// entre os pés. Os braços saem com a origem no ombro (exporta = true) para o jogo girá-los em x.
// Partes: corpo (branco), visor (escuro), olhos (acesos), chapeu (palha), bracos (branco, articulado).

parte = "tudo";
exporta = false;
PARTES = ["corpo", "visor", "olhos", "chapeu", "bracos"];
$fn = 14;

SHOULDER = [0, 0, 20];

module corpo() {
    hull() { translate([0, 0, 10]) sphere(r = 8.5); translate([0, 0, 18.5]) sphere(r = 8.5); }
    hull() for (sx = [-1, 1], sy = [-1, 1], sz = [0, 1]) translate([sx * 6, sy * 5, 29 + sz * 6]) sphere(r = 4.2, $fn = 10);
    // pés (afundam 0,3 no corpo)
    for (s = [-1, 1]) translate([s * 4.5, -1, 0]) hull() { cylinder(r = 3.4, h = 3.5, $fn = 10); translate([0, -3, 0]) cylinder(r = 3.4, h = 3.5, $fn = 10); }
    translate([0, 0, 2]) cylinder(r = 4.5, h = 4.3, $fn = 12);
}
module visor() translate([0, -8.9, 32.5]) rotate([90, 0, 0]) linear_extrude(1.6) offset(r = 2) square([11, 5], center = true);
module olhos() for (s = [-1, 1]) translate([s * 3, -10.2, 32.8]) rotate([90, 0, 0]) cylinder(r = 1.6, h = 0.9, $fn = 10);
module chapeu() translate([0, 0, 38.6]) { cylinder(r1 = 11, r2 = 10, h = 1.2, $fn = 20); cylinder(r1 = 6.5, r2 = 5.5, h = 5.5, $fn = 16); }
// braços para a frente, um pouco abaixados (pose base); o jogo gira em torno do ombro
module bracos() for (s = [-1, 1]) hull() { translate([s * 9.5, 0, 0]) sphere(r = 2.6, $fn = 10); translate([s * 8, -13, -3]) sphere(r = 2.3, $fn = 10); }

module peca(n) {
    if (n == "corpo") corpo(); else if (n == "visor") visor(); else if (n == "olhos") olhos();
    else if (n == "chapeu") chapeu(); else if (n == "bracos") translate(SHOULDER) bracos();
}
if (parte == "tudo") { union() for (p = PARTES) peca(p); }
else if (exporta && parte == "bracos") bracos();
else peca(parte);
