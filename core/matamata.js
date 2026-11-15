// Mata-mata (chave eliminatória) – core/matamata.js
// Script comum, como o rng.js, o sim.js e o regras.js: <script src="../core/matamata.js"></script> antes do script da página.
// Não depende de DOM, de outros módulos nem de variáveis da página: o que vem de fora (os times, as regras e
// o gerador de placares) entra por parâmetro. Tudo fica no objeto global Matamata.
//
//   Matamata.criar(times, regras)                -> chave nova a partir dos times em ordem de cabeça de chave
//   Matamata.criarDeSlots(prelim, slots, regras) -> chave a partir de um chaveamento já sorteado (ver Sorteio.sortear): preliminar + anel principal
//   Matamata.sincronizar(chave, times, regras)   -> a mesma chave (com os vencedores repassados) ou uma nova, se os times mudaram
//   Matamata.propagar(chave)                     -> leva os vencedores de cada rodada para a seguinte
//   Matamata.vencedor(confronto)                 -> id do vencedor, ou null enquanto não estiver decidido
//   Matamata.pendencia(confronto)                -> o que ainda falta digitar num empate: "neutro", "penaltis" ou null
//   Matamata.decididoPor(confronto)              -> "placar", "golfora", "neutro", "penaltis", "folga" ou null (ainda indefinido)
//   Matamata.agregado(confronto)                 -> [gols de a, gols de b] somando todas as pernas
//   Matamata.casaDaPerna(confronto, i)           -> "a" ou "b": quem é o mandante da perna i
//   Matamata.ordem(chave)                        -> [campeão, vice, semifinalistas…] ou null se a final não terminou
//   Matamata.nomeRodada(chave, i)                -> "Final", "Semifinal", "Quartas de final"…
//   Matamata.proximaRodada(chave)                -> índice da primeira rodada com confronto indefinido, ou -1
//   Matamata.jogar(confronto, opcoes)            -> preenche o que falta de um confronto
//   Matamata.jogarRodada(chave, i, opcoes)       -> joga a rodada i e repassa os vencedores
//   Matamata.simular(chave, opcoes)              -> joga todas as rodadas até o campeão
//
// regras: { pernas: jogos por confronto (1 ou 2), final: jogos da final (1 ou 2),    (ausente = 1)
//           desempate: "penaltis" | "neutro" | "golfora",                             (ausente = "penaltis")
//           idaEm: "a" | "b" }                                                        (ausente = "b": a ida é no campo de b)
// opcoes: { gols(mandante, visitante) -> [gols do mandante, gols do visitante],       (obrigatório para jogar)
//           golsNeutro(a, b) -> [gols de a, gols de b] em campo neutro,               (opcional; sem ele usa gols, com o mando de a)
//           penaltis(confronto) -> [pênaltis de a, pênaltis de b] }                   (opcional; sem ele usa Math.random)
//
// Desempate do confronto (vale quando o agregado das pernas termina empatado):
//   "penaltis" – decidem os pênaltis (padrão).
//   "golfora"  – vence quem fez mais gols como visitante; só vale com ida e volta. Em jogo único, ou se os gols fora
//                também empatam, decidem os pênaltis.
//   "neutro"   – um jogo extra em campo neutro (confronto.n = [gols de a, gols de b]); se ele empatar, decidem os pênaltis.
//
// Chave: { sd: [ids na ordem de cabeça de chave], r: [rodada, rodada…] }. Cada rodada é uma lista de confrontos:
//   { a, b, bye, l: [[gols de a, gols de b], …uma por perna], pen: [pênaltis de a, de b] | null,
//     desempate?: "golfora" | "neutro" (só aparece quando não é o padrão), n?: [gols de a, gols de b] (só no "neutro"),
//     idaEm?: "a" (só quando a ida é no campo de a), man?: id (decisão manual), de?: { a?, b? } (de qual confronto da rodada anterior vem cada lado; lado sem entrada tem time fixo) }
// A chave é um objeto simples (JSON): dá para guardar no save e devolver a sincronizar() depois.
// Se o número de times não é potência de 2, os melhores cabeças de chave folgam na 1ª rodada (bye: true).
// Com 2 pernas, a ida é no campo de b (o cabeça de chave pior) e a volta no de a; com 1 perna, o jogo é no campo de a.
// Com idaEm: "a" (confronto.idaEm = "a"), a ida é no campo de a e a volta no de b.
// Decisão manual: confronto.man = id de a ou de b avança sem placar (vale mesmo sem nenhuma perna preenchida).
// Placar só vale quando todas as pernas têm gols dos dois lados; se o agregado empata, decidem os pênaltis.
const Matamata = (() => {
  const agregado = t => [t.l.reduce((s, x) => s + x[0], 0), t.l.reduce((s, x) => s + x[1], 0)];
  const idaEm = t => t.idaEm === "a" ? "a" : "b";
  const casaDaPerna = (t, i) => t.l.length === 2 ? ((i === 0) === (idaEm(t) === "a") ? "a" : "b") : "a";
  const completo = t => t.l.every(x => x[0] != null && x[1] != null);
  const regra = t => t.desempate || "penaltis";                  // confrontos de saves antigos não têm o campo
  const decide = p => !!(p && p[0] != null && p[1] != null && p[0] !== p[1]);
  // gols fora de a e de b (só com ida e volta): a joga fora na perna em que b é o mandante
  const golsFora = t => { const ib = idaEm(t) === "b" ? 0 : 1; return [t.l[ib][0], t.l[1 - ib][1]]; };
  const golForaDecide = t => regra(t) === "golfora" && t.l.length === 2 && golsFora(t)[0] !== golsFora(t)[1];
  const manual = t => !!t.man && (t.man === t.a || t.man === t.b);
  const neutroFeito = t => !!(t.n && t.n[0] != null && t.n[1] != null);

  function vencedor(t) {
    if (t.bye) return t.a;
    if (!t.a || !t.b) return null;
    if (manual(t)) return t.man;
    if (!completo(t)) return null;
    const [A, B] = agregado(t); if (A !== B) return A > B ? t.a : t.b;
    if (golForaDecide(t)) { const [ga, gb] = golsFora(t); return ga > gb ? t.a : t.b; }
    if (regra(t) === "neutro") { if (!neutroFeito(t)) return null; if (t.n[0] !== t.n[1]) return t.n[0] > t.n[1] ? t.a : t.b; }
    return decide(t.pen) ? (t.pen[0] > t.pen[1] ? t.a : t.b) : null;
  }

  function pendencia(t) {               // o que falta para decidir um empate no agregado
    if (t.bye || !t.a || !t.b || manual(t) || !completo(t)) return null;
    const [A, B] = agregado(t); if (A !== B || golForaDecide(t)) return null;
    if (regra(t) === "neutro") { if (!neutroFeito(t)) return "neutro"; if (t.n[0] !== t.n[1]) return null; }
    return "penaltis";
  }

  function decididoPor(t) {
    if (!vencedor(t)) return null;
    if (t.bye) return "folga";
    if (manual(t)) return "manual";
    const [A, B] = agregado(t); if (A !== B) return "placar";
    if (golForaDecide(t)) return "golfora";
    return regra(t) === "neutro" && t.n[0] !== t.n[1] ? "neutro" : "penaltis";
  }

  const regraDesempate = f => {
    const dp = f.desempate || "penaltis";
    if (!["penaltis", "neutro", "golfora"].includes(dp)) throw new Error(`Matamata: desempate desconhecido (${dp}).`);
    if (f.idaEm != null && f.idaEm !== "a" && f.idaEm !== "b") throw new Error(`Matamata: idaEm deve ser "a" ou "b" (${f.idaEm}).`);
    return dp;
  };
  // campos que dependem das regras e que todo confronto recebe na criação
  const extras = (f, dp) => ({ ...(dp !== "penaltis" ? { desempate: dp } : {}), ...(dp === "neutro" ? { n: [null, null] } : {}), ...(f.idaEm === "a" ? { idaEm: "a" } : {}) });
  const confronto = (a, b, pernas, f, dp) => ({ a, b, bye: false, l: Array.from({ length: pernas }, () => [null, null]), pen: null, ...extras(f, dp) });

  function criar(times, regras) {
    const sd = [...times], K = sd.length, f = regras || {}, dp = regraDesempate(f);
    if (K < 2) throw new Error("Matamata.criar: informe pelo menos 2 times.");
    const m = Math.ceil(Math.log2(K)), N = 2 ** m, r = [];
    let o = [1]; while (o.length < N) o = o.flatMap(s => [s, o.length * 2 + 1 - s]);   // chave padrão: 1 x último, melhores nunca se cruzam cedo
    const at = s => sd[s - 1] || null;
    for (let ri = 0, n = N / 2; ri < m; ri++, n /= 2) {
      const pernas = (ri === m - 1 ? f.final : f.pernas) || 1;
      r.push(Array.from({ length: n }, (_, i) => ({ ...confronto(ri ? null : at(o[2 * i]), ri ? null : at(o[2 * i + 1]), pernas, f, dp), bye: ri === 0 && !at(o[2 * i + 1]) })));
    }
    return { sd, r };
  }

  // Chave a partir de um chaveamento já sorteado: prelim = times da fase preliminar (dois a dois) e slots = anel principal,
  // com null nas posições que esperam o vencedor de um jogo da preliminar (o k-ésimo null recebe o vencedor do k-ésimo jogo).
  // Sem preliminar (prelim = []), o anel principal começa a chave. É o formato que o Sorteio.sortear devolve.
  function criarDeSlots(prelim, slots, regras) {
    const f = regras || {}, dp = regraDesempate(f), B = slots.length, m = prelim.length / 2;
    if (B < 2 || (B & (B - 1)) || !Number.isInteger(m) || m !== slots.filter(x => x == null).length)
      throw new Error("Matamata.criarDeSlots: o anel principal precisa ter 2, 4, 8… posições e uma vaga vazia para cada jogo da preliminar.");
    const total = Math.log2(B) + (m > 0 ? 1 : 0), r = [], pernasDe = ri => (ri === total - 1 ? f.final : f.pernas) || 1;
    let ri = 0;
    if (m > 0) { r.push(Array.from({ length: m }, (_, i) => confronto(prelim[2 * i], prelim[2 * i + 1], pernasDe(0), f, dp))); ri = 1; }
    let k = 0;
    r.push(Array.from({ length: B / 2 }, (_, p) => {
      const de = {}, lado = (j, s) => { if (slots[j] != null) return slots[j]; de[s] = k++; return null; };
      const a = lado(2 * p, "a"), b = lado(2 * p + 1, "b"), t = confronto(a, b, pernasDe(ri), f, dp);
      return m > 0 ? { ...t, de } : t;          // com preliminar, todo confronto do anel principal declara de onde vêm os lados (de pode estar vazio)
    }));
    for (let n = B / 4; n >= 1; n /= 2) { ri++; r.push(Array.from({ length: n }, () => confronto(null, null, pernasDe(ri), f, dp))); }
    return { sd: [...prelim, ...slots.filter(x => x != null)], r };
  }

  function propagar(chave) {            // confronto cujos times mudaram perde o placar
    chave.r.forEach((rd, ri) => ri && rd.forEach((t, i) => {
      const ant = chave.r[ri - 1], de = t.de;
      const a = de ? (de.a != null ? vencedor(ant[de.a]) : t.a) : vencedor(ant[2 * i]);
      const c = de ? (de.b != null ? vencedor(ant[de.b]) : t.b) : vencedor(ant[2 * i + 1]);
      if (t.a !== a || t.b !== c) { t.a = a; t.b = c; t.l = t.l.map(() => [null, null]); t.pen = null; if (t.n) t.n = [null, null]; delete t.man; }
    }));
  }

  function sincronizar(chave, times, regras) {
    if (!chave || chave.sd.join() !== times.join()) chave = criar(times, regras);
    propagar(chave);
    return chave;
  }

  function ordem(chave) {               // campeão, vice, semifinalistas… (cada fase pelo cabeça de chave)
    if (!chave) return null;
    const camp = vencedor(chave.r[chave.r.length - 1][0]); if (!camp) return null;
    const out = [camp], pos = id => chave.sd.indexOf(id);
    for (let ri = chave.r.length - 1; ri >= 0; ri--)
      out.push(...chave.r[ri].filter(t => !t.bye).map(t => vencedor(t) === t.a ? t.b : t.a).filter(Boolean).sort((x, y) => pos(x) - pos(y)));
    return out;
  }

  function nomeRodada(chave, i) {
    const t = 2 ** (chave.r.length - i);
    return t === 2 ? "Final" : t === 4 ? "Semifinal" : t === 8 ? "Quartas de final" : t === 16 ? "Oitavas de final" : `Fase de ${t}`;
  }

  const proximaRodada = chave => chave.r.findIndex(r => r.some(t => !t.bye && !vencedor(t)));

  function jogar(t, o) {
    if (t.bye || !t.a || !t.b || manual(t)) return;
    if (!o || typeof o.gols !== "function") throw new Error("Matamata.jogar: informe opcoes.gols(mandante, visitante) -> [gols do mandante, gols do visitante].");
    t.l.forEach((l, i) => {              // l[0] = gols de a, l[1] = gols de b; só sorteia o lado que ainda está vazio
      if (l[0] != null && l[1] != null) return;
      const aCasa = casaDaPerna(t, i) === "a", [gc, gf] = o.gols(aCasa ? t.a : t.b, aCasa ? t.b : t.a);
      if (l[0] == null) l[0] = aCasa ? gc : gf;
      if (l[1] == null) l[1] = aCasa ? gf : gc;
    });
    let pend = pendencia(t);
    if (pend === "neutro") {             // jogo extra em campo neutro, só se o agregado empatou
      if (!t.n) t.n = [null, null];
      const [ga, gb] = (o.golsNeutro || o.gols)(t.a, t.b);
      if (t.n[0] == null) t.n[0] = ga;
      if (t.n[1] == null) t.n[1] = gb;
      pend = pendencia(t);
    }
    if (pend === "penaltis" && !decide(t.pen))
      t.pen = o.penaltis ? o.penaltis(t) : (Math.random() < 0.5 ? [5, 4] : [4, 5]);
  }

  function jogarRodada(chave, i, o) { chave.r[i].forEach(t => jogar(t, o)); propagar(chave); }

  function simular(chave, o) {
    for (let ri = 0; ri < chave.r.length; ri++) { propagar(chave); chave.r[ri].forEach(t => jogar(t, o)); }
    propagar(chave);
  }

  return { criar, criarDeSlots, sincronizar, propagar, vencedor, pendencia, decididoPor, agregado, casaDaPerna, ordem, nomeRodada, proximaRodada, jogar, jogarRodada, simular };
})();

if (typeof module !== "undefined" && module.exports) module.exports = Matamata;   // só para testes em Node
