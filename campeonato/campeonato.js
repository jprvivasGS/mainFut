/* Campeonato Nacional – mainFut
   Fluxo: questionário → temporada (rodadas + tabela) → encerrar (acesso/descenso) → próxima temporada.
   Rodadas, tabela e critérios de desempate vêm de ../core/regras.js. */
const RAIZ = "../";                     // times.json e imagens ficam na pasta do hub
const REG = { norte: "Norte", nordeste: "Nordeste", centro_oeste: "Centro-Oeste", sudeste: "Sudeste", sul: "Sul" };
const LETRAS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const LOCAL = "mainfut:campeonato:save";
const $ = id => document.getElementById(id);
const h = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const semModulo = [typeof RNG === "undefined" && "rng", typeof Sim === "undefined" && "sim", typeof Regras === "undefined" && "regras"].filter(Boolean);
if (semModulo.length) {                  // sem os módulos a página ficaria parada em "Carregando times…"
  $("app").innerHTML = `<p class="erros">Não carreguei ${semModulo.map(m => `../core/${m}.js`).join(" e ")}. Confira se o index.html tem as tags ${semModulo.map(m => `<code>&lt;script src="../core/${m}.js"&gt;&lt;/script&gt;</code>`).join(" ")} antes do campeonato.js (na ordem rng.js, sim.js, regras.js) e se os arquivos foram publicados em /mainFut/core/.</p>`;
  throw new Error("Módulo não carregado: " + semModulo.join(", "));
}
const rnd = RNG.rnd, embaralhar = RNG.embaralhar;   // sorteios vêm de ../core/rng.js (com semente, gravada no save)
const sigla = t => t.sigla || t.nome.slice(0, 3).toUpperCase();
const sem = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

let TIMES = [], T = new Map();          // base de times e busca por id
let S = null;                            // competição em andamento (null = ainda no questionário)
let Q = null;                            // respostas do questionário
let ui = { aba: "temporada", div: 0, rodada: 1 };

/* ---------- Utilidades de tela ---------- */
function esc(t) {                        // escudo; sem imagem, mostra a sigla
  if (!t.escudo) return `<span class="esc"><b>${h(sigla(t))}</b></span>`;
  return `<span class="esc"><img src="${RAIZ}${h(t.escudo)}" alt="" data-s="${h(sigla(t))}" onerror="this.replaceWith(Object.assign(document.createElement('b'),{textContent:this.dataset.s}))"></span>`;
}
let tAviso;
function aviso(txt, erro) {
  const a = $("aviso");
  a.textContent = txt; a.className = "aviso on" + (erro ? " erro" : "");
  clearTimeout(tAviso); tAviso = setTimeout(() => a.className = "aviso", 4500);
}
function logo() {                        // tenta os endereços possíveis do logo
  const img = $("logo"), alvos = ["logo.png", "../campenato/logo.png", "../campeonato/logo.png"]; let i = 0;
  img.onerror = () => { if (++i < alvos.length) img.src = alvos[i]; else img.remove(); };
  img.src = alvos[0];
}

/* ---------- Rodadas (método do círculo) ---------- */
const gerarRodadas = Regras.gerarRodadas;   // ../core/regras.js
const FM = d => S.cfg.fmt[d];            // formato da divisão: {g grupos, tn turnos, po mata-mata, k classificados, p vagas via mata-mata, pl jogos/confronto, fl jogos da final}
const grupos = d => { const n = S.divs[d].length / FM(d).g; return Array.from({ length: FM(d).g }, (_, g) => S.divs[d].slice(g * n, (g + 1) * n)); };
const montarFix = () => {
  S.fix = S.divs.map((_, d) => {
    const gs = grupos(d).map((ids, g) => gerarRodadas(ids, FM(d).tn).map(r => r.map(m => ({ ...m, g }))));
    return gs[0].map((_, r) => gs.flatMap(x => x[r]));      // a rodada n junta os jogos de todos os grupos
  });
  S.po = S.divs.map(() => null);
};
/* Placares vêm de ../core/sim.js (Poisson): a força de cada time pesa nos gols e o mandante leva uma pequena vantagem. */
const forca = id => S.forcas[id] ?? T.get(id)?.forca ?? 500;   // força atual: a da base ou a evoluída entre temporadas (vai no save)
const modoPartida = () => S.cfg.modo === "forca" ? "forca" : "equilibrada";   // regra da competição (S.cfg.modo)
const golsJogo = (casa, fora) => modoPartida() === "forca"
  ? Sim.golsPartida(forca(casa), forca(fora))   // por força: a força de cada time pesa nos gols
  : Sim.golsPartida(1, 1);                      // equilibrada: forças iguais, só o mando de campo pesa. Retorna [gols da casa, gols do visitante]
function simular(d, rodada) {            // preenche só o que ainda não tem placar
  (rodada ? [S.fix[d][rodada - 1]] : S.fix[d]).forEach(r => r.forEach(m => {
    if (m.ac == null) Object.assign(m, Regras.cartoes());   // cartões da partida (para os desempates)
    if (m.gc != null && m.gf != null) return;
    const [gc, gf] = golsJogo(m.c, m.f);
    if (m.gc == null) m.gc = gc;         // mantém o lado que a pessoa já digitou
    if (m.gf == null) m.gf = gf;
  }));
  if (!rodada) poSim(d);                 // simular a série inclui o mata-mata
}
const ligaOk = d => S.fix[d].every(r => r.every(m => m.gc != null && m.gf != null));
const completa = d => ligaOk(d) && (!FM(d).po || !!poOrdem(d));
const completaTudo = () => S.divs.every((_, d) => completa(d));

/* ---------- Tabela ---------- */
// O cálculo e os desempates ficam em ../core/regras.js; aqui só se monta a entrada. Critérios e semente do sorteio vêm do save.
const nomeTime = id => T.get(id)?.nome ?? String(id);
const opcRegras = () => ({ pv: S.cfg.pv, pe: S.cfg.pe, deducoes: S.deducoes, criterios: S.cfg.desempates, semente: S.sorteio, nome: nomeTime });
function tabela(d, g = 0) {
  const jogos = S.fix[d].flat().filter(m => m.g === g);
  return Regras.tabela(grupos(d)[g], jogos, opcRegras()).map(x => ({ ...x, t: T.get(x.id) }));
}

/* ---------- Classificação geral, mata-mata e ranking final ---------- */
const pp = d => d === 0 ? 1 : FM(d).g > 1 ? S.cfg.acc[d - 1] : FM(d).p;            // vagas de acesso decididas no mata-mata
const nDir = d => d > 0 && FM(d).po && FM(d).g === 1 ? S.cfg.acc[d - 1] - pp(d) : 0; // sobem direto pela tabela
const nK = d => FM(d).g === 1 ? FM(d).k : FM(d).k * FM(d).g;                         // classificados ao mata-mata
function base(d) {                       // tabela geral: 1 grupo = a própria tabela; vários = posição no grupo, depois pontos e os desempates da competição (sem confronto direto)
  if (FM(d).g === 1) return tabela(d, 0);
  const cmp = Regras.comparador(S.cfg.desempates, S.sorteio, nomeTime);
  return grupos(d).flatMap((_, g) => tabela(d, g).map((x, i) => ({ ...x, pos: i })))
    .sort((a, b) => a.pos - b.pos || b.P - a.P || cmp(a, b));
}
function qualificados(d) {               // ids na ordem de cabeça de chave
  const f = FM(d); if (!f.po) return [];
  return (f.g === 1 ? base(d).slice(nDir(d), nDir(d) + f.k) : base(d).filter(x => x.pos < f.k)).map(x => x.t.id);
}
const agg = t => [t.l.reduce((s, x) => s + x[0], 0), t.l.reduce((s, x) => s + x[1], 0)];
function poVenc(t) {
  if (t.bye) return t.a;
  if (!t.a || !t.b || t.l.some(x => x[0] == null || x[1] == null)) return null;
  const [A, B] = agg(t); if (A !== B) return A > B ? t.a : t.b;
  const p = t.pen; return p && p[0] != null && p[1] != null && p[0] !== p[1] ? (p[0] > p[1] ? t.a : t.b) : null;
}
function poCriar(sd, f) {
  const K = sd.length, m = Math.ceil(Math.log2(K)), N = 2 ** m, r = [];
  let o = [1]; while (o.length < N) o = o.flatMap(s => [s, o.length * 2 + 1 - s]);   // chave padrão: 1 x último, melhores nunca se cruzam cedo
  const at = s => sd[s - 1] || null;
  for (let ri = 0, n = N / 2; ri < m; ri++, n /= 2) {
    const legs = (ri === m - 1 ? f.fl : f.pl) || 1;
    r.push(Array.from({ length: n }, (_, i) => ({ a: ri ? null : at(o[2 * i]), b: ri ? null : at(o[2 * i + 1]), bye: ri === 0 && !at(o[2 * i + 1]),
      l: Array.from({ length: legs }, () => [null, null]), pen: null })));
  }
  return { sd, r };
}
function poSync(d) {                     // cria a chave quando a fase de pontos termina e repassa os vencedores
  const f = FM(d); if (!f.po || !ligaOk(d)) { S.po[d] = null; return; }
  const sd = qualificados(d); let b = S.po[d];
  if (!b || b.sd.join() !== sd.join()) b = S.po[d] = poCriar(sd, f);
  b.r.forEach((rd, ri) => ri && rd.forEach((t, i) => {
    const a = poVenc(b.r[ri - 1][2 * i]), c = poVenc(b.r[ri - 1][2 * i + 1]);
    if (t.a !== a || t.b !== c) { t.a = a; t.b = c; t.l = t.l.map(() => [null, null]); t.pen = null; }
  }));
}
function poOrdem(d) {                    // campeão, vice, semifinalistas… (null enquanto não termina)
  poSync(d); const b = S.po[d]; if (!b) return null;
  const camp = poVenc(b.r[b.r.length - 1][0]); if (!camp) return null;
  const out = [camp], pos = id => b.sd.indexOf(id);
  for (let ri = b.r.length - 1; ri >= 0; ri--) out.push(...b.r[ri].filter(t => !t.bye).map(t => poVenc(t) === t.a ? t.b : t.a).filter(Boolean).sort((x, y) => pos(x) - pos(y)));
  return out;
}
function poJogar(t) {
  if (t.bye || !t.a || !t.b) return;
  t.l.forEach((l, i) => {                // l[0] = gols do time a, l[1] = gols do time b; na ida de dois jogos o b é o mandante
    if (l[0] != null && l[1] != null) return;
    const aCasa = !(t.l.length === 2 && i === 0), [gc, gf] = golsJogo(aCasa ? t.a : t.b, aCasa ? t.b : t.a);
    if (l[0] == null) l[0] = aCasa ? gc : gf;
    if (l[1] == null) l[1] = aCasa ? gf : gc;
  });
  const [A, B] = agg(t), p = t.pen;
  if (A === B && !(p && p[0] != null && p[1] != null && p[0] !== p[1])) t.pen = rnd(2) ? [5, 4] : [4, 5];
}
function poSim(d) {
  for (let ri = 0; ; ri++) { poSync(d); const b = S.po[d]; if (!b || ri >= b.r.length) return; b.r[ri].forEach(poJogar); }
}
function poFase(d) {
  poSync(d); const b = S.po[d];
  if (!b) { aviso("Termine a fase de pontos antes.", true); return false; }
  const ri = b.r.findIndex(r => r.some(t => !t.bye && !poVenc(t)));
  if (ri < 0) { aviso("O mata-mata já terminou.", true); return false; }
  b.r[ri].forEach(poJogar); poSync(d); return true;
}
function ranking(d) {                    // ordem final: sobe direto, resultado do mata-mata, resto da tabela
  const B = base(d).map(x => x.t.id); if (!FM(d).po) return B;
  const dr = B.slice(0, nDir(d)), Qs = qualificados(d), usados = new Set([...dr, ...Qs]);
  return [...dr, ...(poOrdem(d) || Qs), ...B.filter(id => !usados.has(id))];
}
function zonas(d) {
  const f = FM(d), B = base(d).map(x => x.t.id), a = S.cfg.acc, Qs = new Set(qualificados(d)), z = new Map();
  const sobe = d > 0 ? a[d - 1] : 0, desce = d < S.divs.length - 1 ? a[d] : 0, dir = f.po ? nDir(d) : sobe;
  B.forEach((id, i) => z.set(id, d === 0 && !f.po && i === 0 ? "top" : i < dir ? "up" : Qs.has(id) ? "po" : desce && i >= B.length - desce ? "down" : ""));
  return z;
}

/* ---------- Vagas internacionais (recalculadas a cada mudança) ---------- */
function classificar() {
  const comps = S.cfg.comps || [];
  if (!comps.length) return null;
  const rank = ranking(0), ja = new Map(), lista = comps.map(() => []);
  let ini = 0;                           // posições já "reservadas" pelas competições anteriores
  comps.forEach((c, ci) => {
    let vagas = c.vagas;
    S.ext.filter(x => x.comp === ci && T.has(x.id)).forEach(x => {
      if (ja.has(x.id)) { vagas++; return; }                           // já tem vaga melhor: esta passa para o próximo da fila
      const q = { c: ci, id: x.id, tipo: "externa", motivo: x.motivo };
      ja.set(x.id, q); lista[ci].push(q);
    });
    rank.forEach((id, i) => {            // o time externo não ocupa vaga da tabela, então o próximo colocado herda
      if (vagas <= 0 || ja.has(id)) return;
      const q = { c: ci, id, tipo: "liga", pos: i + 1, herdou: i + 1 > ini + c.vagas };
      ja.set(id, q); lista[ci].push(q); vagas--;
    });
    lista[ci].sort((a, b) => (a.tipo === "externa") - (b.tipo === "externa") || (a.pos || 0) - (b.pos || 0));
    ini += c.vagas;
  });
  return { comps: lista, por: ja };
}

/* ---------- Fim de temporada: acesso e descenso ---------- */
function encerrar() {
  const K = classificar(), ids = S.divs.map((_, d) => ranking(d)), pts = S.divs.map((_, d) => new Map(base(d).map(x => [x.t.id, x.P]))), n = S.cfg.acc;
  const reg = {
    ano: S.ano,
    classif: K ? K.comps.map(l => l.map(q => [q.id, q.tipo])) : [],
    divs: ids.map((l, d) => l.map(id => [id, pts[d].get(id)])),
    sobem: n.map((q, k) => ids[k + 1].slice(0, q)),                     // topo da divisão k+1 sobe
    descem: n.map((q, k) => ids[k].slice(ids[k].length - q))            // fim da divisão k desce
  };
  S.historico.push(reg);
  S.divs = ids.map((l, d) => {
    const sobe = d > 0 ? n[d - 1] : 0, desce = d < ids.length - 1 ? n[d] : 0;
    return embaralhar([...l.slice(sobe, l.length - desce), ...(d > 0 ? reg.descem[d - 1] : []), ...(d < ids.length - 1 ? reg.sobem[d] : [])]);
  });
  reg.sobem.flat().forEach(id => S.forcas[id] = Sim.evoluirForca(forca(id), "sobe"));    // quem subiu ganha um pouco de força
  reg.descem.flat().forEach(id => S.forcas[id] = Sim.evoluirForca(forca(id), "desce"));  // quem caiu perde um pouco (limite 1 a 1000)
  S.ano++; S.sorteio = RNG.rnd(2147483648); S.deducoes = []; S.ext = []; montarFix();   // sorteio de desempate novo a cada temporada
}
function simularAnos() {
  const k = Math.min(Math.max(parseInt($("nAnos").value) || 1, 1), 100);
  for (let i = 0; i < k; i++) { S.divs.forEach((_, d) => simular(d)); encerrar(); }
  ui.rodada = 1; salvarLocal(); desenhar();
  aviso(k > 1 ? `${k} temporadas simuladas. Veja o histórico.` : "1 temporada simulada. Veja o histórico.");
}

/* ---------- Save ---------- */
function paraJSON() {                    // só os placares: as rodadas são refeitas a partir da ordem dos times
  return { versao: 2, po: S.po, ano: S.ano, cfg: S.cfg, divs: S.divs, deducoes: S.deducoes, ext: S.ext, historico: S.historico,
    placar: S.fix.map(rs => rs.flatMap(r => r.map(m => (m.gc == null || m.gf == null) ? null : m.ac == null ? [m.gc, m.gf] : [m.gc, m.gf, m.ac, m.af, m.vc, m.vf]))),   // gols e, se houver, cartões
    forcas: S.forcas, sorteio: S.sorteio,                    // só as forças que mudaram desde a base: { id: força }
    rng: RNG.salvar() };                 // { semente, estado }: ao carregar, os sorteios continuam de onde pararam
}
function deJSON(o) {
  if (!o || !Array.isArray(o.divs) || !o.cfg) throw new Error("Arquivo de save inválido.");
  const falta = o.divs.flat().filter(id => !T.has(id));
  if (falta.length) throw new Error("A base não tem mais estes times: " + falta.slice(0, 5).join(", "));
  S = { cfg: o.cfg, ano: o.ano, divs: o.divs, deducoes: o.deducoes || [], ext: o.ext || [], historico: o.historico || [], forcas: o.forcas || {}, sorteio: o.sorteio ?? (o.ano || 1) * 7919 };   // saves antigos: todos na força da base
  S.cfg.comps = S.cfg.comps || [];       // saves antigos não tinham competições
  S.cfg.modo = S.cfg.modo || "forca";    // saves antigos já eram jogados por força
  S.cfg.desempates = Regras.validos(S.cfg.desempates || ["vitorias", "saldo", "golspro"]);   // saves antigos: V > SG > GP, depois ordem alfabética
  S.cfg.fmt = S.cfg.fmt || S.divs.map(() => ({ g: 1, tn: S.cfg.turnos, po: false, k: 4, p: 1, pl: 2, fl: 1 }));
  montarFix();
  S.fix.forEach((rs, d) => rs.flat().forEach((m, i) => { const p = o.placar?.[d]?.[i]; if (p) { m.gc = p[0]; m.gf = p[1]; if (p.length > 2) [m.ac, m.af, m.vc, m.vf] = p.slice(2); } }));
  if (Array.isArray(o.po) && o.po.length === S.divs.length) S.po = o.po;
  RNG.restaurar(o.rng);                  // saves antigos não têm "rng": seguem com a semente da página
  ui = { aba: "temporada", div: 0, rodada: 1 };
}
function salvarLocal() { try { localStorage.setItem(LOCAL, JSON.stringify(paraJSON())); } catch (e) { /* sem armazenamento */ } sincronizarHub(); }

/* ---------- Ponte com o hub (hub-data.js) ---------- */
// Grava no contrato do hub: campeonato:progresso { concluidas, total } e campeonato:campeao { id, nome, uf }.
// concluidas = temporadas encerradas; total = concluidas + a temporada em andamento.
// campeao = campeão da Série A assim que ela termina; antes disso, o da última temporada encerrada.
function sincronizarHub() {
  if (typeof HubData === "undefined" || !S) return;      // sem hub-data.js na página, o campeonato segue normal
  try {
    const feitas = S.historico.length;
    HubData.set("campeonato:progresso", { concluidas: feitas, total: feitas + 1 });
    const id = completa(0) ? ranking(0)[0] : (feitas ? S.historico[feitas - 1].divs[0][0][0] : null), t = id && T.get(id);
    if (t) HubData.set("campeonato:campeao", { id: t.id, nome: t.nome, uf: t.uf });
    else HubData.remove("campeonato:campeao");
  } catch (e) { /* o hub é opcional: nunca atrapalha o save */ }
}
function limparHub() {
  if (typeof HubData === "undefined") return;
  HubData.remove("campeonato:progresso"); HubData.remove("campeonato:campeao");
}
function baixar() {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(paraJSON())], { type: "application/json" }));
  a.download = `campeonato-temporada-${S.ano}.json`;
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  aviso("Save baixado.");
}
function abrirArquivo() {
  const i = document.createElement("input");
  i.type = "file"; i.accept = ".json,application/json";
  i.onchange = () => {
    const f = i.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => { try { deJSON(JSON.parse(r.result)); salvarLocal(); desenhar(); aviso("Save carregado."); } catch (e) { aviso(e.message || "Não consegui ler esse save.", true); } };
    r.readAsText(f);
  };
  i.click();
}

/* ---------- Questionário (adapta-se às respostas) ---------- */
const pool = () => TIMES.filter(t => Q.reg.includes(t.regiao));
function tamPadrao(n, nd) {              // divide igualmente, em números pares; a sobra vai para a última
  const base = Math.max(4, Math.floor(n / nd / 2) * 2), t = Array(nd).fill(base);
  t[nd - 1] += Math.max(0, Math.floor((n - base * nd) / 2) * 2);
  return t;
}
const accPadrao = tam => tam.slice(1).map((t, k) => Math.max(1, Math.min(4, Math.floor(Math.min(t, tam[k]) / 4))));
function qRecalcular() {
  const n = pool().length, max = Math.max(1, Math.floor(n / 4));
  Q.nd = Math.min(Math.max(Q.nd || 1, 1), max);
  Q.tam = tamPadrao(n, Q.nd); Q.acc = accPadrao(Q.tam);
  Q.fmt = Q.tam.map((_, i) => Q.fmt[i] || fmtPadrao());
  const livres = new Set(pool().map(t => t.id));
  Q.alloc = Q.tam.map((t, i) => (Q.alloc[i] || []).filter(id => livres.has(id)).slice(0, t));
  Q.sel.clear();
  let resto = Q.tam[0] || 0;             // as vagas internacionais não podem passar do tamanho da Série A
  Q.comps.forEach(c => { c.vagas = Math.min(c.vagas, resto); resto -= c.vagas; });
}
function qErros() {
  const e = [], n = pool().length, max = Math.floor(n / 4), soma = Q.tam.reduce((a, b) => a + b, 0);
  if (n < 4) e.push("Escolha regiões que somem pelo menos 4 times.");
  if (Q.nd > max) e.push(`Com ${n} times o máximo é ${max} divisões (mínimo de 4 times por divisão).`);
  Q.tam.forEach((t, i) => { if (!(t >= 4) || t % 2) e.push(`Série ${LETRAS[i]}: use um número par de times, a partir de 4.`); });
  if (soma > n) e.push(`As divisões somam ${soma} times, mas só há ${n} disponíveis.`);
  if (Q.pe > Q.pv) e.push("O empate não pode valer mais pontos que a vitória.");
  Q.comps.forEach((c, i) => {
    if (!c.nome.trim()) e.push(`Competição ${i + 1}: informe o nome.`);
    if (!Number.isInteger(c.vagas) || c.vagas < 0) e.push(`${c.nome || "Competição " + (i + 1)}: informe um número de vagas válido.`);
  });
  const pedidas = Q.comps.reduce((a, c) => a + (c.vagas || 0), 0);
  if (pedidas > (Q.tam[0] || 0)) e.push(`As competições pedem ${pedidas} vagas, mas a Série A só tem ${Q.tam[0] || 0} times.`);
  if (Q.dist === "manual") {
    const falta = Q.tam.map((t, i) => [i, (Q.alloc[i] || []).length]).filter(([i, q]) => q !== Q.tam[i]);
    if (falta.length) e.push("Complete as séries: " + falta.slice(0, 4).map(([i, q]) => `Série ${LETRAS[i]} (${q}/${Q.tam[i]})`).join(", ") + (falta.length > 4 ? ` e mais ${falta.length - 4}` : "") + ".");
  }
  Q.acc.forEach((a, k) => { if (!(a >= 0)) e.push(`Acesso entre as séries ${LETRAS[k]} e ${LETRAS[k + 1]}: informe um número válido.`); });
  Q.tam.forEach((t, i) => {              // quem sobe e quem desce na mesma série não pode passar do tamanho dela
    const mov = (i > 0 ? Q.acc[i - 1] : 0) + (i < Q.nd - 1 ? Q.acc[i] : 0);
    if (mov > t) e.push(`Série ${LETRAS[i]}: ${mov} times trocariam de divisão, mais do que o tamanho da série (${t}).`);
  });
  Q.tam.forEach((n, i) => {              // formato de cada divisão
    const f = Q.fmt[i]; if (!f) return; const g = f.g, L = `Série ${LETRAS[i]}`;
    if (!Number.isInteger(g) || g < 1 || n % g || (g > 1 && n / g < 3)) return e.push(`${L}: ${g} grupo(s) não dividem ${n} times em grupos de pelo menos 3.`);
    if (!f.po) return;
    const ac = i > 0 ? Q.acc[i - 1] : 0, desce = i < Q.nd - 1 ? Q.acc[i] : 0, p = i === 0 ? 1 : g > 1 ? ac : f.p, K = g === 1 ? f.k : f.k * g, dir = i > 0 && g === 1 ? ac - p : 0;
    if (!(f.k >= 1) || K < 2 || f.k > n / g) return e.push(`${L} (mata-mata): informe classificados válidos (mínimo 2 no total, no máximo o tamanho do grupo).`);
    if (i > 0 && ac < 1) return e.push(`${L}: sem vagas de acesso, o mata-mata não tem o que decidir.`);
    if (i > 0 && (!(p >= 1) || (p & (p - 1)) || p > ac)) e.push(`${L}: as vagas decididas no mata-mata devem ser 1, 2, 4… e não passar das vagas de acesso (${ac}).`);
    else if (p >= K) e.push(`${L}: o mata-mata precisa de mais classificados do que vagas de acesso.`);
    else if (dir + K + desce > n) e.push(`${L}: acesso direto + mata-mata + rebaixados passam de ${n} times.`);
  });
  return e;
}
function questionario() {
  $("ano").hidden = true;
  if (!Q) { Q = { reg: [...new Set(TIMES.map(t => t.regiao))], nd: 0, tam: [], acc: [], pv: 3, pe: 1, turnos: 2, dist: "sorteio", modo: "equilibrada", crit: Regras.PADRAO.map(id => ({ id, on: true })), alloc: [], sel: new Set(), busca: "", fmt: [],
    comps: [{ nome: "Libertadores", vagas: 4 }, { nome: "Sul-Americana", vagas: 6 }] }; Q.nd = Math.max(1, Math.round(pool().length / 20)); qRecalcular(); }
  const regs = [...new Set(TIMES.map(t => t.regiao))];
  $("app").innerHTML = `<div class="quest">
   <section class="card"><h2><span class="n">1</span>De onde vêm os times</h2>
    <div class="opts">${regs.map(r => `<label class="opt"><input type="checkbox" data-reg="${h(r)}" ${Q.reg.includes(r) ? "checked" : ""}> ${h(REG[r] || r)} <small>(${TIMES.filter(t => t.regiao === r).length})</small></label>`).join("")}</div>
    <p class="dica" id="q-pool"></p></section>
   <section class="card"><h2><span class="n">2</span>Quantas divisões?</h2>
    <div class="campos"><label>Número de divisões<input type="number" id="q-nd" min="1" value="${Q.nd}"></label></div>
    <p class="dica" id="q-max"></p><div class="campos" id="q-tam"></div></section>
   <section class="card" id="q-c3"><h2><span class="n">3</span>Acesso e descenso</h2>
    <p class="dica">O mesmo número sobe da divisão de baixo e desce da de cima, para as duas sempre manterem o tamanho.</p><div class="campos" id="q-acc"></div></section>
   <section class="card"><h2><span class="n">4</span>Competições internacionais</h2>
    <p class="dica">As vagas saem da tabela da Série A, em ordem: a primeira competição fica com os melhores colocados. Na temporada você marca quem ganha vaga por fora e o próximo da fila herda a vaga.</p>
    <div class="campos"><label>Quantas competições<input type="number" id="q-nc" min="0" max="6" value="${Q.comps.length}"></label></div>
    <div class="campos" id="q-comps"></div></section>
   <section class="card"><h2><span class="n">5</span>Regras da tabela</h2><div class="campos">
    <label>Pontos por vitória<input type="number" id="q-pv" min="1" max="5" value="${Q.pv}"></label>
    <label>Pontos por empate<input type="number" id="q-pe" min="0" max="3" value="${Q.pe}"></label>
    <label>Formato<select id="q-tn"><option value="2">Turno e returno</option><option value="1">Turno único</option></select></label>
    <label>Distribuição dos times<select id="q-ds"><option value="sorteio">Sorteio aleatório</option><option value="base">Ordem da base</option><option value="manual">Escolher manualmente</option></select></label>
    <label>Placares das partidas<select id="q-modo"><option value="equilibrada">Equilibrada (força não importa)</option><option value="forca">Por força dos times</option></select></label></div>
    <div id="q-crit"></div></section>
   <section class="card"><h2><span class="n">6</span>Formato de cada divisão</h2>
    <p class="dica">Pontos corridos ou grupos (zonas) e, se quiser, um mata-mata: pelo título ou pelas vagas de acesso. Use um modelo pronto ou ajuste à mão.</p><div id="q-fmt"></div></section>
   <section class="card" id="q-c5" hidden><h2><span class="n">7</span>Monte as séries</h2><div id="q-board"></div></section>
   <section class="card"><div id="q-res"></div><button class="b verde" id="q-go" data-a="q-go">Começar competição</button></section></div>`;
  $("q-tn").value = Q.turnos; $("q-ds").value = Q.dist; $("q-modo").value = Q.modo; $("q-c5").hidden = Q.dist !== "manual";
  qParciais(); qCrit();
}
function qCrit() {                     // lista ordenada de critérios de desempate: marcar liga/desliga, ▲ ▼ muda a ordem
  const el = $("q-crit"); if (!el) return;
  const fim = Q.crit.findIndex(c => c.on && c.id === "sorteio");
  el.innerHTML = `<h3>Critérios de desempate</h3><p class="dica">Valem depois dos pontos, na ordem da lista. Desmarque para não usar e mude a ordem com ▲ ▼. O sorteio sempre decide, então o que vier depois dele nunca é usado.</p>
   <ol class="crit" style="list-style:none;padding:0;margin:8px 0;display:grid;gap:6px">${Q.crit.map((c, i) => `<li style="display:flex;align-items:center;gap:8px"><span>${i + 1}.</span><label class="opt" style="flex:1"><input type="checkbox" data-crit="${c.id}" ${c.on ? "checked" : ""}> ${h(Regras.CRITERIOS[c.id].nome)}</label>${fim >= 0 && i > fim && c.on ? `<small class="dica">nunca usado</small>` : ""}
     <button class="b peq" data-a="crit-sobe" data-v="${c.id}" aria-label="Subir" ${i === 0 ? "disabled" : ""}>▲</button><button class="b peq" data-a="crit-desce" data-v="${c.id}" aria-label="Descer" ${i === Q.crit.length - 1 ? "disabled" : ""}>▼</button></li>`).join("")}</ol>
   <p class="dica">Confronto direto: vale só o que aconteceu entre os empatados (minitabela), para dois ou mais times.</p>`;
}
function qCritMover(id, dir) {
  const i = Q.crit.findIndex(c => c.id === id), j = i + dir;
  if (i < 0 || j < 0 || j >= Q.crit.length) return;
  [Q.crit[i], Q.crit[j]] = [Q.crit[j], Q.crit[i]]; qCrit();
}
function qParciais() {                   // redesenha só o que depende das respostas anteriores
  if (!$("q-pool")) return;               // o questionário já saiu da tela (ex.: clicou em Começar logo depois de editar)
  const f = document.activeElement, chave = f && f.dataset && ["tam", "acc", "cn", "cv"].find(k => f.dataset[k] != null);
  const n = pool().length;
  $("q-pool").textContent = `${n} times selecionados.`;
  $("q-max").textContent = `Com ${n} times dá para ter até ${Math.floor(n / 4)} divisões (cada uma precisa de pelo menos 4 times).`;
  $("q-tam").innerHTML = Q.tam.map((t, i) => `<label>Times na Série ${LETRAS[i]}<input type="number" data-tam="${i}" min="4" step="2" value="${t}"></label>`).join("");
  $("q-c3").hidden = Q.nd < 2;
  $("q-acc").innerHTML = Q.acc.map((a, k) => `<label>Série ${LETRAS[k]} ↔ ${LETRAS[k + 1]}<input type="number" data-acc="${k}" min="0" value="${a}"></label>`).join("");
  qComps();
  qFmt();
  qRes();
  if (Q.dist === "manual") qBoard();
  const novo = chave && document.querySelector(`[data-${chave}="${f.dataset[chave]}"]`);
  if (novo) novo.focus();                // devolve o foco ao mesmo campo depois de refeito
}
const fmtPadrao = () => ({ g: 1, tn: Q.turnos, po: false, k: 4, p: 1, pl: 2, fl: 1 });
const PRE = [["pc", "Pontos corridos"], ["acc", "Pontos corridos + mata-mata (Série B/C)"], ["red", "Campeão direto + reducido (Primera B/C/D)"],
  ["zon", "2 zonas + mata-mata (Primera Nacional)"], ["grp", "Vários grupos + mata-mata (Série D)"]];
function aplicarPreset(i, k) {
  if (!k) return;
  const f = Q.fmt[i], n = Q.tam[i], ac = i > 0 ? Q.acc[i - 1] : 1, desce = i < Q.nd - 1 ? Q.acc[i] : 0;
  const perto = alvo => { let b = 1; for (let g = 2; g <= n / 3; g++) if (n % g === 0 && (b === 1 || Math.abs(g - alvo) < Math.abs(b - alvo))) b = g; return b; };
  const pot = x => { let p = 1; while (p * 2 <= x) p *= 2; return p; };
  Object.assign(f, { g: 1, po: k !== "pc", pl: 2, fl: 1 });
  if (k === "acc") { f.p = pot(Math.max(ac, 1)); f.k = Math.min(8, n - desce - (ac - f.p)); }
  if (k === "red") { f.p = 1; f.k = Math.min(8, n - desce - (ac - 1)); f.pl = 1; }
  if (k === "zon" || k === "grp") { f.g = perto(k === "zon" ? 2 : Math.round(n / 8)); f.k = Math.max(1, Math.min(k === "zon" ? 8 : 4, Math.floor(n / f.g / 2))); }
  qFmt(); qRes();
}
function qFmtDica(i) {
  const el = document.querySelector(`[data-fh="${i}"]`); if (!el) return;
  const f = Q.fmt[i], n = Q.tam[i], g = f.g || 1, ac = i > 0 ? Q.acc[i - 1] : 0, p = i === 0 ? 1 : g > 1 ? ac : f.p, dir = i > 0 && g === 1 && f.po ? ac - p : 0;
  el.textContent = (g > 1 ? `${g} grupos de ${n / g} times` : "Pontos corridos") + (f.po ? ` · mata-mata com ${f.k} ${g > 1 ? "por grupo" : "classificados"}${i > 0 ? `, ${p} ${p > 1 ? "vagas" : "vaga"} de acesso` : ", decide o título"}${dir > 0 ? `; ${dir} ${dir > 1 ? "sobem" : "sobe"} direto pela tabela` : ""}` : "");
}
function qFmt() {
  const sel = (a, b) => a == b ? " selected" : "";
  $("q-fmt").innerHTML = Q.tam.map((n, i) => {
    const f = Q.fmt[i], g = f.g || 1, ac = i > 0 ? Q.acc[i - 1] : 0, id = `data-i="${i}"`;
    return `<div class="fmt"><h3>Série ${LETRAS[i]} · ${n} times</h3><div class="campos">
     <label>Modelo pronto<select data-pre="${i}"><option value="">Escolher…</option>${PRE.map(([k, t]) => `<option value="${k}">${t}</option>`).join("")}</select></label>
     <label>Grupos<input type="number" data-f="g" ${id} min="1" value="${g}"></label>
     <label>Jogos na fase de pontos<select data-f="tn" ${id}><option value="2"${sel(f.tn, 2)}>Turno e returno</option><option value="1"${sel(f.tn, 1)}>Turno único</option></select></label>
     <label class="opt"><input type="checkbox" data-f="po" ${id} ${f.po ? "checked" : ""}> Mata-mata ${i > 0 ? "pelas vagas de acesso" : "pelo título"}</label></div>
     ${f.po ? `<div class="campos"><label>Classificados ${g > 1 ? "por grupo" : "no total"}<input type="number" data-f="k" ${id} min="1" value="${f.k}"></label>
      ${i > 0 ? `<label>Vagas de acesso no mata-mata<input type="number" data-f="p" ${id} min="1" value="${g > 1 ? ac : f.p}" ${g > 1 ? "disabled" : ""}></label>` : ""}
      <label>Confrontos<select data-f="pl" ${id}><option value="1"${sel(f.pl, 1)}>Jogo único</option><option value="2"${sel(f.pl, 2)}>Ida e volta</option></select></label>
      <label>Final<select data-f="fl" ${id}><option value="1"${sel(f.fl, 1)}>Jogo único</option><option value="2"${sel(f.fl, 2)}>Ida e volta</option></select></label></div>` : ""}
     <p class="dica" data-fh="${i}"></p></div>`;
  }).join("");
  Q.fmt.forEach((_, i) => qFmtDica(i));
}
function qHints() {                      // mostra quais posições da tabela cada competição pega
  let ini = 0;
  Q.comps.forEach((c, i) => {
    const el = document.querySelector(`[data-h="${i}"]`), v = c.vagas || 0;
    if (el) el.textContent = v ? `Posições ${ini + 1}º ao ${ini + v}º da Série A` : "Sem vagas pela tabela";
    ini += v;
  });
}
function qComps() {
  $("q-comps").innerHTML = Q.comps.map((c, i) => `<div class="comp-q"><label>Competição ${i + 1}<input data-cn="${i}" maxlength="30" value="${h(c.nome)}"></label>
    <label>Vagas pela tabela<input type="number" data-cv="${i}" min="0" value="${c.vagas}"></label><small class="dica" data-h="${i}"></small></div>`).join("");
  qHints();
}
function qRes() {
  const e = qErros(), soma = Q.tam.reduce((a, b) => a + b, 0), fora = pool().length - soma;
  $("q-res").innerHTML = e.length ? `<ul class="erros">${e.map(x => `<li>${h(x)}</li>`).join("")}</ul>`
    : `<p>Tudo certo: ${Q.nd} ${Q.nd > 1 ? "divisões" : "divisão"} (${Q.tam.join(" + ")} times)${fora > 0 ? `, ${fora} ${fora > 1 ? "times ficam" : "time fica"} de fora` : ""}.</p>`;
  $("q-go").disabled = e.length > 0;
}
/* ---------- Escolha manual: arrastar ou selecionar times para cada série ---------- */
const nomeOrd = (a, b) => T.get(a).nome.localeCompare(T.get(b).nome, "pt-BR") || T.get(a).uf.localeCompare(T.get(b).uf);
const tchip = id => {
  const t = T.get(id), s = Q.sel.has(id);
  return `<div class="tchip${s ? " sel" : ""}" draggable="true" tabindex="0" role="button" aria-pressed="${s}" data-id="${h(id)}">${esc(t)}<span>${h(t.nome)}</span><small>${h(t.uf)}</small></div>`;
};
function qLivres() {                     // times ainda sem série, filtrados pela busca
  const usados = new Set(Q.alloc.flat()), termo = sem(Q.busca.trim());
  return pool().map(t => t.id).filter(id => !usados.has(id) && (!termo || sem(`${T.get(id).nome} ${T.get(id).uf} ${sigla(T.get(id))}`).includes(termo)));
}
function qForaLista() {
  const total = pool().length - Q.alloc.flat().length, l = qLivres();
  $("fora-n").textContent = l.length === total ? total : `${l.length} de ${total}`;
  $("fora-lista").innerHTML = l.map(tchip).join("") || `<p class="dica">Nenhum time aqui.</p>`;
}
function qSelInfo() {
  const n = Q.sel.size;
  $("q-selinfo").textContent = n ? `${n} selecionado${n > 1 ? "s" : ""}` : "Clique nos times para selecionar e use “Mover selecionados”, ou arraste.";
  document.querySelectorAll("#q-board [data-a=q-mover]").forEach(b => b.disabled = !n);
}
function qBoard() {
  const st = $("fora-lista") ? $("fora-lista").scrollTop : 0;
  $("q-board").innerHTML = `<div class="acoes"><button class="b sim" data-a="q-sortear">🎲 Sortear os que faltam</button><button class="b" data-a="q-esvaziar">Esvaziar séries</button><span class="dica" id="q-selinfo"></span></div>
   <div class="board"><div class="col" data-col="fora"><div class="col-h"><b>Fora da competição (<span id="fora-n"></span>)</b>
     <input id="q-busca" type="search" placeholder="Buscar time" aria-label="Buscar time" value="${h(Q.busca)}">
     <div class="linha"><button class="b peq" data-a="q-selvis">Selecionar listados</button><button class="b peq" data-a="q-mover" data-v="fora">Devolver</button></div></div><div class="col-l" id="fora-lista"></div></div>
    ${Q.alloc.map((l, i) => `<div class="col${l.length === Q.tam[i] ? " cheia" : ""}" data-col="${i}"><div class="col-h"><b>Série ${LETRAS[i]} <small>${l.length}/${Q.tam[i]}</small></b>
     <button class="b peq" data-a="q-mover" data-v="${i}">Mover selecionados</button></div><div class="col-l">${[...l].sort(nomeOrd).map(tchip).join("")}</div></div>`).join("")}</div>`;
  qForaLista(); $("fora-lista").scrollTop = st; qSelInfo();
}
function qColunas() {                   // atualiza contagens e times das séries sem trocar os botões (não perde cliques)
  document.querySelectorAll("#q-board .col").forEach(col => {
    const i = col.dataset.col; if (i === "fora") return;
    const l = Q.alloc[i] || [];
    col.classList.toggle("cheia", l.length === Q.tam[i]);
    col.querySelector(".col-h small").textContent = `${l.length}/${Q.tam[i]}`;
    col.querySelector(".col-l").innerHTML = [...l].sort(nomeOrd).map(tchip).join("");
  });
  qForaLista(); qSelInfo();
}
function qMover(ids, col) {              // col = "fora" ou o índice da série
  const dest = col === "fora" ? -1 : +col;
  let mover = ids.filter(id => !(dest >= 0 && Q.alloc[dest].includes(id)));
  if (dest >= 0) {
    const livre = Q.tam[dest] - Q.alloc[dest].length;
    if (mover.length > livre) { aviso(`A Série ${LETRAS[dest]} só tem ${livre} vaga${livre === 1 ? "" : "s"} livre${livre === 1 ? "" : "s"}.`, true); mover = mover.slice(0, Math.max(livre, 0)); }
  }
  Q.alloc.forEach(l => mover.forEach(id => { const i = l.indexOf(id); if (i >= 0) l.splice(i, 1); }));
  if (dest >= 0) Q.alloc[dest].push(...mover);
  Q.sel.clear(); qBoard(); qRes();
}
function qSortearFaltantes() {           // completa as vagas abertas com times que estão fora
  const livres = embaralhar(pool().map(t => t.id).filter(id => !Q.alloc.some(l => l.includes(id))));
  Q.alloc.forEach((l, i) => { while (l.length < Q.tam[i] && livres.length) l.push(livres.pop()); });
  Q.sel.clear(); qBoard(); qRes();
}
function qPick(c) {
  const id = c.dataset.id, marcar = !Q.sel.has(id);
  marcar ? Q.sel.add(id) : Q.sel.delete(id);
  c.classList.toggle("sel", marcar); c.setAttribute("aria-pressed", marcar); qSelInfo();
}

function comecar() {
  RNG.semear();                          // semente própria desta competição (vai para o save)
  const ids = (Q.dist === "sorteio" ? embaralhar : x => x)(pool().map(t => t.id)); let p = 0;
  S = { cfg: { pv: Q.pv, pe: Q.pe, turnos: Q.turnos, modo: Q.modo, desempates: Q.crit.filter(c => c.on).map(c => c.id), acc: Q.acc.slice(0, Q.nd - 1), fmt: Q.fmt.slice(0, Q.nd).map(f => ({ ...f })),
          comps: Q.comps.map(c => ({ nome: c.nome.trim(), sigla: c.nome.trim().slice(0, 3).toUpperCase(), vagas: c.vagas })) },
        ano: 1, deducoes: [], ext: [], historico: [], forcas: {}, sorteio: RNG.rnd(2147483648),
        divs: Q.dist === "manual" ? Q.alloc.map(l => embaralhar(l)) : Q.tam.map(t => ids.slice(p, p += t)) };
  montarFix(); ui = { aba: "temporada", div: 0, rodada: 1 }; salvarLocal(); desenhar();
}

/* ---------- Telas da competição ---------- */
function desenhar() {
  $("ano").hidden = false; $("ano").textContent = `Temporada ${S.ano}`;
  $("app").innerHTML = `<div class="barra">
    ${[["temporada", "Temporada"], ["historico", "Histórico"]].map(([k, t]) => `<button class="tab ${ui.aba === k ? "on" : ""}" data-a="aba" data-v="${k}">${t}</button>`).join("")}
    <span class="esp"></span><button class="b" data-a="salvar">💾 Salvar</button><button class="b" data-a="carregar">📂 Carregar</button><button class="b" data-a="nova">Nova competição</button></div>
    <div id="conteudo"></div>`;
  ui.aba === "temporada" ? vTemporada() : vHistorico();
}
const abasGrupo = () => { const G = grupos(ui.div).length; return G < 2 ? "" : Array.from({ length: G }, (_, g) => `<button class="tab ${g === (ui.grupo || 0) ? "on" : ""}" data-a="grp" data-v="${g}">Grupo ${LETRAS[g]}</button>`).join(""); };
const abasDiv = () => S.divs.map((_, d) => `<button class="tab ${d === ui.div ? "on" : ""}" data-a="div" data-v="${d}">Série ${LETRAS[d]}${completa(d) ? " ✓" : ""}</button>`).join("");
function vTemporada() {
  $("conteudo").innerHTML = `<div class="tabs" id="abas-div">${abasDiv()}</div><div class="tabs" id="abas-g">${abasGrupo()}</div>
   <div class="acoes">
    <button class="b sim" data-a="rodada">🎲 Simular rodada</button><button class="b sim" data-a="divisao">🎲 Simular série</button><button class="b sim" data-a="temporada">🎲 Simular temporada</button>
    <button class="b verde" id="btn-enc" data-a="encerrar" ${completaTudo() ? "" : "disabled"}>Encerrar temporada ▸</button>
    <span class="anos"><input id="nAnos" type="number" min="1" max="100" value="5" aria-label="Quantidade de anos"><button class="b" data-a="anos">Simular anos</button></span></div>
   <div class="grid">
    <section class="card"><div class="ctit"><span id="titulo"></span><button class="b peq" data-a="limpar">Limpar série</button></div>
     <div class="rolagem"><table><thead><tr><th>Clube</th><th>P</th><th>J</th><th>V</th><th>E</th><th>D</th><th>GP</th><th>GC</th><th>SG</th><th title="Cartões amarelos">CA</th><th title="Cartões vermelhos">CV</th>${(S.cfg.comps || []).length ? "<th><span class=\"so-leitor\">Vaga externa</span></th>" : ""}</tr></thead><tbody id="tabela"></tbody></table></div>
     <div class="legenda" id="legenda"></div></section>
    <section class="card"><div class="ctit">Confrontos</div>
     <div class="rod"><button class="b peq" data-a="prev" id="bp">❮</button><span id="rod-label"></span><button class="b peq" data-a="next" id="bn">❯</button></div>
     <div id="jogos"></div></section></div>
   <section class="card" id="po" hidden></section>
   ${(S.cfg.comps || []).length ? `<section class="card" id="classif"></section>` : ""}
   <section class="card">${htmlPunicoes()}</section>
   ${(S.cfg.comps || []).length ? `<section class="card">${htmlExterno()}</section>` : ""}`;
  desenharTabela(); desenharPO(); desenharRodada();
}
function desenharTabela() {
  const d = ui.div, G = grupos(d).length, g = Math.min(ui.grupo || 0, G - 1), L = tabela(d, g), K = classificar(), f = FM(d), Z = zonas(d);
  const COR = { top: "var(--gold)", up: "#3fb950", po: "#a371f7", down: "var(--red)" };
  const ac = d > 0 ? S.cfg.acc[d - 1] : 0, desce = d < S.divs.length - 1 ? S.cfg.acc[d] : 0, dir = f.po ? nDir(d) : ac;
  $("titulo").textContent = `Série ${LETRAS[d]}` + (G > 1 ? ` · Grupo ${LETRAS[g]}` : "");
  $("tabela").innerHTML = L.map((x, i) => {
    const q = K && K.por.get(x.t.id), zona = COR[Z.get(x.t.id)] || "";
    const vaga = q ? COR_COMP[q.c % COR_COMP.length] : "";
    const barra = zona && vaga ? `inset 3px 0 0 ${zona}, inset 6px 0 0 ${vaga}` : zona || vaga ? `inset 3px 0 0 ${zona || vaga}` : "";
    return `<tr><td style="box-shadow:${barra || "none"}" title="${q ? h(descVaga(q)) : ""}"><div class="cl"><span class="pos">${i + 1}</span>${esc(x.t)}<span>${h(x.t.nome)}</span><span class="uf">${h(x.t.uf)}</span></div></td>
      <td><strong>${x.P}</strong>${x.ded ? `<span class="ded" title="Pontos deduzidos">−${x.ded}</span>` : ""}</td><td>${x.J}</td><td>${x.V}</td><td>${x.E}</td><td>${x.D}</td><td>${x.GP}</td><td>${x.GC}</td><td>${x.SG}</td><td>${x.AM}</td><td>${x.VM}</td>${K ? `<td><button class="mini" data-a="ext-sel" data-v="${h(x.t.id)}" title="Marcar vaga externa" aria-label="Marcar vaga externa para ${h(x.t.nome)}">🏆</button></td>` : ""}</tr>`;
  }).join("");
  $("legenda").innerHTML = [d === 0 && !f.po && ["z-top", "Campeão"], dir && ["z-up", `Acesso${f.po ? " direto" : ""} (${dir})`], f.po && ["z-po", `Mata-mata (${nK(d)})`], desce && ["z-down", `Rebaixamento (${desce})`]]
    .filter(Boolean).map(([c, t]) => `<span><i class="${c}"></i>${t}</span>`).join("")
    + (K ? S.cfg.comps.map((c, i) => `<span><i style="background:${COR_COMP[i % COR_COMP.length]}"></i>${h(c.nome)}</span>`).join("") : "");
  desenharClassif(K);
}
function htmlPO() {
  const d = ui.div, f = FM(d), b = S.po[d], p = pp(d);
  const cab = `<h3>Mata-mata – Série ${LETRAS[d]}</h3><p class="dica">${d === 0 ? "Decide o campeão." : `${p} ${p > 1 ? "vagas de acesso saem" : "vaga de acesso sai"} daqui${nDir(d) ? `; os ${nDir(d)} melhores da tabela sobem direto` : ""}.`}</p>`;
  if (!b) return `${cab}<p class="vazio">Termine a fase de pontos para definir os ${nK(d)} classificados.</p>`;
  const nm = x => x ? h(T.get(x).nome) : "A definir", ord = poOrdem(d);
  const rod = ri => { const t = 2 ** (b.r.length - ri); return t === 2 ? "Final" : t === 4 ? "Semifinal" : t === 8 ? "Quartas de final" : t === 16 ? "Oitavas de final" : `Fase de ${t}`; };
  const tie = (t, ri, ti) => {
    if (t.bye) return `<div class="tie"><small>${nm(t.a)} avança direto</small></div>`;
    if (!t.a || !t.b) return `<div class="tie"><div class="jogo"><span class="eq casa">${nm(t.a)}</span><span class="placar">x</span><span class="eq">${nm(t.b)}</span></div></div>`;
    const n = t.l.length, w = poVenc(t);
    const inp = (s, li) => `<input type="number" min="0" max="20" data-po="${ri},${ti},${li},${s}" value="${t.l[li][s === "a" ? 0 : 1] ?? ""}" aria-label="Gols ${h(T.get(t[s]).nome)}">`;
    const legs = t.l.map((_, li) => { const H = n === 2 && li === 0 ? "b" : "a", A = H === "a" ? "b" : "a", th = T.get(t[H]), ta = T.get(t[A]);
      return `<div class="jogo"><span class="eq casa" title="${h(th.nome)}">${h(sigla(th))}${esc(th)}</span><span class="placar">${inp(H, li)}x${inp(A, li)}</span><span class="eq">${esc(ta)}${h(sigla(ta))}</span></div>`; }).join("");
    const cheio = t.l.every(x => x[0] != null && x[1] != null), [A, B] = cheio ? agg(t) : [0, 1];
    const pen = cheio && A === B ? `<div class="pen">Pênaltis: ${h(sigla(T.get(t.a)))} <input type="number" min="0" data-pen="${ri},${ti},0,a" value="${t.pen?.[0] ?? ""}" aria-label="Pênaltis ${h(T.get(t.a).nome)}"> x <input type="number" min="0" data-pen="${ri},${ti},0,b" value="${t.pen?.[1] ?? ""}" aria-label="Pênaltis ${h(T.get(t.b).nome)}"> ${h(sigla(T.get(t.b)))}</div>` : "";
    return `<div class="tie">${legs}${n === 2 && cheio ? `<small>Agregado ${A} x ${B}</small>` : ""}${pen}${w ? `<small>✓ ${nm(w)} avança</small>` : ""}</div>`;
  };
  return `${cab}<div class="acoes"><button class="b sim" data-a="po-fase">🎲 Simular próxima fase</button></div>
   <div class="comps">${b.r.map((rd, ri) => `<div class="comp-col"><h4>${rod(ri)}</h4>${rd.map((t, ti) => tie(t, ri, ti)).join("")}</div>`).join("")}</div>
   ${ord ? `<p class="dica"><b>Campeão: ${nm(ord[0])}</b>${d > 0 ? ` · Sobem pelo mata-mata: ${ord.slice(0, p).map(nm).join(", ")}` : ""}</p>` : ""}`;
}
function desenharPO() { const el = $("po"); if (!el) return; el.hidden = !FM(ui.div).po; el.innerHTML = FM(ui.div).po ? htmlPO() : ""; }
const COR_COMP = ["#58a6ff", "#f0883e", "#bc8cff", "#3fb950", "#d29922", "#f778ba"];
function descVaga(q) {                   // texto da dica ao passar o mouse na barra colorida
  const c = S.cfg.comps[q.c];
  return c.nome + " – " + (q.tipo === "externa" ? "vaga externa" + (q.motivo ? ": " + q.motivo : "") : q.herdou ? `herdou a vaga (${q.pos}º colocado)` : `${q.pos}º colocado`);
}
function desenharClassif(K) {
  const el = $("classif"); if (!el || !K) return;
  el.innerHTML = `<h3>Competições internacionais</h3><p class="dica">Vagas pela tabela da Série A. Quem ganha vaga por fora (★) libera a posição na tabela e o próximo da fila herda a vaga.</p>
   <div class="comps">${S.cfg.comps.map((c, i) => `<div class="comp-col"><h4><i style="background:${COR_COMP[i % COR_COMP.length]}"></i>${h(c.nome)} <small>${K.comps[i].length} ${K.comps[i].length === 1 ? "vaga" : "vagas"}</small></h4><ol>${
     K.comps[i].map(q => { const t = T.get(q.id); return `<li>${esc(t)}<span>${h(t.nome)} <small>${h(t.uf)}</small></span>${q.tipo === "externa" ? `<small>★ externa${q.motivo ? " · " + h(q.motivo) : ""}</small>` : `<small>${q.pos}º${q.herdou ? " · herdou" : ""}</small>`}</li>`; }).join("") || `<li class="vazio">Sem times.</li>`}</ol></div>`).join("")}</div>`;
}
function htmlExterno() {
  const comps = S.cfg.comps;
  const grupos = S.divs.map((l, d) => `<optgroup label="Série ${LETRAS[d]}">${[...l].map(id => T.get(id)).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
    .map(t => `<option value="${h(t.id)}"${t.id === ui.extSel ? " selected" : ""}>${h(t.nome)} (${h(t.uf)})</option>`).join("")}</optgroup>`).join("");
  return `<h3>Vagas externas</h3><p class="dica">Marque quem ganha vaga fora da tabela (campeão de copa, da competição de baixo…). Se o time já estiver numa vaga melhor, ela passa para o próximo da fila.</p>
   <div class="pun"><select id="ext-time" aria-label="Time">${grupos}</select><select id="ext-comp" aria-label="Competição">${comps.map((c, i) => `<option value="${i}">${h(c.nome)}</option>`).join("")}</select>
    <input id="ext-mot" placeholder="Como ganhou (opcional)" maxlength="60"><button class="b" data-a="ext-add">Marcar</button></div>
   <ul class="lista-pun">${S.ext.map((x, i) => `<li>${esc(T.get(x.id))}<span><b>${h(T.get(x.id).nome)}</b> → ${h(comps[x.comp] ? comps[x.comp].nome : "?")}${x.motivo ? " · " + h(x.motivo) : ""}</span><button class="b peq" data-a="ext-del" data-v="${i}" aria-label="Remover vaga externa">×</button></li>`).join("") || `<li class="vazio">Nenhuma vaga externa marcada.</li>`}</ul>`;
}
function marcarExterno() {
  const id = $("ext-time").value, comp = +$("ext-comp").value, motivo = $("ext-mot").value.trim();
  if (S.ext.some(x => x.id === id && x.comp === comp)) return aviso("Esse time já tem vaga externa nessa competição.", true);
  S.ext.push({ id, comp, motivo }); salvarLocal(); desenhar(); aviso("Vaga externa marcada.");
}
function desenharRodada() {
  const R = S.fix[ui.div], r = Math.min(ui.rodada, R.length); ui.rodada = r;
  $("rod-label").textContent = `${r}ª RODADA de ${R.length}`;
  $("bp").disabled = r === 1; $("bn").disabled = r === R.length;
  const G = grupos(ui.div).length, gs = Math.min(ui.grupo || 0, G - 1);
  $("jogos").innerHTML = R[r - 1].map((m, i) => {
    if (G > 1 && m.g !== gs) return "";
    const c = T.get(m.c), f = T.get(m.f), v = x => x ?? "";
    return `<div class="jogo"><span class="eq casa" title="${h(c.nome)} (${h(c.uf)})">${h(sigla(c))}${esc(c)}</span>
      <span class="placar"><input type="number" min="0" max="20" data-j="${i}" data-l="c" value="${v(m.gc)}" aria-label="Gols ${h(c.nome)}">x<input type="number" min="0" max="20" data-j="${i}" data-l="f" value="${v(m.gf)}" aria-label="Gols ${h(f.nome)}"></span>
      <span class="eq" title="${h(f.nome)} (${h(f.uf)})">${esc(f)}${h(sigla(f))}</span></div>`;
  }).join("");
}
function htmlPunicoes() {
  const ids = new Set(S.divs[ui.div]);
  const lista = S.deducoes.map((x, i) => ({ ...x, i })).filter(x => ids.has(x.id));
  const opcoes = [...ids].map(id => T.get(id)).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
    .map(t => `<option value="${h(t.id)}">${h(t.nome)} (${h(t.uf)})</option>`).join("");
  return `<h3>Dedução de pontos – Série ${LETRAS[ui.div]}</h3>
   <p class="dica">Simule punições esportivas: os pontos saem da tabela da temporada atual e voltam ao zero na próxima.</p>
   <div class="pun"><select id="pun-time" aria-label="Time">${opcoes}</select><input id="pun-pts" type="number" min="1" value="3" aria-label="Pontos a deduzir">
    <input id="pun-mot" placeholder="Motivo (opcional)" maxlength="60"><button class="b" data-a="pun-add">Aplicar</button></div>
   <ul class="lista-pun">${lista.map(x => `<li>${esc(T.get(x.id))}<span><b>${h(T.get(x.id).nome)}</b> −${x.pts} pts${x.motivo ? " · " + h(x.motivo) : ""}</span><button class="b peq" data-a="pun-del" data-v="${x.i}" aria-label="Remover punição">×</button></li>`).join("") || `<li class="vazio">Nenhuma punição nesta série.</li>`}</ul>`;
}
const histComps = a => (S.cfg.comps || []).map((c, ci) => a.classif && a.classif[ci] && a.classif[ci].length
  ? `<p><b>${h(c.nome)}</b> · ${a.classif[ci].map(([id, t]) => (T.get(id) ? h(T.get(id).nome) : h(id)) + (t === "externa" ? " ★" : "")).join(", ")}</p>` : "").join("");
function vHistorico() {
  const H = S.historico, nome = id => T.get(id) ? h(T.get(id).nome) : h(id);
  if (!H.length) { $("conteudo").innerHTML = `<section class="card"><p class="vazio">Nenhuma temporada encerrada ainda. Simule uma temporada e clique em “Encerrar temporada”.</p></section>`; return; }
  const tit = new Map(); H.forEach(a => { const id = a.divs[0][0][0]; tit.set(id, (tit.get(id) || 0) + 1); });
  const crest = id => T.get(id) ? esc(T.get(id)) : "";
  $("conteudo").innerHTML = `<section class="card"><h3>Títulos da Série A</h3><ol class="tit">${[...tit].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, q]) => `<li>${crest(id)}${nome(id)}<b>${q}</b></li>`).join("")}</ol></section>` +
   [...H].reverse().map(a => `<details class="card"><summary>Temporada ${a.ano} — campeão: ${nome(a.divs[0][0][0])}</summary>${a.divs.map((l, d) =>
     `<p><b>Série ${LETRAS[d]}</b> · ${l.slice(0, 3).map(([id, p], i) => `${i + 1}º ${nome(id)} (${p})`).join(" · ")}` +
     `${d < a.descem.length && a.descem[d].length ? `<br><small>Descem: ${a.descem[d].map(nome).join(", ")}</small>` : ""}` +
     `${d > 0 && a.sobem[d - 1].length ? `<br><small>Sobem: ${a.sobem[d - 1].map(nome).join(", ")}</small>` : ""}</p>`).join("")}${histComps(a)}</details>`).join("");
}
function punir() {
  const id = $("pun-time").value, pts = parseInt($("pun-pts").value), motivo = $("pun-mot").value.trim();
  if (!id || !(pts > 0)) return aviso("Escolha o time e informe quantos pontos deduzir.", true);
  S.deducoes.push({ id, pts, motivo }); salvarLocal(); desenhar();
  aviso("Punição aplicada.");
}

/* ---------- Eventos ---------- */
function acao(a, v) {
  const d = ui.div;
  switch (a) {
    case "q-go": return comecar();
    case "q-sortear": return qSortearFaltantes();
    case "q-esvaziar": Q.alloc = Q.alloc.map(() => []); Q.sel.clear(); qBoard(); return qRes();
    case "q-mover": return qMover([...Q.sel], v);
    case "q-selvis": qLivres().forEach(id => Q.sel.add(id)); return qBoard();
    case "crit-sobe": return qCritMover(v, -1);
    case "crit-desce": return qCritMover(v, 1);
    case "aba": ui.aba = v; return desenhar();
    case "div": ui.div = +v; ui.rodada = 1; ui.grupo = 0; return desenhar();
    case "grp": ui.grupo = +v; return desenhar();
    case "po-fase": if (!poFase(d)) return; break;
    case "prev": case "next": ui.rodada = Math.min(Math.max(ui.rodada + (a === "next" ? 1 : -1), 1), S.fix[d].length); return desenharRodada();
    case "rodada": simular(d, ui.rodada); break;
    case "divisao": simular(d); break;
    case "temporada": S.divs.forEach((_, i) => simular(i)); break;
    case "encerrar": encerrar(); ui.rodada = 1; aviso(`Temporada ${S.ano - 1} encerrada. Times promovidos e rebaixados.`); break;
    case "anos": return simularAnos();
    case "limpar": if (!confirm(`Limpar todos os resultados da Série ${LETRAS[d]}?`)) return; S.fix[d].forEach(r => r.forEach(m => { m.gc = null; m.gf = null; m.ac = m.af = m.vc = m.vf = null; })); break;
    case "ext-sel": ui.extSel = v; desenhar(); { const el = $("ext-comp"); if (el) { el.scrollIntoView({ block: "center" }); el.focus(); } } ui.extSel = null; return;
    case "ext-add": return marcarExterno();
    case "ext-del": S.ext.splice(+v, 1); break;
    case "pun-add": return punir();
    case "pun-del": S.deducoes.splice(+v, 1); break;
    case "salvar": return baixar();
    case "carregar": return abrirArquivo();
    case "nova":
      if (!confirm("Começar uma nova competição? A atual será substituída (salve antes se quiser guardá-la).")) return;
      try { localStorage.removeItem(LOCAL); } catch (e) { /* ignora */ }
      limparHub(); S = null; Q = null; return questionario();
  }
  salvarLocal(); desenhar();
}
$("app").addEventListener("click", e => {
  const c = e.target.closest(".tchip"); if (c) return qPick(c);
  const b = e.target.closest("[data-a]"); if (b && !b.disabled) acao(b.dataset.a, b.dataset.v);
});
$("app").addEventListener("input", e => { if (e.target.id === "q-busca") { Q.busca = e.target.value; qForaLista(); } });
$("app").addEventListener("keydown", e => { if ((e.key === "Enter" || e.key === " ") && e.target.classList && e.target.classList.contains("tchip")) { e.preventDefault(); qPick(e.target); } });
$("app").addEventListener("dragstart", e => {                 // arrastar um time (ou todos os selecionados)
  const c = e.target.closest && e.target.closest(".tchip"); if (!c) return;
  e.dataTransfer.setData("text/plain", JSON.stringify(Q.sel.has(c.dataset.id) ? [...Q.sel] : [c.dataset.id]));
  e.dataTransfer.effectAllowed = "move";
});
$("app").addEventListener("dragover", e => {
  const col = e.target.closest && e.target.closest(".col"); if (!col) return;
  e.preventDefault();
  document.querySelectorAll(".col.over").forEach(x => x !== col && x.classList.remove("over")); col.classList.add("over");
});
$("app").addEventListener("drop", e => {
  const col = e.target.closest && e.target.closest(".col"); if (!col) return;
  e.preventDefault(); document.querySelectorAll(".col.over").forEach(x => x.classList.remove("over"));
  try { qMover(JSON.parse(e.dataTransfer.getData("text/plain")), col.dataset.col); } catch (x) { /* arrasto de outra coisa: ignora */ }
});
$("app").addEventListener("dragend", () => document.querySelectorAll(".col.over").forEach(x => x.classList.remove("over")));
$("app").addEventListener("change", e => {
  const el = e.target, d = el.dataset, v = +el.value;
  if (d.reg) { Q.reg = el.checked ? [...Q.reg, d.reg] : Q.reg.filter(r => r !== d.reg); qRecalcular(); $("q-nd").value = Q.nd; setTimeout(qParciais, 0); }
  else if (el.id === "q-nd") { if ((v || 1) !== Q.nd) { Q.nd = v || 1; qRecalcular(); setTimeout(qParciais, 0); } el.value = Q.nd; }
  else if (d.tam) { Q.tam[d.tam] = v; Q.alloc[d.tam] = (Q.alloc[d.tam] || []).slice(0, v || 0); if (Q.dist === "manual") qColunas(); qFmt(); qRes(); }
  else if (d.acc) { Q.acc[d.acc] = v; qFmt(); qRes(); }
  else if (el.id === "q-nc") {           // muda a quantidade de competições
    const n = Math.min(Math.max(v || 0, 0), 6); el.value = n;
    if (n === Q.comps.length) return;
    while (Q.comps.length > n) Q.comps.pop();
    while (Q.comps.length < n) Q.comps.push({ nome: `Competição ${Q.comps.length + 1}`, vagas: 2 });
    setTimeout(qParciais, 0);
  }
  else if (d.cn) { Q.comps[d.cn].nome = el.value; qRes(); }
  else if (d.cv) { Q.comps[d.cv].vagas = parseInt(el.value); qHints(); qRes(); }
  else if (el.id === "q-pv") { Q.pv = v; qRes(); }
  else if (el.id === "q-pe") { Q.pe = v; qRes(); }
  else if (el.id === "q-tn") { Q.turnos = v; Q.fmt.forEach(f => f.tn = v); qFmt(); }
  else if (d.crit) { const c = Q.crit.find(x => x.id === d.crit); if (c) c.on = el.checked; qCrit(); }
  else if (el.id === "q-modo") Q.modo = el.value === "forca" ? "forca" : "equilibrada";
  else if (el.id === "q-ds") { Q.dist = el.value; $("q-c5").hidden = Q.dist !== "manual"; if (Q.dist === "manual") qBoard(); qRes(); }
  else if (d.f) {                        // formato da divisão
    const i = +d.i; Q.fmt[i][d.f] = d.f === "po" ? el.checked : d.f === "g" ? (v || 1) : v;
    if (d.f === "po" || d.f === "g") { qFmt(); const n = document.querySelector(`[data-f="${d.f}"][data-i="${i}"]`); if (n) n.focus(); } else qFmtDica(i);
    qRes();
  }
  else if (d.pre !== undefined) aplicarPreset(+d.pre, el.value);
  else if (d.po || d.pen) {              // placar do mata-mata
    const [ri, ti, x, s] = (d.po || d.pen).split(","), t = S.po[ui.div].r[+ri][+ti], val = el.value === "" ? null : Math.max(0, parseInt(el.value));
    if (d.po) t.l[+x][s === "a" ? 0 : 1] = val; else { t.pen = t.pen || [null, null]; t.pen[s === "a" ? 0 : 1] = val; }
    poSync(ui.div); salvarLocal(); desenharPO(); desenharTabela(); $("abas-div").innerHTML = abasDiv(); $("btn-enc").disabled = !completaTudo();
  }
  else if (d.j) {                        // placar digitado à mão
    const m = S.fix[ui.div][ui.rodada - 1][+d.j];
    m[d.l === "c" ? "gc" : "gf"] = el.value === "" ? null : Math.max(0, parseInt(el.value));
    salvarLocal(); desenharTabela(); desenharPO(); $("abas-div").innerHTML = abasDiv(); $("btn-enc").disabled = !completaTudo();
  }
});

/* ---------- Início ---------- */
(async function () {
  logo();
  try {
    const r = await fetch(RAIZ + "times.json", { cache: "no-cache" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const dados = await r.json();
    TIMES = (Array.isArray(dados) ? dados : dados.times).slice().sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR") || a.uf.localeCompare(b.uf));
    TIMES.forEach(t => T.set(t.id, t));
  } catch (e) {
    $("app").innerHTML = `<p class="erros">Não consegui carregar ../times.json. Abra pelo GitHub Pages ou por um servidor local (python -m http.server).</p>`;
    return;
  }
  try { const salvo = localStorage.getItem(LOCAL); if (salvo) { deJSON(JSON.parse(salvo)); sincronizarHub(); return desenhar(); } } catch (e) { /* save local inválido: recomeça */ }
  questionario();
})();
