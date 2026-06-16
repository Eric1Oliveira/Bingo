// ============================================================================
//  LÓGICA DO BINGO  —  cartelas 75 bolas (B-I-N-G-O), padrões e validação
//  Não depende de nada externo. Exposto em window.Bingo
// ============================================================================
(function () {
  "use strict";

  // Letras e faixas de cada coluna do bingo clássico de 75 bolas:
  //  B: 1-15   I: 16-30   N: 31-45   G: 46-60   O: 61-75
  const LETTERS = ["B", "I", "N", "G", "O"];
  const COLUMN_RANGES = [
    [1, 15],
    [16, 30],
    [31, 45],
    [46, 60],
    [61, 75],
  ];

  // ---------- utilidades ----------
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function rangeArray(min, max) {
    const out = [];
    for (let n = min; n <= max; n++) out.push(n);
    return out;
  }

  // Em qual coluna (0..4) cai um número? Usado para mostrar a letra B/I/N/G/O.
  function letterForNumber(n) {
    for (let c = 0; c < COLUMN_RANGES.length; c++) {
      if (n >= COLUMN_RANGES[c][0] && n <= COLUMN_RANGES[c][1]) return LETTERS[c];
    }
    return "";
  }

  // ---------- geração de cartela ----------
  // Retorna uma matriz 5x5 [linha][coluna]. O centro (2,2) é 0 = FREE.
  function generateCard() {
    const columns = COLUMN_RANGES.map(([min, max]) =>
      shuffle(rangeArray(min, max)).slice(0, 5)
    );
    const grid = [];
    for (let r = 0; r < 5; r++) {
      const row = [];
      for (let c = 0; c < 5; c++) {
        row.push(columns[c][r]);
      }
      grid.push(row);
    }
    grid[2][2] = 0; // FREE no centro
    return grid;
  }

  function generateCards(count) {
    const cards = [];
    const seen = new Set();
    let safety = 0;
    while (cards.length < count && safety < count * 50) {
      const card = generateCard();
      const key = card.flat().join(",");
      if (!seen.has(key)) {
        seen.add(key);
        cards.push(card);
      }
      safety++;
    }
    // se por azar não conseguiu cartelas únicas suficientes, completa mesmo repetindo
    while (cards.length < count) cards.push(generateCard());
    return cards;
  }

  // ============================================================================
  //  PADRÕES DE VITÓRIA
  //  Cada padrão é uma função que, dado o conjunto de células marcadas
  //  (Set com "r,c"), diz se a cartela ganhou. O centro conta como marcado.
  // ============================================================================

  function cellsToSet(cells) {
    const s = new Set();
    cells.forEach(([r, c]) => s.add(r + "," + c));
    return s;
  }

  // Gera as células de cada tipo de padrão (para desenhar e para validar)
  const PATTERN_CELLS = {
    line: (() => {
      // qualquer LINHA horizontal completa
      const lines = [];
      for (let r = 0; r < 5; r++) {
        lines.push([0, 1, 2, 3, 4].map((c) => [r, c]));
      }
      return lines; // várias possibilidades
    })(),
    column: (() => {
      const cols = [];
      for (let c = 0; c < 5; c++) {
        cols.push([0, 1, 2, 3, 4].map((r) => [r, c]));
      }
      return cols;
    })(),
    diagonal: [
      [[0, 0], [1, 1], [2, 2], [3, 3], [4, 4]],
      [[0, 4], [1, 3], [2, 2], [3, 1], [4, 0]],
    ],
    corners: [[[0, 0], [0, 4], [4, 0], [4, 4]]], // as 4 QUINAS
    cross: [[[0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [2, 0], [2, 1], [2, 3], [2, 4]]], // cruz +
    x: [[[0, 0], [1, 1], [2, 2], [3, 3], [4, 4], [0, 4], [1, 3], [3, 1], [4, 0]]], // X
    frame: (() => {
      const cells = [];
      for (let i = 0; i < 5; i++) {
        cells.push([0, i]);
        cells.push([4, i]);
        cells.push([i, 0]);
        cells.push([i, 4]);
      }
      // remove duplicatas
      const uniq = Array.from(new Set(cells.map((x) => x.join(",")))).map((s) =>
        s.split(",").map(Number)
      );
      return [uniq]; // moldura/borda
    })(),
    full: (() => {
      const cells = [];
      for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) cells.push([r, c]);
      return [cells]; // cartela cheia
    })(),
  };

  // Metadados bonitos para a interface (nome, ícone, descrição)
  const PATTERNS = {
    line:     { id: "line",     name: "Linha",         emoji: "➖", desc: "Qualquer linha horizontal completa" },
    column:   { id: "column",   name: "Coluna",        emoji: "❘",  desc: "Qualquer coluna vertical completa" },
    diagonal: { id: "diagonal", name: "Diagonal",      emoji: "⟍",  desc: "Uma das duas diagonais" },
    corners:  { id: "corners",  name: "Quinas",        emoji: "◰",  desc: "Os 4 cantos da cartela" },
    cross:    { id: "cross",    name: "Cruz",          emoji: "✚",  desc: "Linha + coluna do meio (cruz)" },
    x:        { id: "x",        name: "Xis (X)",       emoji: "✕",  desc: "As duas diagonais formando um X" },
    frame:    { id: "frame",    name: "Moldura",       emoji: "▢",  desc: "Toda a borda da cartela" },
    full:     { id: "full",     name: "Cartela Cheia", emoji: "▦",  desc: "Todos os 25 números (cheia)" },
  };

  // Dada uma cartela e os números sorteados, devolve o Set de células marcadas.
  function markedCells(card, drawnSet) {
    const marked = new Set();
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        const n = card[r][c];
        if (n === 0 || drawnSet.has(n)) marked.add(r + "," + c);
      }
    }
    return marked;
  }

  // Verifica se a cartela satisfaz o padrão. Retorna as células vencedoras ou null.
  function checkWin(card, drawnNumbers, patternId) {
    const drawnSet = drawnNumbers instanceof Set ? drawnNumbers : new Set(drawnNumbers);
    const marked = markedCells(card, drawnSet);
    const groups = PATTERN_CELLS[patternId] || PATTERN_CELLS.line;

    for (const group of groups) {
      const ok = group.every(([r, c]) => marked.has(r + "," + c));
      if (ok) return group.map(([r, c]) => r + "," + c);
    }
    return null;
  }

  // Quantas células faltam para o padrão mais próximo (para mostrar "falta 1!")
  function distanceToWin(card, drawnNumbers, patternId) {
    const drawnSet = drawnNumbers instanceof Set ? drawnNumbers : new Set(drawnNumbers);
    const marked = markedCells(card, drawnSet);
    const groups = PATTERN_CELLS[patternId] || PATTERN_CELLS.line;
    let best = Infinity;
    for (const group of groups) {
      const missing = group.filter(([r, c]) => !marked.has(r + "," + c)).length;
      if (missing < best) best = missing;
    }
    return best;
  }

  // Ordem sequencial dos padrões (do mais fácil ao mais difícil)
  const PATTERN_ORDER = ["line", "column", "diagonal", "corners", "cross", "x", "frame", "full"];

  // ============================================================================
  //  VALIDAÇÃO POR CÉLULAS MARCADAS (marcação MANUAL do jogador)
  //  Recebe um Set de "r,c" que o jogador realmente marcou (inclui o centro).
  // ============================================================================
  function checkWinMarks(markedSet, patternId) {
    const groups = PATTERN_CELLS[patternId] || PATTERN_CELLS.line;
    for (const group of groups) {
      if (group.every(([r, c]) => markedSet.has(r + "," + c))) {
        return group.map(([r, c]) => r + "," + c);
      }
    }
    return null;
  }

  function distanceMarks(markedSet, patternId) {
    const groups = PATTERN_CELLS[patternId] || PATTERN_CELLS.line;
    let best = Infinity;
    for (const group of groups) {
      const miss = group.filter(([r, c]) => !markedSet.has(r + "," + c)).length;
      if (miss < best) best = miss;
    }
    return best;
  }

  window.Bingo = {
    LETTERS,
    COLUMN_RANGES,
    PATTERNS,
    PATTERN_CELLS,
    PATTERN_ORDER,
    letterForNumber,
    generateCard,
    generateCards,
    checkWin,
    distanceToWin,
    checkWinMarks,
    distanceMarks,
    markedCells,
    cellsToSet,
  };
})();
