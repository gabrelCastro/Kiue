// Kiuê — pátio comum das funções sob demanda (uma por tema), v1.
// A função não tem pedestal: o pátio é a base. 20 postos (teto de concorrência do jogo) em duas
// fileiras de 10 viradas para um corredor (y = AISLE); a fonte fica na ponta esquerda do
// corredor, onde o cano chega (x = −113, z = 46); uma faixa à direita liga o corredor à calçada
// de baixo (WALK_Y), onde ficam as baias de chegada de cada tema (partida a frio).
// Escala: mm antes do NODE_SCALE 1,3; Z para cima; frente em −Y (no jogo, +z).
// Usado por models/<tema>_funcao.scad; o jogo (src/render/themes/yard.ts) repete estas medidas.

W = 232; D = 176; BASE_H = 8; FLOOR = 8.7;
N = 20;
XK0 = -66; XKP = 19;
AISLE = 18; ROW_F = -4; ROW_B = 40; LANE_R = 112; ROAD = -70; WALK_Y = -30;
BAY_X = [0, 30, 60, 90]; BAY_Y = -58;
PORT_X = -113; PORT_Z = 46;
function vaga(i) = [XK0 + (i % 10) * XKP, i < 10 ? ROW_F : ROW_B];

module rbox2(w, d, h, r, ch) {
    hull() for (sx = [-1, 1], sy = [-1, 1]) translate([sx * (w / 2 - r), sy * (d / 2 - r), 0]) {
        cylinder(r1 = r - ch, r2 = r, h = ch);
        translate([0, 0, ch]) cylinder(r = r, h = h - 2 * ch);
        translate([0, 0, h - ch]) cylinder(r1 = r, r2 = r - ch, h = ch);
    }
}
module base_patio() rbox2(W, D, BASE_H, 10, 2);
module bocal_entrada() translate([PORT_X, 0, PORT_Z]) rotate([0, -90, 0]) difference() { cylinder(r = 14, h = 6, $fn = 28); translate([0, 0, -1]) cylinder(r = 8.5, h = 8, $fn = 28); }
module furo_entrada() translate([PORT_X - 0.5, 0, PORT_Z]) rotate([0, 90, 0]) cylinder(r = 8.8, h = 2, center = true, $fn = 28);
// luz do posto: moldura no chão em volta dele (origem no centro do posto, no chão)
module luz_posto(w = 17.6, d = 13.6) difference() { rbox2(w, d, 2, 2, 0.4); translate([0, 0, -1]) cube([w - 2.6, d - 2.6, 6], center = true); }
