/* Campeonato Nacional – mainFut
   Fluxo: questionário → temporada (rodadas + tabela) → encerrar (acesso/descenso) → próxima temporada.
   Rodadas e tabela vêm do simulador regional: método do círculo e desempate P > V > SG > GP. */
const RAIZ = "../";                     // times.json e imagens ficam na pasta do hub
const REG = { norte: "Norte", nordeste: "Nordeste", centro_oeste: "Centro-Oeste", sudeste: "Sudeste", sul: "Sul" };
const LETRAS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const LOCAL = "mainfut:campeonato:save";
const $ = id => document.getElementById(id);
const h = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const rnd = n => Math.floor(Math.random() * n);
const embaralhar = a => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = rnd(i + 1); [b[i], b[j]] = [b[j], b[i]]; } return b; };
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
function gerarRodadas(ids, turnos) {
  const n = ids.length, v = [...ids], ida = [];
  for (let r = 0; r < n - 1; r++) {
    ida.push(Array.from({ length: n / 2 }, (_, i) => ({ c: v[i], f: v[n - 1 - i], gc: null, gf: null })));
    v.splice(1, 0, v.pop());
  }
  const volta = turnos === 2 ? ida.map(r => r.map(m => ({ c: m.f, f: m.c, gc: null, gf: null }))) : [];
  return [...ida, ...volta];
}
const montarFix = () => { S.fix = S.divs.map(ids => gerarRodadas(ids, S.cfg.turnos)); };
const gols = () => [0, 0, 1, 1, 1, 2, 2, 3][rnd(8)];
function simular(d, rodada) {            // preenche só o que ainda não tem placar
  (rodada ? [S.fix[d][rodada - 1]] : S.fix[d]).forEach(r => r.forEach(m => {
    if (m.gc == null) m.gc = gols();     // mantém o lado que a pessoa já digitou
    if (m.gf == null) m.gf = gols();
  }));
}
const completa = d => S.fix[d].every(r => r.every(m => m.gc != null && m.gf != null));
const completaTudo = () => S.divs.every((_, d) => completa(d));

/* ---------- Tabela ---------- */
function tabela(d) {
  const L = S.divs[d].map(id => ({ t: T.get(id), P: 0, J: 0, V: 0, E: 0, D: 0, GP: 0, GC: 0, SG: 0, ded: 0 }));
  const por = new Map(L.map(x => [x.t.id, x]));
  S.fix[d].forEach(r => r.forEach(m => {
    if (m.gc == null || m.gf == null) return;
    const a = por.get(m.c), b = por.get(m.f);
    a.J++; b.J++; a.GP += m.gc; a.GC += m.gf; b.GP += m.gf; b.GC += m.gc;
    if (m.gc > m.gf) { a.P += S.cfg.pv; a.V++; b.D++; }
    else if (m.gc < m.gf) { b.P += S.cfg.pv; b.V++; a.D++; }
    else { a.P += S.cfg.pe; b.P += S.cfg.pe; a.E++; b.E++; }
  }));
  S.deducoes.forEach(x => { if (por.has(x.id)) por.get(x.id).ded += x.pts; });   // punições
  L.forEach(x => { x.P -= x.ded; x.SG = x.GP - x.GC; });
  return L.sort((a, b) => b.P - a.P || b.V - a.V || b.SG - a.SG || b.GP - a.GP || a.t.nome.localeCompare(b.t.nome, "pt-BR"));
}

/* ---------- Vagas internacionais (recalculadas a cada mudança) ---------- */
function classificar() {
  const comps = S.cfg.comps || [];
  if (!comps.length) return null;
  const rank = tabela(0).map(x => x.t.id), ja = new Map(), lista = comps.map(() => []);
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
  const K = classificar(), rank = S.divs.map((_, d) => tabela(d)), ids = rank.map(l => l.map(x => x.t.id)), n = S.cfg.acc;
  const reg = {
    ano: S.ano,
    classif: K ? K.comps.map(l => l.map(q => [q.id, q.tipo])) : [],
    divs: rank.map(l => l.map(x => [x.t.id, x.P])),
    sobem: n.map((q, k) => ids[k + 1].slice(0, q)),                     // topo da divisão k+1 sobe
    descem: n.map((q, k) => ids[k].slice(ids[k].length - q))            // fim da divisão k desce
  };
  S.historico.push(reg);
  S.divs = ids.map((l, d) => {
    const sobe = d > 0 ? n[d - 1] : 0, desce = d < ids.length - 1 ? n[d] : 0;
    return embaralhar([...l.slice(sobe, l.length - desce), ...(d > 0 ? reg.descem[d - 1] : []), ...(d < ids.length - 1 ? reg.sobem[d] : [])]);
  });
  S.ano++; S.deducoes = []; S.ext = []; montarFix();
}
function simularAnos() {
  const k = Math.min(Math.max(parseInt($("nAnos").value) || 1, 1), 100);
  for (let i = 0; i < k; i++) { S.divs.forEach((_, d) => simular(d)); encerrar(); }
  ui.rodada = 1; salvarLocal(); desenhar();
  aviso(k > 1 ? `${k} temporadas simuladas. Veja o histórico.` : "1 temporada simulada. Veja o histórico.");
}

/* ---------- Save ---------- */
function paraJSON() {                    // só os placares: as rodadas são refeitas a partir da ordem dos times
  return { versao: 1, ano: S.ano, cfg: S.cfg, divs: S.divs, deducoes: S.deducoes, ext: S.ext, historico: S.historico,
    placar: S.fix.map(rs => rs.flatMap(r => r.map(m => (m.gc == null || m.gf == null) ? null : [m.gc, m.gf]))) };
}
function deJSON(o) {
  if (!o || !Array.isArray(o.divs) || !o.cfg) throw new Error("Arquivo de save inválido.");
  const falta = o.divs.flat().filter(id => !T.has(id));
  if (falta.length) throw new Error("A base não tem mais estes times: " + falta.slice(0, 5).join(", "));
  S = { cfg: o.cfg, ano: o.ano, divs: o.divs, deducoes: o.deducoes || [], ext: o.ext || [], historico: o.historico || [] };
  S.cfg.comps = S.cfg.comps || [];       // saves antigos não tinham competições
  montarFix();
  S.fix.forEach((rs, d) => rs.flat().forEach((m, i) => { const p = o.placar?.[d]?.[i]; if (p) { m.gc = p[0]; m.gf = p[1]; } }));
  ui = { aba: "temporada", div: 0, rodada: 1 };
}
function salvarLocal() { try { localStorage.setItem(LOCAL, JSON.stringify(paraJSON())); } catch (e) { /* sem armazenamento */ } }
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
  return e;
}
function questionario() {
  $("ano").hidden = true;
  if (!Q) { Q = { reg: [...new Set(TIMES.map(t => t.regiao))], nd: 0, tam: [], acc: [], pv: 3, pe: 1, turnos: 2, dist: "sorteio", alloc: [], sel: new Set(), busca: "",
    comps: [{ nome: "Libertadores", vagas: 4 }, { nome: "Sul-Americana", vagas: 6 }] }; Q.nd = Math.max(1, Math.round(pool().length / 20)); qRecalcular(); }
  const regs = [...new Set(TIMES.map(t => t.regiao))];
  $("app").innerHTML = `<div class="quest">
   <section class="card"><h2><span class="n">1</span>Quais times vão jogar?</h2>
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
    <label>Distribuição dos times<select id="q-ds"><option value="sorteio">Sorteio aleatório</option><option value="base">Ordem da base</option><option value="manual">Escolher manualmente</option></select></label></div></section>
   <section class="card" id="q-c5" hidden><h2><span class="n">6</span>Monte as séries</h2><div id="q-board"></div></section>
   <section class="card"><div id="q-res"></div><button class="b verde" id="q-go" data-a="q-go">Começar competição</button></section></div>`;
  $("q-tn").value = Q.turnos; $("q-ds").value = Q.dist; $("q-c5").hidden = Q.dist !== "manual";
  qParciais();
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
  qRes();
  if (Q.dist === "manual") qBoard();
  const novo = chave && document.querySelector(`[data-${chave}="${f.dataset[chave]}"]`);
  if (novo) novo.focus();                // devolve o foco ao mesmo campo depois de refeito
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
  const ids = (Q.dist === "sorteio" ? embaralhar : x => x)(pool().map(t => t.id)); let p = 0;
  S = { cfg: { pv: Q.pv, pe: Q.pe, turnos: Q.turnos, acc: Q.acc.slice(0, Q.nd - 1),
          comps: Q.comps.map(c => ({ nome: c.nome.trim(), sigla: c.nome.trim().slice(0, 3).toUpperCase(), vagas: c.vagas })) },
        ano: 1, deducoes: [], ext: [], historico: [],
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
const abasDiv = () => S.divs.map((_, d) => `<button class="tab ${d === ui.div ? "on" : ""}" data-a="div" data-v="${d}">Série ${LETRAS[d]}${completa(d) ? " ✓" : ""}</button>`).join("");
function vTemporada() {
  $("conteudo").innerHTML = `<div class="tabs" id="abas-div">${abasDiv()}</div>
   <div class="acoes">
    <button class="b sim" data-a="rodada">🎲 Simular rodada</button><button class="b sim" data-a="divisao">🎲 Simular série</button><button class="b sim" data-a="temporada">🎲 Simular temporada</button>
    <button class="b verde" id="btn-enc" data-a="encerrar" ${completaTudo() ? "" : "disabled"}>Encerrar temporada ▸</button>
    <span class="anos"><input id="nAnos" type="number" min="1" max="100" value="5" aria-label="Quantidade de anos"><button class="b" data-a="anos">Simular anos</button></span></div>
   <div class="grid">
    <section class="card"><div class="ctit"><span id="titulo"></span><button class="b peq" data-a="limpar">Limpar série</button></div>
     <div class="rolagem"><table><thead><tr><th>Clube</th><th>P</th><th>J</th><th>V</th><th>E</th><th>D</th><th>GP</th><th>GC</th><th>SG</th>${(S.cfg.comps || []).length ? "<th>Vaga</th>" : ""}</tr></thead><tbody id="tabela"></tbody></table></div>
     <div class="legenda" id="legenda"></div></section>
    <section class="card"><div class="ctit">Confrontos</div>
     <div class="rod"><button class="b peq" data-a="prev" id="bp">❮</button><span id="rod-label"></span><button class="b peq" data-a="next" id="bn">❯</button></div>
     <div id="jogos"></div></section></div>
   ${(S.cfg.comps || []).length ? `<section class="card" id="classif"></section>` : ""}
   <section class="card">${htmlPunicoes()}</section>
   ${(S.cfg.comps || []).length ? `<section class="card">${htmlExterno()}</section>` : ""}`;
  desenharTabela(); desenharRodada();
}
function desenharTabela() {
  const d = ui.div, L = tabela(d), K = classificar(), n = S.cfg.acc, ult = S.divs.length - 1;
  const sobe = d > 0 ? n[d - 1] : 0, desce = d < ult ? n[d] : 0;
  $("titulo").textContent = `Série ${LETRAS[d]}`;
  $("tabela").innerHTML = L.map((x, i) => {
    const z = d === 0 && i === 0 ? "z-top" : i < sobe ? "z-up" : desce && i >= L.length - desce ? "z-down" : "";
    return `<tr class="${z}"><td><div class="cl"><span class="pos">${i + 1}</span>${esc(x.t)}<span>${h(x.t.nome)}</span><span class="uf">${h(x.t.uf)}</span></div></td>
      <td><strong>${x.P}</strong>${x.ded ? `<span class="ded" title="Pontos deduzidos">−${x.ded}</span>` : ""}</td><td>${x.J}</td><td>${x.V}</td><td>${x.E}</td><td>${x.D}</td><td>${x.GP}</td><td>${x.GC}</td><td>${x.SG}</td>${K ? `<td>${pill(K.por.get(x.t.id))}<button class="mini" data-a="ext-sel" data-v="${h(x.t.id)}" title="Marcar vaga externa" aria-label="Marcar vaga externa para ${h(x.t.nome)}">🏆</button></td>` : ""}</tr>`;
  }).join("");
  $("legenda").innerHTML = [d === 0 && ["z-top", "Campeão"], sobe && ["z-up", `Acesso (${sobe})`], desce && ["z-down", `Rebaixamento (${desce})`]]
    .filter(Boolean).map(([c, t]) => `<span><i class="${c}"></i>${t}</span>`).join("")
    + (K ? S.cfg.comps.map((c, i) => `<span><i style="background:${COR_COMP[i % COR_COMP.length]}"></i>${h(c.nome)}</span>`).join("") : "");
  desenharClassif(K);
}
const COR_COMP = ["#58a6ff", "#f0883e", "#bc8cff", "#3fb950", "#d29922", "#f778ba"];
function pill(q) {                       // etiqueta da vaga na tabela
  if (!q) return "";
  const c = S.cfg.comps[q.c];
  const t = q.tipo === "externa" ? "vaga externa" + (q.motivo ? ": " + q.motivo : "") : q.herdou ? `herdou a vaga (${q.pos}º colocado)` : `${q.pos}º colocado`;
  return `<span class="vaga${q.tipo === "externa" ? " ext" : ""}${q.herdou ? " her" : ""}" style="--c:${COR_COMP[q.c % COR_COMP.length]}" title="${h(c.nome + " – " + t)}">${h(c.sigla || c.nome.slice(0, 3).toUpperCase())}</span>`;
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
  $("jogos").innerHTML = R[r - 1].map((m, i) => {
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
    case "aba": ui.aba = v; return desenhar();
    case "div": ui.div = +v; ui.rodada = 1; return desenhar();
    case "prev": case "next": ui.rodada = Math.min(Math.max(ui.rodada + (a === "next" ? 1 : -1), 1), S.fix[d].length); return desenharRodada();
    case "rodada": simular(d, ui.rodada); break;
    case "divisao": simular(d); break;
    case "temporada": S.divs.forEach((_, i) => simular(i)); break;
    case "encerrar": encerrar(); ui.rodada = 1; aviso(`Temporada ${S.ano - 1} encerrada. Times promovidos e rebaixados.`); break;
    case "anos": return simularAnos();
    case "limpar": if (!confirm(`Limpar todos os resultados da Série ${LETRAS[d]}?`)) return; S.fix[d].forEach(r => r.forEach(m => { m.gc = null; m.gf = null; })); break;
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
      S = null; Q = null; return questionario();
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
  else if (d.tam) { Q.tam[d.tam] = v; Q.alloc[d.tam] = (Q.alloc[d.tam] || []).slice(0, v || 0); if (Q.dist === "manual") qColunas(); qRes(); }
  else if (d.acc) { Q.acc[d.acc] = v; qRes(); }
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
  else if (el.id === "q-tn") Q.turnos = v;
  else if (el.id === "q-ds") { Q.dist = el.value; $("q-c5").hidden = Q.dist !== "manual"; if (Q.dist === "manual") qBoard(); qRes(); }
  else if (d.j) {                        // placar digitado à mão
    const m = S.fix[ui.div][ui.rodada - 1][+d.j];
    m[d.l === "c" ? "gc" : "gf"] = el.value === "" ? null : Math.max(0, parseInt(el.value));
    salvarLocal(); desenharTabela(); $("abas-div").innerHTML = abasDiv(); $("btn-enc").disabled = !completaTudo();
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
  try { const salvo = localStorage.getItem(LOCAL); if (salvo) { deJSON(JSON.parse(salvo)); return desenhar(); } } catch (e) { /* save local inválido: recomeça */ }
  questionario();
})();
