// Gerador de números aleatórios com semente (mulberry32) – core/rng.js
// Script comum (sem módulos), como o hub-data.js: carregue com <script src="../core/rng.js"></script>
// antes do script que usa. Tudo fica dentro do objeto global RNG.
//
//   RNG.semear(123)        sequência reproduzível a partir da semente 123
//   RNG.semear()           semente nova (crypto.getRandomValues; sem ele, o relógio)
//   RNG.salvar()           { semente, estado }: guarde no save
//   RNG.restaurar(obj)     retoma exatamente de onde o save parou (devolve false se o objeto for inválido)
//   RNG.prox()             número em [0, 1)
//   RNG.rnd(n)             inteiro de 0 a n-1
//   RNG.embaralhar(lista)  cópia embaralhada (Fisher-Yates); a lista original não muda
//   RNG.ponderado(itens, pesos)  sorteia um item; pesos = lista do mesmo tamanho ou função(item) => peso
//
// "semente" identifica a origem da sequência; "estado" é a posição atual nela (um inteiro de 32 bits).
// Salvar só a semente faria a sequência recomeçar do zero ao recarregar; com o estado ela continua.
const RNG = (() => {
  let semente = 0, estado = 0;

  const novaSemente = () => {
    try { if (typeof crypto !== "undefined" && crypto.getRandomValues) return crypto.getRandomValues(new Uint32Array(1))[0]; } catch (e) { /* cai no relógio */ }
    return (Date.now() ^ (typeof performance !== "undefined" ? Math.floor(performance.now() * 1000) : 0)) >>> 0;
  };

  function semear(s) {
    const n = s == null ? novaSemente() : Number(s);
    semente = (Number.isFinite(n) ? n : novaSemente()) >>> 0;
    estado = semente | 0;
    return semente;
  }

  function prox() {                      // mulberry32: um passo, devolve [0, 1)
    estado = (estado + 0x6D2B79F5) | 0;
    let t = Math.imul(estado ^ (estado >>> 15), 1 | estado);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  const rnd = n => Math.floor(prox() * n);

  function embaralhar(a) {
    const b = [...a];
    for (let i = b.length - 1; i > 0; i--) { const j = rnd(i + 1); [b[i], b[j]] = [b[j], b[i]]; }
    return b;
  }

  function ponderado(itens, pesos) {
    const w = typeof pesos === "function" ? itens.map(pesos) : pesos;
    if (!itens.length || !w || w.length !== itens.length) throw new Error("RNG.ponderado: informe itens e pesos do mesmo tamanho.");
    const total = w.reduce((s, x) => s + (x > 0 ? x : 0), 0);
    if (!(total > 0)) throw new Error("RNG.ponderado: a soma dos pesos precisa ser maior que zero.");
    let r = prox() * total, ult = -1;
    for (let i = 0; i < itens.length; i++) {
      if (!(w[i] > 0)) continue;         // peso zero, negativo ou inválido nunca é sorteado
      ult = i;
      if ((r -= w[i]) < 0) return itens[i];
    }
    return itens[ult];                   // só chega aqui por arredondamento
  }

  function salvar() { return { semente, estado }; }
  function restaurar(o) {
    if (!o || !Number.isFinite(o.semente) || !Number.isFinite(o.estado)) return false;
    semente = o.semente >>> 0; estado = o.estado | 0;
    return true;
  }

  semear();                              // já nasce semeado: quem não chamar semear() ainda recebe números diferentes a cada carga
  return { semear, salvar, restaurar, prox, rnd, embaralhar, ponderado, get semente() { return semente; } };
})();

if (typeof module !== "undefined" && module.exports) module.exports = RNG;   // só para testes em Node
