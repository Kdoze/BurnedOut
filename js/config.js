// =====================================================================
//  CONFIGURAÇÃO — textos, tempos e ajustes fáceis de editar.
// =====================================================================
window.CONFIG = {
  // Resolução interna (pixels "de verdade" do jogo). Tudo é escalado depois.
  W: 320,
  H: 180,
  TILE: 16,

  MUSIC_SRC: 'assets/audio/forgive-yourself.mp3',

  // Tempos em segundos, medidos na própria música.
  MUSIC_FADE_IN: 24,     // fade-in longo do início
  TREMBLE_AT: 150.1,     // 2:30.1 — o "drop" da música: o menino trava e começa a tremer
  FALL_AT: 153.0,        // 2:33  — ele cai no chão
  DESPAIR_FULL_AT: 336,  // quando o desespero chega ao máximo (o fim vem logo depois)

  PLAYER_SPEED: 54,      // pixels por segundo

  // Sala onde o jogo começa (quarto com a escrivaninha) e posição em tiles.
  START_ROOM: 'quarto',
  START_POS: { x: 15.5, y: 6.2 },

  // ---------------------------------------------------------------
  //  Mensagens antes do jogo começar (ENTER / toque passa para a próxima)
  // ---------------------------------------------------------------
  INTRO_TEXTS: [
    'esse jogo é baseado em um dia real.',
    'não me orgulho do que aconteceu.',
    'não me sinto confortável falando com você sobre esses problemas mentais.',
    'e eu não gostaria que você se preocupasse comigo por causa disso.',
    'esse episódio aconteceu numa noite em que você estava na faculdade, e eu acabei sumindo por algumas horas.',
  ],

  // ---------------------------------------------------------------
  //  Vozes intrusivas (aparecem depois da queda, cada vez mais rápido)
  // ---------------------------------------------------------------
  INTRUSIVE: [
    'você não deveria existir',
    'você é o maior dos problemas',
    'ninguém sentiria sua falta',
    'você só atrapalha',
    'olha o que você fez',
    'de novo isso?',
    'você estraga tudo',
    'é tudo culpa sua',
    'ninguém se importa',
    'você é um peso',
    'patético',
    'inútil',
    'fraco',
    'você nunca vai mudar',
    'eles estariam melhor sem você',
    'para de fingir que está bem',
    'você não merece ser amado',
    'por que você ainda tenta?',
    'todo mundo cansa de você',
    'você é uma decepção',
    'você vai acabar sozinho',
    'sozinho',
    'ninguém vem',
    'você não serve pra nada',
    'some',
    'vergonha',
    'ridículo',
    'você sempre foi assim',
    'ninguém aguenta você',
    'é só drama',
    'levanta. você não consegue, né?',
    'quem você pensa que engana?',
  ],
  // Palavras curtas que às vezes aparecem GRANDES no meio da tela.
  INTRUSIVE_BIG: ['SOZINHO', 'INÚTIL', 'CULPA SUA', 'SOME', 'FARDO', 'PESO', 'NINGUÉM'],
  // Frase que vai "forrando" a tela no final.
  INTRUSIVE_WALL: 'a culpa é sua. ',
};
