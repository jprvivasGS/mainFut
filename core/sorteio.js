// Sorteio do chaveamento – core/sorteio.js
// Script comum, como o rng.js, o sim.js, o regras.js e o matamata.js: <script src="../core/sorteio.js"></script> antes do script da página.
// Não depende de DOM, de outros módulos nem de variáveis da página. São funções puras: o mesmo resultado para a mesma
// entrada e a mesma semente, e nada do que entra é alterado. Tudo fica no objeto global Sorteio.
//
//   Sorteio.sortear(modo, times, { semente, potes }) -> { prelim, slots }   o sorteio completo, pronto para a Copa
//   Sorteio.estrutura(n)                -> { n, B, m, byes }               B = maior potência de 2 ≤ n; m = jogos da preliminar; byes = vagas diretas
//   Sorteio.ordemAleatoria(ids, semente)            -> ids embaralhados
//   Sorteio.ordemBase(times)                        -> ids na ordem em que os times foram dados (a ordem da base)
//   Sorteio.ordemSeparada(times, semente, chave)    -> ids com os times de mesmo estado espalhados (chave padrão: t => t.uf)
//   Sorteio.ordemPotes(times, { por, potes, semente }) -> ids intercalados por potes; por = "regiao" ou "forca"
//   Sorteio.montar(ordem, { diretos })              -> { prelim, slots } a partir de uma ordem; diretos = ids que ganham as vagas diretas
//   Sorteio.gerador(semente)                        -> { prox(), rnd(n), embaralhar(lista) }  mesma sequência do RNG.semear(semente)
//
// modo: "aleatorio" | "separar" | "base" | "potes-regiao" | "potes-forca"
// times: lista de { id, uf, regiao, forca } (só o que cada modo usa). Em "base" vale a ordem da lista.
// semente: inteiro; é obrigatória em todos os modos, menos "base". potes: número de potes em "potes-forca" (padrão 2).
//
// A ordem devolvida é a ordem das posições do chaveamento: quem está ao lado se enfrenta primeiro, e os vencedores de
// posições vizinhas se enfrentam depois. Por isso:
//   "separar"       espalha os times da mesma chave (estado) ao longo da lista, para só se encontrarem nas fases finais;
//   "potes-regiao"  cada região é um pote e a lista intercala os potes: o primeiro jogo é entre regiões diferentes (sempre
//                   que a distribuição permitir);
//   "potes-forca"   os times são divididos em potes por força (o pote 1 tem os mais fortes) e a lista intercala os potes:
//                   com 2 potes, cada jogo da 1ª fase é um forte contra um fraco. Quando há vagas diretas (número de
//                   times que não é potência de 2), elas vão para os times mais fortes.
// Montar: as vagas diretas são distribuídas de forma uniforme pelo anel principal; as outras posições esperam o vencedor
// de um jogo da fase preliminar, formado por dois times consecutivos da ordem.
const Sorteio = (() => {
  function gerador(semente) {            // mulberry32, o mesmo algoritmo do rng.js: gerador(7) dá a sequência de RNG.semear(7)
    const n = Number(semente);
    if (semente == null || !Number.isFinite(n)) throw new Error("Sorteio: informe a semente (um número inteiro).");
    let estado = (n >>> 0) | 0;
    const prox = () => {
      estado = (estado + 0x6D2B79F5) | 0;
      let t = Math.imul(estado ^ (estado >>> 15), 1 | estado);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const rnd = k => Math.floor(prox() * k);
    const embaralhar = lista => { const b = [...lista]; for (let i = b.length - 1; i > 0; i--) { const j = rnd(i + 1); [b[i], b[j]] = [b[j], b[i]]; } return b; };
    return { prox, rnd, embaralhar };
  }

  function estrutura(n) {
    let B = 2; while (B * 2 <= n) B *= 2;
    return { n, B, m: n - B, byes: 2 * B - n };
  }

  const ordemBase = times => times.map(t => t.id);
  const ordemAleatoria = (ids, semente) => gerador(semente).embaralhar(ids);

  function ordemSeparada(times, semente, chave) {
    const por = chave || (t => t.uf), g = gerador(semente), chaveDe = new Map(times.map(t => [t.id, por(t)]));
    const grupos = new Map(), pos = [];
    g.embaralhar(times.map(t => t.id)).forEach(id => { const k = chaveDe.get(id); if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(id); });
    grupos.forEach(l => l.forEach((id, i) => pos.push([(i + g.prox()) / l.length, id])));   // cada grupo ocupa a lista toda, em faixas
    return pos.sort((a, b) => a[0] - b[0]).map(x => x[1]);
  }

  function intercalar(potes) {           // 1º de cada pote, 2º de cada pote… (vizinhos vêm de potes diferentes)
    const out = [];
    for (let i = 0; potes.some(p => i < p.length); i++) potes.forEach(p => { if (i < p.length) out.push(p[i]); });
    return out;
  }

  function potesRegiao(times, g) {
    const grupos = new Map();
    g.embaralhar(times).forEach(t => { const k = t.regiao ?? ""; if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(t.id); });
    const potes = [...grupos.entries()].sort((a, b) => b[1].length - a[1].length || String(a[0]).localeCompare(String(b[0]))).map(x => x[1]);
    return { ordem: intercalar(potes) };
  }

  function potesForca(times, g, quantos) {
    const P = Math.floor(quantos);
    if (!(P >= 2) || P > times.length) throw new Error(`Sorteio: o número de potes (${quantos}) deve ficar entre 2 e ${times.length}.`);
    const ranking = g.embaralhar(times).sort((a, b) => (b.forca || 0) - (a.forca || 0)).map(t => t.id);   // empates de força: ordem sorteada
    const tam = Math.ceil(ranking.length / P), potes = [];
    for (let i = 0; i < ranking.length; i += tam) potes.push(g.embaralhar(ranking.slice(i, i + tam)));
    return { ordem: intercalar(potes), ranking };
  }

  function ordemPotes(times, o) {
    const op = o || {}, g = gerador(op.semente);
    if (op.por === "regiao") return potesRegiao(times, g).ordem;
    if (op.por === "forca") return potesForca(times, g, op.potes ?? 2).ordem;
    throw new Error('Sorteio.ordemPotes: informe por: "regiao" ou "forca".');
  }

  function montar(ordem, o) {
    const { B, m, byes } = estrutura(ordem.length);
    if (m === 0) return { prelim: [], slots: [...ordem] };
    const diretos = ((o && o.diretos) || []).filter(id => ordem.includes(id)).slice(0, byes), usado = new Set(diretos);
    const resto = ordem.filter(id => !usado.has(id));
    const direto = new Set(Array.from({ length: byes }, (_, k) => Math.floor((k + 0.5) * B / byes)));   // posições uniformes do anel principal
    const prelim = [], slots = []; let k = 0, d = 0;
    for (let j = 0; j < B; j++) {
      if (direto.has(j)) slots.push(d < diretos.length ? diretos[d++] : resto[k++]);
      else { slots.push(null); prelim.push(resto[k++], resto[k++]); }
    }
    return { prelim, slots };
  }

  function sortear(modo, times, o) {
    const op = o || {};
    if (!Array.isArray(times) || times.length < 2) throw new Error("Sorteio: informe pelo menos 2 times.");
    if (modo === "base") return montar(ordemBase(times));
    const g = gerador(op.semente);       // uma semente, uma sequência: o resultado só depende dela
    if (modo === "aleatorio") return montar(g.embaralhar(times.map(t => t.id)));
    if (modo === "separar") return montar(ordemSeparada(times, op.semente));
    if (modo === "potes-regiao") return montar(potesRegiao(times, g).ordem);
    if (modo === "potes-forca") {
      const { ordem, ranking } = potesForca(times, g, op.potes ?? 2), { m, byes } = estrutura(times.length);
      return montar(ordem, { diretos: m > 0 ? g.embaralhar(ranking.slice(0, byes)) : [] });   // vagas diretas: os mais fortes
    }
    throw new Error(`Sorteio: modo desconhecido (${modo}).`);
  }

  return { gerador, estrutura, ordemBase, ordemAleatoria, ordemSeparada, ordemPotes, montar, sortear };
})();

if (typeof module !== "undefined" && module.exports) module.exports = Sorteio;   // só para testes em Node
