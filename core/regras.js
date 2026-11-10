// Rodadas, tabela e critérios de desempate – core/regras.js
// Script comum, como o rng.js e o sim.js: <script src="../core/rng.js"></script>, <script src="../core/sim.js"></script>
// e <script src="../core/regras.js"></script> antes do campeonato.js. Tudo fica no objeto global Regras.
//
//   Regras.gerarRodadas(ids, turnos)          -> lista de rodadas; cada rodada é uma lista de jogos { c, f, gc, gf, ac, af, vc, vf }
//   Regras.tabela(ids, jogos, opcoes)         -> linhas ordenadas { id, P, J, V, E, D, GP, GC, SG, AM, VM, ded }
//   Regras.comparador(criterios, semente, nome) -> função de ordenação para comparar times de grupos diferentes
//   Regras.cartoes(opcoes)                    -> { ac, af, vc, vf }: cartões sorteados de uma partida
//   Regras.CRITERIOS / Regras.PADRAO / Regras.validos(lista)
//
// Jogo: c = id do mandante, f = id do visitante, gc/gf = gols, ac/af = amarelos e vc/vf = vermelhos de cada lado.
// Jogo sem gc/gf ainda não aconteceu e não entra na tabela. Cartão ausente (null/undefined) conta como zero.
//
// opcoes da tabela: { pv: 3, pe: 1, deducoes: [{ id, pts }], criterios: [...], semente: n, nome: id => texto }
//   Os pontos (menos as deduções) sempre vêm primeiro. Quem continua empatado é decidido, nesta ordem, pelos
//   "criterios" (lista de ids, na ordem em que valem; id fora da lista não é usado):
//     vitorias   maior número de vitórias
//     saldo      melhor saldo de gols
//     golspro    maior quantidade de gols pró
//     direto     confronto direto (ver abaixo)
//     vermelhos  menor número de cartões vermelhos
//     amarelos   menor número de cartões amarelos
//     sorteio    sorteio público da CBF
//   Empate que sobrar depois de todos os critérios: ordem alfabética do nome (ou do id), para a tabela nunca tremer.
//
// Confronto direto (2 ou mais empatados): vale só o que aconteceu nos jogos entre os próprios empatados, como uma
// minitabela (pv por vitória, pe por empate; deduções não entram). Se a minitabela separar o grupo em partes, cada
// parte que continuar empatada passa de novo pelo confronto direto, agora só entre os seus times, e só então segue
// para o próximo critério. Se a minitabela não separar ninguém, segue para o próximo critério.
//
// Sorteio: não usa o RNG a cada consulta (a tabela é recalculada o tempo todo e a ordem não pode mudar sozinha).
// A "semente" fica guardada no save e a posição de cada time é uma função fixa de (semente, id): mesma semente,
// mesmo sorteio. Troque a semente a cada temporada para um sorteio novo.
const Regras = (() => {
  const CRITERIOS = {
    vitorias:  { nome: "Maior número de vitórias" },
    saldo:     { nome: "Melhor saldo de gols" },
    golspro:   { nome: "Maior quantidade de gols pró" },
    direto:    { nome: "Confronto direto" },
    vermelhos: { nome: "Menor número de cartões vermelhos" },
    amarelos:  { nome: "Menor número de cartões amarelos" },
    sorteio:   { nome: "Sorteio público da CBF" }
  };
  const PADRAO = ["vitorias", "saldo", "golspro", "direto", "vermelhos", "amarelos", "sorteio"];
  const CARTOES = { amarelos: 2, vermelhos: 0.1 };   // média por time em cada partida

  const validos = l => Array.isArray(l) ? l.filter((c, i) => CRITERIOS[c] && l.indexOf(c) === i) : PADRAO.slice();

  /* ---------- Rodadas (método do círculo) ---------- */
  function gerarRodadas(ids, turnos) {
    const novo = (c, f) => ({ c, f, gc: null, gf: null, ac: null, af: null, vc: null, vf: null });
    const v = [...ids]; if (v.length % 2) v.push(null);            // grupo ímpar: alguém folga a cada rodada
    const n = v.length, ida = [];
    for (let r = 0; r < n - 1; r++) {
      ida.push(Array.from({ length: n / 2 }, (_, i) => novo(v[i], v[n - 1 - i])).filter(m => m.c && m.f));
      v.splice(1, 0, v.pop());
    }
    const volta = turnos === 2 ? ida.map(r => r.map(m => novo(m.f, m.c))) : [];
    return [...ida, ...volta];
  }

  /* ---------- Sorteio estável ---------- */
  function hash(semente, id) {                                     // FNV-1a com mistura final: número de 32 bits
    let x = (semente >>> 0) ^ 0x811C9DC5; const s = String(id);
    for (let i = 0; i < s.length; i++) x = Math.imul(x ^ s.charCodeAt(i), 0x01000193);
    x ^= x >>> 16; x = Math.imul(x, 0x85EBCA6B); x ^= x >>> 13; x = Math.imul(x, 0xC2B2AE35); x ^= x >>> 16;
    return x >>> 0;
  }

  /* ---------- Critérios ---------- */
  // valor de um critério para uma linha: quanto MAIOR, melhor colocado. "direto" recebe o mapa de pontos do confronto direto.
  function valor(c, l, ctx, dir) {
    switch (c) {
      case "vitorias": return l.V;
      case "saldo": return l.SG;
      case "golspro": return l.GP;
      case "vermelhos": return -l.VM;
      case "amarelos": return -l.AM;
      case "sorteio": return -hash(ctx.semente, l.id);
      case "direto": return dir.get(l.id);
    }
    return 0;
  }
  function pontosDireto(grupo, ctx) {                              // minitabela só com os jogos entre os empatados
    const ids = new Set(grupo.map(l => l.id)), pts = new Map(grupo.map(l => [l.id, 0]));
    ctx.jogos.forEach(m => {
      if (!ids.has(m.c) || !ids.has(m.f) || m.gc == null || m.gf == null) return;
      if (m.gc > m.gf) pts.set(m.c, pts.get(m.c) + ctx.pv);
      else if (m.gc < m.gf) pts.set(m.f, pts.get(m.f) + ctx.pv);
      else { pts.set(m.c, pts.get(m.c) + ctx.pe); pts.set(m.f, pts.get(m.f) + ctx.pe); }
    });
    return pts;
  }
  function agrupar(lista, val) {                                   // do maior para o menor valor; iguais ficam no mesmo grupo
    const v = lista.map(l => [val(l), l]).sort((a, b) => b[0] - a[0]), out = [];
    v.forEach(([x, l], i) => { if (i && x === v[i - 1][0]) out[out.length - 1].push(l); else out.push([l]); });
    return out;
  }
  const porNome = ctx => (a, b) => ctx.nome(a.id).localeCompare(ctx.nome(b.id), "pt-BR") || String(a.id).localeCompare(String(b.id));
  function resolver(grupo, i, ctx) {                               // desempata um grupo de times com os mesmos pontos
    if (grupo.length < 2) return grupo;
    if (i >= ctx.crit.length) return [...grupo].sort(porNome(ctx));
    const c = ctx.crit[i], dir = c === "direto" ? pontosDireto(grupo, ctx) : null;
    const partes = agrupar(grupo, l => valor(c, l, ctx, dir));
    const prox = c === "direto" && partes.length > 1 ? i : i + 1;  // o direto separou: cada parte empatada refaz o direto entre si
    return partes.flatMap(p => resolver(p, prox, ctx));
  }

  /* ---------- Tabela ---------- */
  function tabela(ids, jogos, opcoes) {
    const o = { pv: 3, pe: 1, deducoes: [], criterios: PADRAO, semente: 0, nome: id => String(id), ...(opcoes || {}) };
    const por = new Map(ids.map(id => [id, { id, P: 0, J: 0, V: 0, E: 0, D: 0, GP: 0, GC: 0, SG: 0, AM: 0, VM: 0, ded: 0 }]));
    jogos.forEach(m => {
      const a = por.get(m.c), b = por.get(m.f);
      if (!a || !b || m.gc == null || m.gf == null) return;
      a.J++; b.J++; a.GP += m.gc; a.GC += m.gf; b.GP += m.gf; b.GC += m.gc;
      a.AM += m.ac || 0; b.AM += m.af || 0; a.VM += m.vc || 0; b.VM += m.vf || 0;
      if (m.gc > m.gf) { a.P += o.pv; a.V++; b.D++; }
      else if (m.gc < m.gf) { b.P += o.pv; b.V++; a.D++; }
      else { a.P += o.pe; b.P += o.pe; a.E++; b.E++; }
    });
    (o.deducoes || []).forEach(x => { if (por.has(x.id)) por.get(x.id).ded += x.pts; });   // punições
    const L = [...por.values()]; L.forEach(x => { x.P -= x.ded; x.SG = x.GP - x.GC; });
    const ctx = { jogos, pv: o.pv, pe: o.pe, crit: validos(o.criterios), semente: o.semente, nome: o.nome };
    return agrupar(L, l => l.P).flatMap(g => resolver(g, 0, ctx));
  }

  // Para ordenar times de grupos diferentes (o confronto direto não existe entre quem não se enfrentou, então é ignorado).
  // Compara linhas { id, V, SG, GP, AM, VM }; devolve < 0 se "a" fica na frente.
  function comparador(criterios, semente, nome) {
    const crit = validos(criterios).filter(c => c !== "direto"), ctx = { semente, nome: nome || (id => String(id)) };
    return (a, b) => {
      for (const c of crit) { const d = valor(c, b, ctx) - valor(c, a, ctx); if (d) return d; }
      return porNome(ctx)(a, b);
    };
  }

  /* ---------- Cartões de uma partida ---------- */
  function poisson(lambda, rng) {                                  // Knuth, como no sim.js
    const L = Math.exp(-lambda); let k = 0, p = 1;
    do { k++; p *= rng.prox(); } while (p > L);
    return k - 1;
  }
  function cartoes(opcoes) {
    const o = { ...CARTOES, ...(opcoes || {}) }, g = o.rng || (typeof RNG !== "undefined" ? RNG : null);
    if (!g) throw new Error("Regras: carregue ../core/rng.js antes do regras.js (ou passe opcoes.rng).");
    return { ac: poisson(o.amarelos, g), af: poisson(o.amarelos, g), vc: poisson(o.vermelhos, g), vf: poisson(o.vermelhos, g) };
  }

  return { gerarRodadas, tabela, comparador, cartoes, validos, CRITERIOS, PADRAO, CARTOES };
})();

if (typeof module !== "undefined" && module.exports) module.exports = Regras;   // só para testes em Node
