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

/* ---------- Fim de temporada: acesso e descenso ---------- */
function encerrar() {
  const rank = S.divs.map((_, d) => tabela(d)), ids = rank.map(l => l.map(x => x.t.id)), n = S.cfg.acc;
  const reg = {
    ano: S.ano,
    divs: rank.map(l => l.map(x => [x.t.id, x.P])),
    sobem: n.map((q, k) => ids[k + 1].slice(0, q)),                     // topo da divisão k+1 sobe
    descem: n.map((q, k) => ids[k].slice(ids[k].length - q))            // fim da divisão k desce
  };
  S.historico.push(reg);
  S.divs = ids.map((l, d) => {
    const sobe = d > 0 ? n[d - 1] : 0, desce = d < ids.length - 1 ? n[d] : 0;
    return embaralhar([...l.slice(sobe, l.length - desce), ...(d > 0 ? reg.descem[d - 1] : []), ...(d < ids.length - 1 ? reg.sobem[d] : [])]);
  });
  S.ano++; S.deducoes = []; montarFix();
}
function simularAnos() {
  const k = Math.min(Math.max(parseInt($("nAnos").value) || 1, 1), 100);
  for (let i = 0; i < k; i++) { S.divs.forEach((_, d) => simular(d)); encerrar(); }
  ui.rodada = 1; salvarLocal(); desenhar();
  aviso(k > 1 ? `${k} temporadas simuladas. Veja o histórico.` : "1 temporada simulada. Veja o histórico.");
}

/* ---------- Save ---------- */
function paraJSON() {                    // só os placares: as rodadas são refeitas a partir da ordem dos times
  return { versao: 1, ano: S.ano, cfg: S.cfg, divs: S.divs, deducoes: S.deducoes, historico: S.historico,
    placar: S.fix.map(rs => rs.flatMap(r => r.map(m => (m.gc == null || m.gf == null) ? null : [m.gc, m.gf]))) };
}
function deJSON(o) {
  if (!o || !Array.isArray(o.divs) || !o.cfg) throw new Error("Arquivo de save inválido.");
  const falta = o.divs.flat().filter(id => !T.has(id));
  if (falta.length) throw new Error("A base não tem mais estes times: " + falta.slice(0, 5).join(", "));
  S = { cfg: o.cfg, ano: o.ano, divs: o.divs, deducoes: o.deducoes || [], historico: o.historico || [] };
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
}
function qErros() {
  const e = [], n = pool().length, max = Math.floor(n / 4), soma = Q.tam.reduce((a, b) => a + b, 0);
  if (n < 4) e.push("Escolha regiões que somem pelo menos 4 times.");
  if (Q.nd > max) e.push(`Com ${n} times o máximo é ${max} divisões (mínimo de 4 times por divisão).`);
  Q.tam.forEach((t, i) => { if (!(t >= 4) || t % 2) e.push(`Série ${LETRAS[i]}: use um número par de times, a partir de 4.`); });
  if (soma > n) e.push(`As divisões somam ${soma} times, mas só há ${n} disponíveis.`);
  if (Q.pe > Q.pv) e.push("O empate não pode valer mais pontos que a vitória.");
  Q.acc.forEach((a, k) => { if (!(a >= 0)) e.push(`Acesso entre as séries ${LETRAS[k]} e ${LETRAS[k + 1]}: informe um número válido.`); });
  Q.tam.forEach((t, i) => {              // quem sobe e quem desce na mesma série não pode passar do tamanho dela
    const mov = (i > 0 ? Q.acc[i - 1] : 0) + (i < Q.nd - 1 ? Q.acc[i] : 0);
    if (mov > t) e.push(`Série ${LETRAS[i]}: ${mov} times trocariam de divisão, mais do que o tamanho da série (${t}).`);
  });
  return e;
}
function questionario() {
  $("ano").hidden = true;
  if (!Q) { Q = { reg: [...new Set(TIMES.map(t => t.regiao))], nd: 0, tam: [], acc: [], pv: 3, pe: 1, turnos: 2, sorteio: true }; Q.nd = Math.max(1, Math.round(pool().length / 20)); qRecalcular(); }
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
   <section class="card"><h2><span class="n">4</span>Regras da tabela</h2><div class="campos">
    <label>Pontos por vitória<input type="number" id="q-pv" min="1" max="5" value="${Q.pv}"></label>
    <label>Pontos por empate<input type="number" id="q-pe" min="0" max="3" value="${Q.pe}"></label>
    <label>Formato<select id="q-tn"><option value="2">Turno e returno</option><option value="1">Turno único</option></select></label>
    <label>Distribuição dos times<select id="q-ds"><option value="1">Sorteio aleatório</option><option value="0">Ordem da base</option></select></label></div></section>
   <section class="card"><div id="q-res"></div><button class="b verde" id="q-go" data-a="q-go">Começar competição</button></section></div>`;
  $("q-tn").value = Q.turnos; $("q-ds").value = Q.sorteio ? "1" : "0";
  qParciais();
}
function qParciais() {                   // redesenha só o que depende das respostas anteriores
  const f = document.activeElement, chave = f && f.dataset && (f.dataset.tam != null ? "tam" : f.dataset.acc != null ? "acc" : null);
  const n = pool().length;
  $("q-pool").textContent = `${n} times selecionados.`;
  $("q-max").textContent = `Com ${n} times dá para ter até ${Math.floor(n / 4)} divisões (cada uma precisa de pelo menos 4 times).`;
  $("q-tam").innerHTML = Q.tam.map((t, i) => `<label>Times na Série ${LETRAS[i]}<input type="number" data-tam="${i}" min="4" step="2" value="${t}"></label>`).join("");
  $("q-c3").hidden = Q.nd < 2;
  $("q-acc").innerHTML = Q.acc.map((a, k) => `<label>Série ${LETRAS[k]} ↔ ${LETRAS[k + 1]}<input type="number" data-acc="${k}" min="0" value="${a}"></label>`).join("");
  qRes();
  const novo = chave && document.querySelector(`[data-${chave}="${f.dataset[chave]}"]`);
  if (novo) novo.focus();                // devolve o foco ao mesmo campo depois de refeito
}
function qRes() {
  const e = qErros(), soma = Q.tam.reduce((a, b) => a + b, 0), fora = pool().length - soma;
  $("q-res").innerHTML = e.length ? `<ul class="erros">${e.map(x => `<li>${h(x)}</li>`).join("")}</ul>`
    : `<p>Tudo certo: ${Q.nd} ${Q.nd > 1 ? "divisões" : "divisão"} (${Q.tam.join(" + ")} times)${fora > 0 ? `, ${fora} ${fora > 1 ? "times ficam" : "time fica"} de fora` : ""}.</p>`;
  $("q-go").disabled = e.length > 0;
}
function comecar() {
  const ids = (Q.sorteio ? embaralhar : x => x)(pool().map(t => t.id)); let p = 0;
  S = { cfg: { pv: Q.pv, pe: Q.pe, turnos: Q.turnos, acc: Q.acc.slice(0, Q.nd - 1) }, ano: 1, deducoes: [], historico: [],
        divs: Q.tam.map(t => ids.slice(p, p += t)) };
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
     <div class="rolagem"><table><thead><tr><th>Clube</th><th>P</th><th>J</th><th>V</th><th>E</th><th>D</th><th>GP</th><th>GC</th><th>SG</th></tr></thead><tbody id="tabela"></tbody></table></div>
     <div class="legenda" id="legenda"></div></section>
    <section class="card"><div class="ctit">Confrontos</div>
     <div class="rod"><button class="b peq" data-a="prev" id="bp">❮</button><span id="rod-label"></span><button class="b peq" data-a="next" id="bn">❯</button></div>
     <div id="jogos"></div></section></div>
   <section class="card">${htmlPunicoes()}</section>`;
  desenharTabela(); desenharRodada();
}
function desenharTabela() {
  const d = ui.div, L = tabela(d), n = S.cfg.acc, ult = S.divs.length - 1;
  const sobe = d > 0 ? n[d - 1] : 0, desce = d < ult ? n[d] : 0;
  $("titulo").textContent = `Série ${LETRAS[d]}`;
  $("tabela").innerHTML = L.map((x, i) => {
    const z = d === 0 && i === 0 ? "z-top" : i < sobe ? "z-up" : desce && i >= L.length - desce ? "z-down" : "";
    return `<tr class="${z}"><td><div class="cl"><span class="pos">${i + 1}</span>${esc(x.t)}<span>${h(x.t.nome)}</span><span class="uf">${h(x.t.uf)}</span></div></td>
      <td><strong>${x.P}</strong>${x.ded ? `<span class="ded" title="Pontos deduzidos">−${x.ded}</span>` : ""}</td><td>${x.J}</td><td>${x.V}</td><td>${x.E}</td><td>${x.D}</td><td>${x.GP}</td><td>${x.GC}</td><td>${x.SG}</td></tr>`;
  }).join("");
  $("legenda").innerHTML = [d === 0 && ["z-top", "Campeão"], sobe && ["z-up", `Acesso (${sobe})`], desce && ["z-down", `Rebaixamento (${desce})`]]
    .filter(Boolean).map(([c, t]) => `<span><i class="${c}"></i>${t}</span>`).join("");
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
function vHistorico() {
  const H = S.historico, nome = id => T.get(id) ? h(T.get(id).nome) : h(id);
  if (!H.length) { $("conteudo").innerHTML = `<section class="card"><p class="vazio">Nenhuma temporada encerrada ainda. Simule uma temporada e clique em “Encerrar temporada”.</p></section>`; return; }
  const tit = new Map(); H.forEach(a => { const id = a.divs[0][0][0]; tit.set(id, (tit.get(id) || 0) + 1); });
  const crest = id => T.get(id) ? esc(T.get(id)) : "";
  $("conteudo").innerHTML = `<section class="card"><h3>Títulos da Série A</h3><ol class="tit">${[...tit].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, q]) => `<li>${crest(id)}${nome(id)}<b>${q}</b></li>`).join("")}</ol></section>` +
   [...H].reverse().map(a => `<details class="card"><summary>Temporada ${a.ano} — campeão: ${nome(a.divs[0][0][0])}</summary>${a.divs.map((l, d) =>
     `<p><b>Série ${LETRAS[d]}</b> · ${l.slice(0, 3).map(([id, p], i) => `${i + 1}º ${nome(id)} (${p})`).join(" · ")}` +
     `${d < a.descem.length && a.descem[d].length ? `<br><small>Descem: ${a.descem[d].map(nome).join(", ")}</small>` : ""}` +
     `${d > 0 && a.sobem[d - 1].length ? `<br><small>Sobem: ${a.sobem[d - 1].map(nome).join(", ")}</small>` : ""}</p>`).join("")}</details>`).join("");
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
    case "aba": ui.aba = v; return desenhar();
    case "div": ui.div = +v; ui.rodada = 1; return desenhar();
    case "prev": case "next": ui.rodada = Math.min(Math.max(ui.rodada + (a === "next" ? 1 : -1), 1), S.fix[d].length); return desenharRodada();
    case "rodada": simular(d, ui.rodada); break;
    case "divisao": simular(d); break;
    case "temporada": S.divs.forEach((_, i) => simular(i)); break;
    case "encerrar": encerrar(); ui.rodada = 1; aviso(`Temporada ${S.ano - 1} encerrada. Times promovidos e rebaixados.`); break;
    case "anos": return simularAnos();
    case "limpar": if (!confirm(`Limpar todos os resultados da Série ${LETRAS[d]}?`)) return; S.fix[d].forEach(r => r.forEach(m => { m.gc = null; m.gf = null; })); break;
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
$("app").addEventListener("click", e => { const b = e.target.closest("[data-a]"); if (b && !b.disabled) acao(b.dataset.a, b.dataset.v); });
$("app").addEventListener("change", e => {
  const el = e.target, d = el.dataset, v = +el.value;
  if (d.reg) { Q.reg = el.checked ? [...Q.reg, d.reg] : Q.reg.filter(r => r !== d.reg); qRecalcular(); $("q-nd").value = Q.nd; setTimeout(qParciais, 0); }
  else if (el.id === "q-nd") { if ((v || 1) !== Q.nd) { Q.nd = v || 1; qRecalcular(); setTimeout(qParciais, 0); } el.value = Q.nd; }
  else if (d.tam) { Q.tam[d.tam] = v; qRes(); }
  else if (d.acc) { Q.acc[d.acc] = v; qRes(); }
  else if (el.id === "q-pv") { Q.pv = v; qRes(); }
  else if (el.id === "q-pe") { Q.pe = v; qRes(); }
  else if (el.id === "q-tn") Q.turnos = v;
  else if (el.id === "q-ds") Q.sorteio = el.value === "1";
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
