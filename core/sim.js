// Simulação de partidas e evolução de força – core/sim.js
// Script comum, como o rng.js: carregue <script src="../core/rng.js"></script> e depois <script src="../core/sim.js"></script>.
// Tudo fica no objeto global Sim. Os sorteios usam o RNG com semente (ou o gerador passado em opcoes.rng).
//
//   Sim.golsPartida(forcaCasa, forcaFora, opcoes)  -> [golsCasa, golsFora]
//   Sim.probabilidades(forcaCasa, forcaFora, opcoes) -> { casa, empate, fora }  (exato, sem sorteio)
//   Sim.medias(forcaCasa, forcaFora, opcoes)         -> { casa, fora }  (gols esperados de cada lado)
//   Sim.evoluirForca(forca, movimento, opcoes)       -> nova força (entre temporadas)
//
// Modelo: cada time faz gols segundo uma Poisson. A força entra só pela razão r = forcaCasa / forcaFora
// (80 x 40 dá o mesmo resultado que 800 x 400):
//   média da casa = media * mando * r^expoente        média do visitante = media / r^expoente
// Com forças iguais: o visitante faz `media` gols e a casa faz `media * mando`.
const Sim = (() => {
  const LIMITES = { min: 1, max: 1000 };            // escala das forças
  const PADRAO = {
    media: 1.25,                                     // gols por time, com forças iguais e sem mando
    mando: 1.1,                                      // multiplicador de gols de quem joga em casa
    expoente: 0.5,                                   // 0 = força não importa; 1 = gols proporcionais à razão das forças
    minGols: 0.1, maxGols: 6,                        // trava das médias, para forças extremas (1 x 1000) não darem 40 gols
    sobe: 0.05, desce: 0.05                          // evolução entre temporadas (fração da força)
  };
  const cfg = o => ({ ...PADRAO, ...(o || {}) });
  const trava = (x, a, b) => Math.min(Math.max(x, a), b);
  const forca = f => trava(Number.isFinite(+f) ? +f : LIMITES.min, LIMITES.min, LIMITES.max);

  function medias(fc, ff, opcoes) {
    const o = cfg(opcoes), r = forca(fc) / forca(ff), k = r ** o.expoente;
    return { casa: trava(o.media * o.mando * k, o.minGols, o.maxGols), fora: trava(o.media / k, o.minGols, o.maxGols) };
  }

  function poisson(lambda, rng) {                    // Knuth: multiplica sorteios até cair abaixo de e^-λ
    const L = Math.exp(-lambda); let k = 0, p = 1;
    do { k++; p *= rng.prox(); } while (p > L);
    return k - 1;
  }
  function gerador(o) {
    const g = o.rng || (typeof RNG !== "undefined" ? RNG : null);
    if (!g) throw new Error("Sim: carregue ../core/rng.js antes do sim.js (ou passe opcoes.rng).");
    return g;
  }
  function golsPartida(fc, ff, opcoes) {
    const o = cfg(opcoes), m = medias(fc, ff, o), g = gerador(o);
    return [poisson(m.casa, g), poisson(m.fora, g)];
  }

  function pmf(lambda, n) {                          // P(0..n-1 gols)
    const p = [Math.exp(-lambda)];
    for (let k = 1; k < n; k++) p.push(p[k - 1] * lambda / k);
    return p;
  }
  function probabilidades(fc, ff, opcoes) {
    const m = medias(fc, ff, opcoes), N = 40, a = pmf(m.casa, N), b = pmf(m.fora, N);
    let casa = 0, empate = 0, fora = 0;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const p = a[i] * b[j];
      if (i > j) casa += p; else if (i === j) empate += p; else fora += p;
    }
    const t = casa + empate + fora;                  // t ≈ 1 (a cauda além de 39 gols é desprezível)
    return { casa: casa / t, empate: empate / t, fora: fora / t };
  }

  // movimento: "sobe" (subiu de divisão), "desce" (caiu) ou "fica". Aceita também +1 / -1 / 0.
  function evoluirForca(f, movimento, opcoes) {
    const o = cfg(opcoes), mv = movimento === "sobe" || movimento > 0 ? 1 : movimento === "desce" || movimento < 0 ? -1 : 0;
    const nova = forca(f) * (mv > 0 ? 1 + o.sobe : mv < 0 ? 1 - o.desce : 1);
    return Math.round(trava(nova, LIMITES.min, LIMITES.max) * 100) / 100;
  }

  return { golsPartida, probabilidades, medias, evoluirForca, LIMITES, PADRAO };
})();

if (typeof module !== "undefined" && module.exports) module.exports = Sim;   // só para testes em Node
