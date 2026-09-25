# Goiás Torando o Vila — Invasão na Serrinha

Boomer shooter no estilo **DUSK / Doom / Quake**, que roda direto no navegador.
Você é o último torcedor da bateria da Força Jovem que ficou guardando o estádio
e precisa expulsar os vileiros que invadiram a **Serrinha** (Estádio Hailé Pinheiro, Goiânia).

> Jogo de paródia e obra de ficção, sem ligação oficial com clubes ou torcidas.
> Rivalidade é no campo — na vida real, violência não é torcida.

## Como jogar

Não precisa instalar nada, nem de internet: é só abrir o `index.html` num navegador
com WebGL2 (Chrome, Edge, Firefox ou Safari recentes).

Se preferir servir por HTTP (por exemplo, para publicar no GitHub Pages):

```bash
npx serve .        # ou: python3 -m http.server
```

Clique na tela para travar o mouse. `ESC` pausa.

## Controles

| Tecla | Ação |
|---|---|
| `W A S D` / setas | andar |
| mouse | mirar |
| botão esquerdo (ou `F`) | atirar / bater |
| `Espaço` | pular (segure para *bunny hop*) |
| `C` / `Shift` | agachar — correndo, **desliza** |
| `C` no ar | **cambalhota** (como no DUSK) |
| `1`–`6` / roda do mouse | trocar arma |
| `Q` | arma anterior |
| `ESC` / `P` | pausar |

Dá para fazer *air strafe* (virar o mouse enquanto aperta A/D no ar ganha velocidade)
e *rocket jump* com o lança-rojão.

## Arsenal

| # | Arma | Obs. |
|---|---|---|
| 1 | Mastro da bandeira | corpo a corpo, bandeira da FJG tremulando |
| 2 | Pistola | pegue a segunda para usar **duas** |
| 3 | Espingarda | com animação de *pump* e cápsulas voando |
| 4 | Doze de cano duplo | abre, ejeta e recarrega; empurra você para trás |
| 5 | Metralhadora | alta cadência |
| 6 | Lança-rojão (cano de PVC) | fogos coloridos, dano em área, *rocket jump* |

## Inimigos

- **Vileiro** — corre pra cima com um pedaço de pau.
- **Arremessador** — joga garrafa em arco.
- **Rojoeiro** — dispara rojão (desvie!).
- **Brutamonte** — tanque sem camisa que dá investida.
- **TIGRÃO** — o chefe: rajada de rojões, investida, pulo com onda de choque e chama reforço.

## Itens

Pequi (+5, passa de 100), pamonha (+25), **empadão goiano** (+100),
camisa da torcida (+25 de colete), **manto sagrado** (+100 de colete),
munição, chaves verde e branca, e botijões de gás que explodem.

Há **3 segredos** na fase e uma bola no gramado — chute para o gol.

## A fase

Rua em frente ao estádio (com o ônibus da torcida adversária) → bilheteria →
lanchonete e vestiário → túnel → gramado → arquibancada sul coberta e cabines de
imprensa → arquibancada norte → portão dos visitantes, onde está o chefe.

## Opções

Sensibilidade, campo de visão, pixelização (resolução interna), dithering, brilho,
volume, música, pulo automático, cambalhotas, inverter mouse, FPS e tela cheia.
As opções ficam salvas no navegador.

## Tecnologia

- Motor próprio em **WebGL2**, sem bibliotecas nem arquivos externos.
- Renderização em baixa resolução com texturas *nearest*, bandas de luz com dithering
  Bayer, redução de cores e neblina — o visual "crocante" do DUSK.
- Luz **assada por vértice** ao carregar (sombras, oclusão ambiente, luar e refletores),
  mais luzes dinâmicas por pixel (disparos, rojões, explosões, sinalizadores).
- Texturas, modelos, sons e música **gerados por código** (pixel art procedural,
  modelos de caixas, WebAudio sintetizado com batucada de torcida e riff distorcido).
- Colisão AABB com degraus, navegação 2.5D por campo de fluxo para os inimigos.

Estrutura:

```
index.html
js/util.js       matemática e utilidades
js/font.js       fonte bitmap 5x7 com acentos
js/textures.js   texturas procedurais
js/renderer.js   WebGL2, shaders
js/world.js      colisão, raycast, luz assada, navegação
js/models.js     modelos de caixas e emissão de geometria
js/audio.js      efeitos sonoros e música
js/level.js      o mapa da Serrinha e os eventos da fase
js/effects.js    partículas, projéteis, explosões, decalques
js/enemies.js    inimigos e chefe
js/player.js     movimento e armas
js/hud.js        HUD e menus
js/game.js       loop principal e regras
```
