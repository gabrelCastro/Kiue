// Kiuê — Produtor como doca de expedição (galpão), v1 às cegas.
// Substitui a máquina com prensa: o galpão despacha caixas pelo portão de enrolar da direita.
// Escala: 1 unidade do jogo = 100 mm, antes do NODE_SCALE (1,3) que o jogo aplica.
// Convenções: Z para cima; frente em −Y (no jogo vira +z, voltada para a câmera);
// origem no centro, no topo do pedestal (pedestal 160 × 150 fica no jogo).
// Saída pela direita (+X): portão centrado na altura da conexão (30 mm); a doca vai até x = 76
// (a conexão começa em x = 80).
// Partes:
//   corpo    paredes (cor da peça, cinza-claro)
//   telhado  casca em arco com nervuras (grafite)
//   detalhe  escuro: moldura e caixa do portão, para-choques, porta da frente
//   doca     plataforma de carga (concreto)
//   janelas  vidros acesos da frente
//   portao   porta de enrolar; origem no topo da abertura, descendo em −Z
//            (o jogo encolhe a altura para "enrolar" a cada mensagem enviada)
//   palete   madeira
//   caixas   papelão

parte = "tudo";
PARTES = ["corpo", "telhado", "detalhe", "doca", "janelas", "portao", "palete", "caixas"];

W = 110; D = 96; WALL_H = 46;
RISE = 24;                         // flecha do arco das paredes das pontas
ROOF_T = 3;                        // espessura e beiral do telhado
DOOR_W = 32; DOOR_Z0 = 14; DOOR_Z1 = 46 - 2; // abertura do portão (z 14 a 44: centro 29)
DOOR_IN = 3;                       // portão recuado na parede
DOCK_X1 = 74; DOCK_H = 12; DOCK_D = 52;
$fn = 48;

// arco das pontas: meio cilindro achatado ao longo de X, só a parte acima de WALL_H
module arco(r, rise, len) {
    intersection() {
        translate([0, 0, WALL_H]) scale([1, 1, rise / r]) rotate([0, 90, 0]) cylinder(r = r, h = len, center = true);
        translate([-len, -2 * r, WALL_H]) cube([2 * len, 4 * r, 2 * r]);
    }
}

module corpo() {
    difference() {
        union() {
            translate([-W / 2, -D / 2, 0]) cube([W, D, WALL_H]);
            arco(D / 2, RISE, W);
        }
        // abertura do portão (lado direito)
        translate([W / 2 - DOOR_IN, -DOOR_W / 2, DOOR_Z0]) cube([DOOR_IN + 1, DOOR_W, DOOR_Z1 - DOOR_Z0]);
        // porta e janelas da frente, rebaixadas
        translate([-30, -D / 2 - 1, -1]) cube([14, 2.5, 25]);
        for (x = [-6, 14, 34]) translate([x, -D / 2 - 1, 26]) cube([14, 2.5, 10]);
    }
}

module telhado() {
    difference() {
        arco(D / 2 + ROOF_T, RISE + ROOF_T, W + 2 * ROOF_T);
        arco(D / 2 - 0.3, RISE - 0.3, W + 2 * ROOF_T + 2);
    }
    // nervuras: dão a leitura de telha metálica curva
    for (x = [-W / 2 - ROOF_T + 1, -27, 0, 27, W / 2 + ROOF_T - 1])
        translate([x, 0, 0]) difference() {
            arco(D / 2 + ROOF_T + 1.2, RISE + ROOF_T + 1.2, 2.4);
            arco(D / 2 + ROOF_T - 0.5, RISE + ROOF_T - 0.5, 4);
        }
}

module detalhe() {
    // moldura do portão, saliente 1,5
    translate([W / 2 - 0.3, 0, 0]) difference() {
        translate([0, -DOOR_W / 2 - 3, DOOR_Z0 - 0.01]) cube([1.8, DOOR_W + 6, DOOR_Z1 - DOOR_Z0 + 3]);
        translate([-1, -DOOR_W / 2, DOOR_Z0 - 1]) cube([4, DOOR_W, DOOR_Z1 - DOOR_Z0 + 1]);
    }
    // caixa do rolo do portão, acima da abertura
    translate([W / 2 - 0.3, -DOOR_W / 2 - 3, DOOR_Z1 + 2.7]) cube([5.3, DOOR_W + 6, 6]);
    // fundo escuro atrás do portão (encosta no fundo do recorte)
    translate([W / 2 - DOOR_IN - 0.3, -DOOR_W / 2 - 0.3, DOOR_Z0 - 0.3]) cube([1, DOOR_W + 0.6, DOOR_Z1 - DOOR_Z0 + 0.6]);
    // para-choques da doca
    for (y = [-17, 17]) translate([DOCK_X1 - 0.3, y - 3, 3]) cube([2.3, 6, 7]);
    // porta da frente (no fundo do rebaixo)
    translate([-30, -D / 2 + 1.2, 0]) cube([14, 0.6, 24.3]);
}

module doca() {
    // plataforma encostada na parede (sobreposição 0,3)
    translate([W / 2 - 0.3, -DOCK_D / 2, 0]) cube([DOCK_X1 - W / 2 + 0.3, DOCK_D, DOCK_H]);
}

module janelas() {
    for (x = [-6, 14, 34]) translate([x + 1, -D / 2 + 1.2, 27]) cube([12, 0.6, 8]);
}

module portao() {
    // chapa de 2 mm com frisos horizontais; origem no topo da abertura
    translate([-1, -DOOR_W / 2 + 0.2, -(DOOR_Z1 - DOOR_Z0)]) cube([2, DOOR_W - 0.4, DOOR_Z1 - DOOR_Z0]);
    for (z = [-(DOOR_Z1 - DOOR_Z0) + 3 : 4 : -2]) translate([0.7, -DOOR_W / 2 + 0.2, z]) cube([1.2, DOOR_W - 0.4, 1.2]);
}

module palete() {
    // palete na frente, à esquerda da porta: tábuas em cima de três calços
    translate([-50, -D / 2 - 24, 0]) {
        for (x = [0, 10.5, 21]) translate([x, 0, 0]) cube([3, 18, 3]);
        translate([0, 0, 2.7]) cube([24, 18, 1.5]);
    }
}

module caixas() {
    // três caixas no palete e uma em cima, com a fita do lacre em relevo
    translate([-50, -D / 2 - 24, 3.9]) {
        for (p = [[1, 1], [12.5, 1], [1, 9.5]]) translate([p[0], p[1], 0]) caixa(10.5, 8, 8);
        translate([6, 5, 7.7]) caixa(10, 8, 7);
    }
}

module caixa(w, d, h) {
    cube([w, d, h]);
    translate([w / 2 - 1, -0.3, h - 0.3]) cube([2, d + 0.6, 0.6]);
}

module peca(n) {
    if (n == "corpo") corpo();
    else if (n == "telhado") telhado();
    else if (n == "detalhe") detalhe();
    else if (n == "doca") doca();
    else if (n == "janelas") janelas();
    else if (n == "portao") translate([W / 2 - DOOR_IN + 1.3, 0, DOOR_Z1]) portao();
    else if (n == "palete") palete();
    else if (n == "caixas") caixas();
}

exporta = false;
if (parte == "tudo") union() for (p = PARTES) peca(p);
else if (exporta && parte == "portao") portao();
else peca(parte);
