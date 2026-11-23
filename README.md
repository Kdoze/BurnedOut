# burned out

Um jogo curto em pixel art (estilo 8-bit), sobre uma noite real.

Você anda por uma casa vazia à noite, começando no seu quarto. A música começa baixinho; em **2:33**
o menino cai no chão e as vozes começam. O jogo termina junto com a música.

No banheiro dá para olhar no espelho. Às vezes (10%) tem alguma coisa atrás de você.
Na suíte da minha mãe também (5%), e não é a mesma coisa. O celular fica em cima da cômoda do meu quarto.

## Como jogar

| Ação | Teclado | Celular |
| --- | --- | --- |
| Andar | setas ou WASD | direcional na tela |
| Interagir / avançar texto | Enter, Espaço ou Z | botão **A** ou tocar na tela |
| Voltar (no celular) | Esc, Backspace ou X | o **<** no topo da tela do celular |

Recomendado: fones de ouvido. No celular, o jogo funciona deitado ou em pé (deitado fica maior).

## Rodar localmente

O jogo é só HTML/JS estático, sem build. Ele precisa ser aberto por um servidor
(abrindo o arquivo direto com `file://` a música fica sem os efeitos de áudio):

```bash
python3 -m http.server 8000
```

Depois abra `http://localhost:8000`.

## Publicar no GitHub Pages

1. Faça o merge deste conteúdo na branch que o Pages vai servir (ex.: `main`).
2. No GitHub: **Settings → Pages → Build and deployment → Deploy from a branch**, escolha a branch e a pasta `/ (root)`.
3. O jogo fica em `https://<usuario>.github.io/<repositorio>/`.

O arquivo `.nojekyll` já está no repositório para o Pages servir os arquivos como estão.

## Onde editar

Quase tudo que é texto ou tempo fica em **`js/config.js`**:

- `INTRO_TEXTS`: mensagens antes do jogo começar
- `INTRUSIVE`, `INTRUSIVE_BIG`, `INTRUSIVE_WALL`: as vozes intrusivas
- `TREMBLE_AT` (2:30.1, o "drop" da música), `FALL_AT` (2:33), `MUSIC_FADE_IN`
- `START_ROOM` / `START_POS`: onde o menino começa (o meu quarto)
- `MIRROR_*` / `MIRROR2_*`: chance das criaturas nos espelhos, frases, tempo até pegar, tempo atordoado
- `PHONE_*`: hora, notificação, notas e a lista de conversas do WhatsApp do celular

Outros arquivos:

- `js/world.js`: mapa da casa (baseado na planta), móveis, textos dos objetos, luzes
- `js/sprites.js`: o menino em pixel art (cores na paleta `PAL`)
- `js/effects.js`: escuridão, tentáculos e vozes
- `js/mirror.js`: os espelhos, as duas criaturas, a captura e o efeito de atordoado
- `js/phone.js`: o celular (tela de bloqueio, apps, WhatsApp)
- `js/audio.js`: bips, música, drone/coração do final
- `js/main.js`: estados do jogo (intro → exploração → queda → fim)

### Atalhos de teste (pela URL)

- `?skip`: pula as mensagens iniciais
- `?t=148`: começa a música nesse segundo (ex.: perto da queda)
- `?pos=6,14`: posição inicial do menino em tiles (ex.: na sala)
- `?debug`: mostra o tempo da música e o cômodo atual
- `?creature`: a criatura sempre aparece no espelho (ex.: `?skip&t=30&pos=14.3,14.4&creature`;
  na suíte da minha mãe: `?skip&t=30&pos=26.6,14.4&creature`, olhando para a direita)

Exemplo: `index.html?skip&t=148&pos=6,14&debug`. O `?t=` precisa de um servidor que aceite
*range requests* (o GitHub Pages aceita; o `python3 -m http.server` não).

## Créditos

- Música: *Forgive Yourself (memory ver.)*. Os direitos pertencem aos autores originais.
- Fonte: [Press Start 2P](https://fonts.google.com/specimen/Press+Start+2P), SIL Open Font License 1.1
  (ver `assets/fonts/OFL-PressStart2P.txt`). Convertida para bitmap em `js/fontdata.js`.
- Fonte pequena do celular: [Tiny5](https://fonts.google.com/specimen/Tiny5), SIL Open Font License 1.1
  (ver `assets/fonts/OFL-Tiny5.txt`). Convertida para bitmap em `js/fontsmall.js`.
