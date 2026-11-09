/* Copa Nacional – mainFut
   Fluxo: questionário → chaveamento circular → campeão.

   Como o círculo é montado (tudo vem do número de times N):
     • B  = maior potência de 2 que cabe em N         (ex.: N = 108 → B = 64)
     • m  = N − B jogos de uma FASE PRELIMINAR         (ex.: 44 jogos → 88 times)
     • os outros 2B − N times entram direto na fase de B (ex.: 20 times)
     • depois vêm B/2, B/4 … até a final (2 times), com o campeão no centro.
   Se N já for potência de 2, não existe fase preliminar.

   Cada fase é um "anel" do círculo. Nos anéis, os times 2p e 2p+1 se enfrentam (confronto p)
   e o vencedor ocupa a posição p do anel seguinte — o mesmo desenho da Copa antiga. */

const RAIZ = "../";                         // times.json e imagens ficam na pasta do hub
const LOCAL = "mainfut:copa:save";          // save automático no navegador
const HUB_CAMPEAO = "hub:copa:campeao";     // chave que o hub lê para mostrar o campeão (contrato do hub-data.js)
const REG = { norte: "Norte", nordeste: "Nordeste", centro_oeste: "Centro-Oeste", sudeste: "Sudeste", sul: "Sul" };
const ESPACO = 52;                          // distância mínima (px) entre escudos vizinhos no mesmo anel
const BASE_RAIOS = [70, 150, 260, 390, 520, 650, 780, 910];   // raios do desenho original, do centro para fora
const PALETA = ["#db6d28", "#d29922", "#7ee787", "#2ea043", "#39c5cf", "#388bfd", "#8b9cf5", "#58a6ff"];   // da final para fora
const COR_PRELIM = "#a371f7";

const $ = id => document.getElementById(id);
const h = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const rnd = n => Math.floor(Math.random() * n);
const embaralhar = a => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = rnd(i + 1); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const sigla = t => t.sigla || t.nome.slice(0, 3).toUpperCase();
const sem = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const nomeDaCor = c => { const b = c.split("/").pop().replace(/\.[a-z]+$/i, ""); return b.charAt(0).toUpperCase() + b.slice(1); };

let DET = null;   // times-detalhe.json: carregado só ao abrir a ficha de um time ou a comemoração do campeão
function detalhes() {
  if (!DET) DET = fetch(RAIZ + "times-detalhe.json", { cache: "no-cache" }).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(d => d.times || {}).catch(() => { DET = null; return {}; });   // falhou: usa só o básico e tenta de novo depois
  return DET;
}
let TIMES = [], T = new Map();   // base de times e busca por id
let Q = null;                    // respostas do questionário
let C = null;                    // copa em andamento: { cfg, prelim, slots, res, festa }
let R = [];                      // anéis da copa:      [{ count, tipo, nome }]
let E = [];                      // times de cada anel:  E[r][i] = id ou null (ainda não definido)
let NUL = [];                    // posições do 1º anel principal que esperam um vencedor da preliminar
let G = null;                    // geometria do desenho (raios, centro, tamanho)
let Z = { s: 1, x: 0, y: 0 };    // zoom e deslocamento da arena
let JG = null;                   // confronto aberto na janela de placar { r, p, pen }

/* ---------- Utilidades de tela ---------- */
function esc(t) {                // escudo; sem imagem, mostra a sigla
  if (!t.escudo) return `<span class="esc"><b>${h(sigla(t))}</b></span>`;
  return `<span class="esc"><img src="${RAIZ}${h(t.escudo)}" alt="" decoding="async" data-s="${h(sigla(t))}" onerror="this.replaceWith(Object.assign(document.createElement('b'),{textContent:this.dataset.s}))"></span>`;
}
const SVG_PADRAO = `<svg class="svg-padrao" viewBox="0 0 24 24"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/></svg>`;
let tAviso;
function aviso(txt, erro) {
  const a = $("aviso");
  a.textContent = txt; a.className = "aviso on" + (erro ? " erro" : "");
  clearTimeout(tAviso); tAviso = setTimeout(() => a.className = "aviso", 4500);
}
function logo() {                // o arquivo pode estar como Logo.png ou logo.png (GitHub Pages diferencia maiúsculas)
  const img = $("logo"), alvos = ["Logo.png", "logo.png"]; let i = 0;
  img.onerror = () => { if (++i < alvos.length) img.src = alvos[i]; else img.remove(); };
  img.src = alvos[0];
}

/* ---------- Estrutura do chaveamento (só depende de N) ---------- */
function estrutura(n) {
  let B = 2; while (B * 2 <= n) B *= 2;         // maior potência de 2 que cabe em n
  return { n, B, m: n - B, byes: 2 * B - n };   // m = jogos da preliminar; byes = times que entram direto
}
function nomeFase(c) {                          // c = quantidade de times que entram na fase
  return c === 2 ? "Final" : c === 4 ? "Semifinais" : c === 8 ? "Quartas de final" : c === 16 ? "Oitavas de final" : `${c / 2}-avos de final`;
}
function montarAneis(n) {
  const { B, m } = estrutura(n), a = [];
  if (m > 0) a.push({ count: 2 * m, tipo: "prelim", nome: "Fase preliminar" });
  for (let c = B; c >= 2; c /= 2) a.push({ count: c, tipo: c === B ? "main" : "fase", nome: nomeFase(c) });
  return a;
}
const corAnel = r => R[r].tipo === "prelim" ? COR_PRELIM : PALETA[(R.length - 1 - r) % PALETA.length];
const pernas = r => (C.cfg.ida && !(r === R.length - 1 && C.cfg.finalUnico)) ? 2 : 1;   // jogos do confronto

/* ---------- Sorteio ---------- */
function ordemSeparada(ids) {                   // espalha os times do mesmo estado pelo círculo
  const grupos = new Map(), chaves = [];
  embaralhar(ids).forEach(id => { const u = T.get(id).uf; if (!grupos.has(u)) grupos.set(u, []); grupos.get(u).push(id); });
  grupos.forEach(l => l.forEach((id, i) => chaves.push([(i + Math.random()) / l.length, id])));
  return chaves.sort((a, b) => a[0] - b[0]).map(x => x[1]);
}
function montarSorteio(ids, modo) {
  const { B, m, byes } = estrutura(ids.length);
  const L = modo === "base" ? TIMES.map(t => t.id).filter(id => ids.includes(id))
    : modo === "separar" ? ordemSeparada(ids) : embaralhar(ids);
  // posições do anel principal que recebem um time direto, espalhadas de forma uniforme
  const direto = new Set(Array.from({ length: byes }, (_, k) => Math.floor((k + 0.5) * B / byes)));
  const prelim = [], slots = []; let k = 0;
  for (let j = 0; j < B; j++) {
    if (m === 0 || direto.has(j)) slots.push(L[k++]);          // entra direto
    else { slots.push(null); prelim.push(L[k++], L[k++]); }     // espera o vencedor de um jogo da preliminar
  }
  return { prelim, slots };
}

/* ---------- Estado da copa: quem está em cada posição ---------- */
function venc(r, p) {            // vencedor do confronto p do anel r (ou null)
  const m = C.res[r][p]; if (!m) return null;
  if (m.a !== E[r][2 * p] || m.b !== E[r][2 * p + 1]) { delete C.res[r][p]; return null; }   // os times mudaram: resultado antigo não vale
  return m.w || null;
}
function derivar() {             // recalcula E a partir do sorteio e dos resultados
  E = []; NUL = [];
  C.slots.forEach((id, j) => { if (id == null) NUL.push(j); });
  R.forEach((a, r) => {
    if (r === 0) E[r] = a.tipo === "prelim" ? [...C.prelim] : [...C.slots];
    else if (a.tipo === "main" && R[0].tipo === "prelim") { let k = 0; E[r] = C.slots.map(id => id ?? venc(r - 1, k++)); }
    else E[r] = Array.from({ length: a.count }, (_, i) => venc(r - 1, i));
  });
}
const pronto = (r, p) => !!(E[r][2 * p] && E[r][2 * p + 1]);
const faseCompleta = r => Array.from({ length: R[r].count / 2 }, (_, p) => venc(r, p)).every(Boolean);
const faseAtual = () => R.findIndex((_, r) => !faseCompleta(r));
const campeaoId = () => venc(R.length - 1, 0);

/* ---------- Resultados ---------- */
const gols = () => [0, 0, 1, 1, 1, 2, 2, 3][rnd(8)];
function penaltis() { const a = 2 + rnd(4); let b = 2 + rnd(4); while (b === a) b = 2 + rnd(4); return [a, b]; }
function totais(m) {             // soma dos gols (A, B); null se faltar algum placar. Na volta o mandante é o time B.
  if (!m.legs.length || m.legs.some(l => l[0] == null || l[1] == null)) return null;
  let a = 0, b = 0;
  m.legs.forEach((l, i) => { if (i === 0) { a += l[0]; b += l[1]; } else { a += l[1]; b += l[0]; } });
  return [a, b];
}
function decidir(m) {            // quem avança: decisão manual, placar ou pênaltis
  if (m.man) return m.man;
  const t = totais(m); if (!t) return null;
  if (t[0] !== t[1]) return t[0] > t[1] ? m.a : m.b;
  if (m.pen && m.pen[0] != null && m.pen[1] != null && m.pen[0] !== m.pen[1]) return m.pen[0] > m.pen[1] ? m.a : m.b;
  return null;
}
function resumo(m) {
  const t = totais(m);
  if (m.man || !t) return "definido sem placar";
  return `${t[0]}×${t[1]}${m.legs.length > 1 ? " (agregado)" : ""}${m.pen ? ` · pên. ${m.pen[0]}–${m.pen[1]}` : ""}`;
}
function simularJogo(r, p) {
  const m = { a: E[r][2 * p], b: E[r][2 * p + 1], legs: Array.from({ length: pernas(r) }, () => [gols(), gols()]), pen: null, man: null, w: null };
  const t = totais(m); if (t[0] === t[1]) m.pen = penaltis();
  m.w = decidir(m); C.res[r][p] = m;
}
function simularAnel(r) { for (let p = 0; p < R[r].count / 2; p++) if (!venc(r, p) && pronto(r, p)) simularJogo(r, p); }
function simularFase() {
  derivar(); const r = faseAtual(); if (r < 0) return;
  simularAnel(r); atualizar();
}
function simularTudo() {
  for (let k = 0; k <= R.length; k++) { derivar(); const r = faseAtual(); if (r < 0) break; simularAnel(r); }
  atualizar();
}

/* ---------- Geometria do círculo ---------- */
function geometria() { return C.cfg.visual === "classico" ? geoClassica() : geoCircular(); }
const COL_W = 170, LIN_H = 36;   // visual clássico: largura de cada fase e altura de cada linha
function geoClassica() {         // árvore tradicional: uma coluna por fase, da esquerda para a direita
  const pre = R[0].tipo === "prelim", mi = pre ? 1 : 0, S = pre ? 2 * LIN_H : LIN_H, topo = 70, esq = 90;
  const Y = [];
  Y[mi] = Array.from({ length: R[mi].count }, (_, j) => topo + j * S);
  if (pre) Y[0] = Array.from({ length: R[0].count }, (_, i) => Y[1][NUL[i >> 1]] + (i & 1 ? LIN_H / 2 : -LIN_H / 2));   // cada par da preliminar fica ao lado da vaga que alimenta
  for (let r = mi + 1; r < R.length; r++) Y[r] = Array.from({ length: R[r].count }, (_, i) => (Y[r - 1][2 * i] + Y[r - 1][2 * i + 1]) / 2);
  const X = R.map((_, r) => esq + r * COL_W), ult = R.length - 1;
  const champ = { x: X[ult] + COL_W, y: (Y[ult][0] + Y[ult][1]) / 2 };
  return { visual: "classico", X, Y, W: champ.x + 120, H: topo + R[mi].count * S + 30, champ };
}
function geoCircular() {
  const dentro = [];             // raios do anel mais interno (final) para fora
  for (let k = 0; k < R.length; k++) {
    const a = R[R.length - 1 - k];
    const pelaContagem = a.count * ESPACO / (2 * Math.PI);                      // cabe todo mundo sem encostar
    const padrao = k < BASE_RAIOS.length ? BASE_RAIOS[k] : dentro[k - 1] + 130;
    dentro.push(Math.max(padrao, pelaContagem, k ? dentro[k - 1] + 60 : 0));       // nunca deixa um anel colado no anterior
  }
  const raios = R.map((_, r) => dentro[R.length - 1 - r]);
  const W = 2 * (Math.max(...raios) + 90);
  return { visual: "circular", raios, W, H: W, cx: W / 2, cy: W / 2, champ: { x: W / 2, y: W / 2 } };
}
function pos(r, i) {
  if (G.visual === "classico") return { x: G.X[r], y: G.Y[r][i] };
  // circular — mesma convenção da Copa antiga: posição i do anel, a partir da direita, no sentido horário
  const ang = i * 2 * Math.PI / R[r].count;
  return { x: G.cx + G.raios[r] * Math.cos(ang), y: G.cy + G.raios[r] * Math.sin(ang) };
}

/* ---------- Desenho da arena ---------- */
let ARENA = { chave: "", nos: [], gs: [], nb: [], gb: [], camp: "" };   // elementos já criados (para atualizar sem recriar)
function desenharArena() {
  G = geometria();
  const chave = [G.visual, R.map(a => a.count).join("."), NUL.join(",")].join("|");     // muda só se a estrutura mudar
  if (chave !== ARENA.chave || !$("arena").querySelector(".no")) montarArena(chave);
  atualizarArena();
}
function montarArena(chave) {    // cria escudos e linhas UMA vez; o conteúdo é preenchido em atualizarArena()
  const arena = $("arena"), nb = [], gb = []; let nn = 0, ng = 0;
  arena.style.width = G.W + "px"; arena.style.height = G.H + "px";
  $("svg").setAttribute("width", G.W); $("svg").setAttribute("height", G.H);

  let nos = "", linhas = "";
  const f = n => n.toFixed(1), pts = a => a.map(q => f(q.x) + "," + f(q.y)).join(" ");
  R.forEach((a, r) => {
    nb[r] = nn; gb[r] = ng;
    for (let i = 0; i < a.count; i++, nn++) {
      const p0 = pos(r, i);
      nos += `<div class="no espera" style="left:${f(p0.x)}px;top:${f(p0.y)}px;--c:${corAnel(r)}" data-r="${r}" data-i="${i}"></div>`;
    }
    // cada confronto: 3 traços visíveis (time A → meio, time B → meio, meio → vencedor) e UM traço largo invisível para o clique
    for (let p = 0; p < a.count / 2; p++, ng++) {
      const p1 = pos(r, 2 * p), p2 = pos(r, 2 * p + 1), classico = G.visual === "classico";
      const mx = classico ? p1.x + COL_W / 2 : (p1.x + p2.x) / 2, m0 = { x: mx, y: (p1.y + p2.y) / 2 };
      const alvo = r === R.length - 1 ? G.champ : a.tipo === "prelim" ? pos(r + 1, NUL[p]) : pos(r + 1, p);
      const l1 = classico ? [p1, { x: mx, y: p1.y }, m0] : [p1, m0], l2 = classico ? [p2, { x: mx, y: p2.y }, m0] : [p2, m0];
      const hit = classico ? `M${pts([p1, { x: mx, y: p1.y }, m0, { x: mx, y: p2.y }, p2]).replace(/ /g, " L")} M${pts([m0, alvo]).replace(/ /g, " L")}`
                           : `M${pts([p1, m0, p2]).replace(/ /g, " L")} M${pts([m0, alvo]).replace(/ /g, " L")}`;
      linhas += `<g class="jg" data-r="${r}" data-p="${p}"><title></title><polyline class="v l1" points="${pts(l1)}"/><polyline class="v l2" points="${pts(l2)}"/><polyline class="v dest" points="${pts([m0, alvo])}"/><path class="hit" d="${hit}"/></g>`;
    }
    if (G.visual === "classico") nos += `<div class="rot" style="left:${G.X[r]}px;top:34px;color:${corAnel(r)}">${h(a.nome)}</div>`;   // título da coluna
  });
  arena.querySelectorAll(".no, .rot").forEach(n => n.remove());
  arena.insertAdjacentHTML("beforeend", nos);
  $("svg").innerHTML = linhas;
  const cb = $("campeao"); cb.style.left = G.champ.x + "px"; cb.style.top = G.champ.y + "px";
  ARENA = { chave, nos: [...arena.querySelectorAll(".no")], gs: [...$("svg").querySelectorAll(".jg")], nb, gb, camp: "?" };
}
function atualizarArena() {      // mexe só nos escudos e linhas cujo estado mudou
  const nome = id => id ? T.get(id).nome : "?";
  R.forEach((a, r) => {
    for (let i = 0; i < a.count; i++) {
      const el = ARENA.nos[ARENA.nb[r] + i], id = E[r][i], m = C.res[r][i >> 1];
      const cls = !id ? "espera" : (m && m.w === id) ? "vence" : (m && m.w) ? "fora" : "", sig = (id || "") + "|" + cls;
      if (el._s === sig) continue;
      if (el._id !== id) {
        el._id = id; const t = id && T.get(id);
        el.title = t ? `${t.nome} (${t.uf})` : "Aguardando"; el.innerHTML = t ? esc(t) : SVG_PADRAO;
      }
      el._s = sig; el.className = "no " + cls;
    }
    for (let p = 0; p < a.count / 2; p++) {
      const g = ARENA.gs[ARENA.gb[r] + p], w = venc(r, p), ca = E[r][2 * p], cb = E[r][2 * p + 1], ok = pronto(r, p);
      const cls = `jg ${w ? "feito" : ok ? "pronto" : ""} ${w && w === ca ? "w1" : w ? "w2" : ""}`, sig = cls + "|" + ca + "|" + cb;
      if (g._s === sig) continue;
      g._s = sig; g.setAttribute("class", cls);
      g.firstChild.textContent = `${nome(ca)} × ${nome(cb)}${ok ? " — clique para ver o confronto" : ""}`;
    }
  });
  const camp = campeaoId(), btn = $("campeao");     // campeão no centro
  if (ARENA.camp !== (camp || "")) {
    ARENA.camp = camp || ""; btn.classList.toggle("tem", !!camp);
    btn.innerHTML = camp ? `${esc(T.get(camp))}<span>${h(T.get(camp).nome)}</span>` : `<span>🏆</span><span>Campeão</span>`;
    btn.title = camp ? "Clique para comemorar de novo" : "";
  }
}
function desenharLegenda() {
  $("legenda").innerHTML = R.map((a, r) => {
    const total = a.count / 2, feitos = Array.from({ length: total }, (_, p) => venc(r, p)).filter(Boolean).length;
    return `<span class="${feitos === total ? "ok" : ""}" style="--c:${corAnel(r)}"><i></i>${h(a.nome)} <b>${feitos}/${total}</b></span>`;
  }).join("");
}
function desenharStatus() {
  const camp = campeaoId(), r = faseAtual();
  if (camp) $("status").innerHTML = `🏆 Campeão: <b>${h(T.get(camp).nome)}</b>`;
  else {
    const total = R[r].count / 2, feitos = Array.from({ length: total }, (_, p) => venc(r, p)).filter(Boolean).length;
    $("status").innerHTML = `Fase atual: <b>${h(R[r].nome)}</b> · ${feitos} de ${total} confrontos decididos`;
  }
  $("b-fase").disabled = $("b-tudo").disabled = !!camp;
}
function estadoDosTimes() {      // id → "vivo" | "fora" | "camp"
  const e = new Map(), camp = campeaoId();
  C.slots.concat(C.prelim).forEach(id => { if (id) e.set(id, "vivo"); });
  C.res.forEach(rs => Object.values(rs).forEach(m => { if (m.w) e.set(m.w === m.a ? m.b : m.a, "fora"); }));
  if (camp) e.set(camp, "camp");
  return e;
}
let LISTA = "";
function desenharLista() {
  const termo = sem($("lt-busca").value.trim()), st = estadoDosTimes();
  const ids = [...st.keys()].sort((a, b) => T.get(a).nome.localeCompare(T.get(b).nome, "pt-BR") || T.get(a).uf.localeCompare(T.get(b).uf));
  const vivos = ids.filter(id => st.get(id) !== "fora").length;
  $("lt-n").textContent = `(${vivos} vivos de ${ids.length})`;
  const vis = ids.filter(id => !termo || sem(`${T.get(id).nome} ${T.get(id).uf} ${sigla(T.get(id))}`).includes(termo)), chave = vis.join("|");
  const box = $("lt");
  if (chave === LISTA && box.children.length === vis.length) {     // mesma lista: só atualiza o estado de cada time
    vis.forEach((id, k) => { const c = "titem " + st.get(id); if (box.children[k].className !== c) box.children[k].className = c; });
    return;
  }
  LISTA = chave;
  box.innerHTML = vis.map(id => { const t = T.get(id); return `<button type="button" class="titem ${st.get(id)}" data-id="${h(id)}">${esc(t)}<span>${h(t.nome)}</span><small>${h(t.uf)}</small><i></i></button>`; }).join("")
    || `<p class="dica">Nenhum time encontrado.</p>`;
}
function desenhar() { desenharArena(); desenharLegenda(); desenharStatus(); desenharLista(); }

/* ---------- Atualização geral: recalcula, confere o campeão, salva e redesenha ---------- */
function sincronizarHub(id) {    // o hub mostra o campeão da copa no cartão "Criar copa"
  try {
    if (id) localStorage.setItem(HUB_CAMPEAO, JSON.stringify({ id, nome: T.get(id).nome, uf: T.get(id).uf }));
    else localStorage.removeItem(HUB_CAMPEAO);
  } catch (e) { /* sem armazenamento */ }
}
function atualizar() {
  derivar();
  const camp = campeaoId();
  sincronizarHub(camp);
  if (camp && C.festa !== camp) { C.festa = camp; festa(camp); }   // campeão novo: comemoração
  if (!camp) C.festa = null;
  salvarLocal(); desenhar();
}

/* ---------- Interações no círculo ---------- */
function clickNo(r, i) {         // clicar no escudo faz o time avançar direto, sem placar
  const p = i >> 1, id = E[r][i];
  if (!id) return aviso("Esse time ainda não está definido.");
  if (!pronto(r, p)) return aviso("Aguarde o adversário ser definido para decidir este confronto.");
  const m = C.res[r][p];
  if (m && m.w === id) delete C.res[r][p];        // clicar de novo no vencedor desfaz
  else C.res[r][p] = { a: E[r][2 * p], b: E[r][2 * p + 1], legs: [], pen: null, man: id, w: id };
  atualizar();
}
function clickLinha(r, p) {      // clicar na linha abre o confronto (placar, pênaltis, simulação)
  if (!pronto(r, p)) return aviso("Esse confronto ainda não tem os dois times.");
  JG = { r, p, pen: false }; desenharJogo(); $("jogoDlg").showModal();
}

/* ---------- Janela do confronto ---------- */
const jogoAtual = () => C.res[JG.r][JG.p] || null;
function desenharJogo() {
  const { r, p } = JG, ida = E[r][2 * p], idb = E[r][2 * p + 1], A = T.get(ida), B = T.get(idb);
  const m = jogoAtual() || { legs: [], pen: null }, n = pernas(r);
  let linhas = "";
  for (let i = 0; i < n; i++) {
    const casa = i === 0 ? A : B, fora = i === 0 ? B : A, l = m.legs[i] || [null, null];
    const rot = n === 1 ? "Jogo único" : i === 0 ? "Jogo de ida" : "Jogo de volta";
    linhas += `<div class="perna"><small>${rot}</small><div class="pl"><span class="eq casa"><span class="nm">${h(casa.nome)}</span>${esc(casa)}</span>
      <input type="number" min="0" aria-label="Gols de ${h(casa.nome)}" data-l="${i}" data-s="0" value="${l[0] ?? ""}"><b>×</b>
      <input type="number" min="0" aria-label="Gols de ${h(fora.nome)}" data-l="${i}" data-s="1" value="${l[1] ?? ""}">
      <span class="eq">${esc(fora)}<span class="nm">${h(fora.nome)}</span></span></div></div>`;
  }
  $("jogoBox").innerHTML = `<button class="fechar" data-a="j-fechar" aria-label="Fechar">×</button>
    <div class="fase-tag" id="jogoTit">${h(R[r].nome)} · confronto ${p + 1}${n === 2 ? " · ida e volta" : ""}</div>
    <div class="duelo"><div class="lado" data-id="${h(ida)}" title="Ver ficha">${esc(A)}${h(A.nome)}<small>${h(A.uf)}</small></div><span class="vs">×</span>
      <div class="lado" data-id="${h(idb)}" title="Ver ficha">${esc(B)}${h(B.nome)}<small>${h(B.uf)}</small></div></div>
    ${linhas}<div class="pen" id="j-pen" hidden></div><div class="msg" id="j-msg"></div>
    <div class="acoes"><button class="b sim" data-a="j-sim">🎲 Simular</button>
      <button class="b" data-a="j-a">${h(sigla(A))} avança</button><button class="b" data-a="j-b">${h(sigla(B))} avança</button>
      <span class="esp"></span><button class="b perigo" data-a="j-limpar">Limpar</button></div>`;
  JG.pen = false; parcialJogo();
}
function parcialJogo() {         // atualiza só o que depende do placar (não mexe nos campos de gols, para não perder o foco)
  const { r, p } = JG, m = jogoAtual(), A = T.get(E[r][2 * p]), B = T.get(E[r][2 * p + 1]);
  const t = m && totais(m), empate = !!(t && t[0] === t[1] && !m.man);
  if (empate !== JG.pen) {
    JG.pen = empate;
    $("j-pen").hidden = !empate;
    $("j-pen").innerHTML = empate ? `<div class="perna"><small>Pênaltis</small><div class="pl"><span class="eq casa"><span class="nm">${h(A.nome)}</span>${esc(A)}</span>
      <input type="number" min="0" aria-label="Pênaltis de ${h(A.nome)}" data-pen="0" value="${m.pen?.[0] ?? ""}"><b>×</b>
      <input type="number" min="0" aria-label="Pênaltis de ${h(B.nome)}" data-pen="1" value="${m.pen?.[1] ?? ""}">
      <span class="eq">${esc(B)}<span class="nm">${h(B.nome)}</span></span></div></div>` : "";
  }
  const msg = $("j-msg");
  if (m && m.w) { msg.className = "msg ok"; msg.textContent = `Avança: ${T.get(m.w).nome} (${resumo(m)})`; }
  else if (empate) { msg.className = "msg av"; msg.textContent = m.pen && m.pen[0] != null && m.pen[0] === m.pen[1] ? "Os pênaltis não podem terminar empatados." : "Empate no agregado: informe o resultado dos pênaltis."; }
  else { msg.className = "msg"; msg.textContent = "Digite o placar, simule ou escolha quem avança."; }
}
function lerJogo() {             // lê os campos da janela e grava o resultado
  const { r, p } = JG, a = E[r][2 * p], b = E[r][2 * p + 1];
  const v = s => { const e = document.querySelector(s); return e && e.value !== "" ? Math.max(0, parseInt(e.value) || 0) : null; };
  const m = jogoAtual() || { a, b, legs: [], pen: null, man: null, w: null };
  m.a = a; m.b = b; m.man = null;
  m.legs = Array.from({ length: pernas(r) }, (_, i) => [v(`[data-l="${i}"][data-s="0"]`), v(`[data-l="${i}"][data-s="1"]`)]);
  const t = totais(m);
  m.pen = (t && t[0] === t[1]) ? [v('[data-pen="0"]'), v('[data-pen="1"]')] : null;
  m.w = decidir(m);
  const vazio = m.legs.every(l => l[0] == null && l[1] == null);
  if (vazio) delete C.res[r][p]; else C.res[r][p] = m;
  atualizar();
  if ($("jogoDlg").open) parcialJogo();
}
function acaoJogo(a) {
  const { r, p } = JG, ida = E[r][2 * p], idb = E[r][2 * p + 1];
  if (a === "j-sim") simularJogo(r, p);
  else if (a === "j-a" || a === "j-b") { const id = a === "j-a" ? ida : idb; C.res[r][p] = { a: ida, b: idb, legs: [], pen: null, man: id, w: id }; }
  else if (a === "j-limpar") delete C.res[r][p];
  atualizar();
  if ($("jogoDlg").open) desenharJogo();     // a festa do campeão pode ter fechado a janela
}

/* ---------- Ficha do time ---------- */
function campanha(id) {
  const l = [];
  if (R[0].tipo === "prelim" && C.slots.includes(id)) l.push(["Entrada", `Entrou direto na fase: ${R[1].nome}`]);
  R.forEach((a, r) => Object.entries(C.res[r]).forEach(([p, m]) => {
    if (m.a !== id && m.b !== id) return;
    const outro = T.get(m.a === id ? m.b : m.a);
    l.push([a.nome, `${m.w === id ? "✔" : "✘"} contra ${outro.nome} — ${resumo(m)}`]);
  }));
  return l;
}
function kit(rotulo, src, alt) {
  if (!src) return `<div class="kit">${h(rotulo)}<div style="cursor:default">Sem foto</div></div>`;
  return `<div class="kit">${h(rotulo)}<div data-img="${h(RAIZ + src)}"><img src="${RAIZ}${h(src)}" alt="${h(alt)}" onerror="this.replaceWith(document.createTextNode('Sem foto'))"></div></div>`;
}
async function abrirTime(id) {
  const t = { ...T.get(id), ...((await detalhes())[id] || {}) }, u = t.uniformes || {}, m = t.mascote || {}, f = t.federacao || {}, cores = (t.cores || []).map(nomeDaCor);
  const camp = campanha(id);
  $("timeBox").innerHTML = `<button class="fechar" data-a="t-fechar" aria-label="Fechar">×</button>
    <div class="ficha">${esc(t)}<div><h3>${h(t.nome)}</h3><p>${h([t.cidade, t.uf].filter(Boolean).join(" · "))}${t.fundacao ? ` · fundado em ${h(t.fundacao)}` : ""}</p>
      <p>${h(f.sigla || "")}${cores.length ? ` · ${h(cores.join(", "))}` : ""}</p></div></div>
    <div class="kits">${kit("Titular", u.titular, `${t.nome} – uniforme titular`)}${kit("Reserva", u.reserva, `${t.nome} – uniforme reserva`)}${kit(m.nome ? `Mascote: ${m.nome}` : "Mascote", m.imagem, `${t.nome} – mascote`)}</div>
    <h3>Campanha nesta copa</h3>${camp.length ? `<ul class="camp-l">${camp.map(([a, b]) => `<li><small>${h(a)}</small><span>${h(b)}</span></li>`).join("")}</ul>` : `<p class="dica">Ainda não jogou.</p>`}`;
  $("timeDlg").showModal();
}
function abrirImagem(src) { $("imgGrande").src = src; $("imgDlg").showModal(); }

/* ---------- Comemoração do campeão (fogos com as cores do time) ---------- */
const COR_PADRAO = { amarelo: "#facc15", anil: "#6366f1", azul: "#2f7de1", branco: "#ffffff", ciano: "#22d3ee", cinza: "#9ca3af", fume: "#8b949e", graxa: "#2b2b2b",
  laranja: "#f97316", lima: "#a3e635", magenta: "#e91e8c", prata: "#cbd5e1", preto: "#0a0a0a", rosa: "#f472b6", roxo: "#8b5cf6", turquesa: "#14b8a6", verde: "#22c55e", vermelho: "#ef4444" };
const cacheCor = new Map();
function hexDominante(img) {     // cor mais frequente da imagem (mesmo método do hub)
  try {
    const lado = 32, c = document.createElement("canvas"); c.width = c.height = lado;
    const ctx = c.getContext("2d", { willReadFrequently: true }); ctx.drawImage(img, 0, 0, lado, lado);
    const px = ctx.getImageData(0, 0, lado, lado).data, grupos = new Map(); let melhor = null;
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] < 128) continue;
      const k = ((px[i] >> 4) << 8) | ((px[i + 1] >> 4) << 4) | (px[i + 2] >> 4), g = grupos.get(k) || { n: 0, r: 0, g: 0, b: 0 };
      g.n++; g.r += px[i]; g.g += px[i + 1]; g.b += px[i + 2]; grupos.set(k, g);
    }
    grupos.forEach(g => { if (!melhor || g.n > melhor.n) melhor = g; });
    return melhor ? "#" + [melhor.r, melhor.g, melhor.b].map(v => Math.round(v / melhor.n).toString(16).padStart(2, "0")).join("") : null;
  } catch (e) { return null; }
}
function corHex(caminho) {       // lê o hex da imagem em cores/…; se falhar, usa a tabela pelo nome
  if (!cacheCor.has(caminho)) cacheCor.set(caminho, new Promise(ok => {
    const reserva = COR_PADRAO[nomeDaCor(caminho).toLowerCase()] || null, i = new Image();
    i.onload = () => ok(hexDominante(i) || reserva); i.onerror = () => ok(reserva);
    i.src = RAIZ + caminho;
  }));
  return cacheCor.get(caminho);
}
let fogos = null;
async function festa(id) {
  const t = { ...T.get(id), ...((await detalhes())[id] || {}) };
  if ($("jogoDlg").open) $("jogoDlg").close();
  $("festaEsc").innerHTML = esc(t); $("festaNome").textContent = t.nome; $("festaLocal").textContent = [t.cidade, t.uf].filter(Boolean).join(" · ");
  $("festa").hidden = false;
  let cores = (await Promise.all((t.cores || []).map(corHex))).filter(Boolean);
  if (!cores.length) cores = ["#da3633", "#ffffff", "#ffd700"];
  if ($("festa").hidden || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  iniciarFogos(cores);
}
function pararFogos() { if (fogos) cancelAnimationFrame(fogos); fogos = null; $("festa").hidden = true; }
function iniciarFogos(cores) {
  const cv = $("fogos"), ctx = cv.getContext("2d"), ps = [];
  cv.width = innerWidth; cv.height = innerHeight;
  if (fogos) cancelAnimationFrame(fogos);
  (function quadro() {
    ctx.fillStyle = "rgba(66,76,94,.2)"; ctx.fillRect(0, 0, cv.width, cv.height);    // rastro
    if (Math.random() < 0.05) {
      const x = Math.random() * cv.width, y = Math.random() * cv.height / 2, c = cores[rnd(cores.length)];
      for (let i = 0; i < 50; i++) { const a = Math.random() * Math.PI * 2, v = Math.random() * 6 + 2; ps.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, al: 1, c }); }
    }
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i]; p.x += p.vx; p.y += p.vy; p.vy += 0.05; p.al -= 0.015;
      if (p.al <= 0) { ps.splice(i, 1); continue; }
      ctx.globalAlpha = p.al; ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    fogos = requestAnimationFrame(quadro);
  })();
}

/* ---------- Zoom e arrasto ---------- */
function aplicarZoom() { $("arena").style.transform = `translate(${Z.x}px,${Z.y}px) scale(${Z.s})`; }
function ajustar() {             // enquadra o círculo inteiro na janela
  const vp = $("vp"), s = Math.min(vp.clientWidth / G.W, vp.clientHeight / G.H) * 0.98;
  Z = { s, x: (vp.clientWidth - G.W * s) / 2, y: (vp.clientHeight - G.H * s) / 2 }; aplicarZoom();
}
function zoomEm(cx, cy, f) {     // zoom em torno de um ponto da tela
  const r = $("vp").getBoundingClientRect(), mx = cx - r.left, my = cy - r.top, s2 = Math.min(Math.max(Z.s * f, 0.03), 3);
  f = s2 / Z.s; Z.x = mx - (mx - Z.x) * f; Z.y = my - (my - Z.y) * f; Z.s = s2; aplicarZoom();
}
function ligarZoom() {
  const vp = $("vp"), dedos = new Map();
  const centro = () => { const [a, b] = [...dedos.values()]; return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) || 1 }; };
  vp.addEventListener("pointerdown", e => { dedos.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, mov: false }); });
  vp.addEventListener("pointermove", e => {
    const d = dedos.get(e.pointerId); if (!d) return;
    if (dedos.size === 2) {                    // pinça (celular): zoom + deslocamento
      const antes = centro(); d.x = e.clientX; d.y = e.clientY; const depois = centro();
      zoomEm(depois.x, depois.y, depois.d / antes.d); Z.x += depois.x - antes.x; Z.y += depois.y - antes.y; aplicarZoom(); vp._arrastou = true; return;
    }
    if (!d.mov && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 5) return;     // ainda é um clique
    if (!d.mov) { d.mov = true; vp._arrastou = true; vp.setPointerCapture(e.pointerId); vp.classList.add("arrastando"); }
    Z.x += e.clientX - d.x; Z.y += e.clientY - d.y; d.x = e.clientX; d.y = e.clientY; aplicarZoom();
  });
  const soltar = e => { dedos.delete(e.pointerId); if (!dedos.size) { vp.classList.remove("arrastando"); setTimeout(() => vp._arrastou = false, 0); } };
  vp.addEventListener("pointerup", soltar); vp.addEventListener("pointercancel", soltar);
  let rodaF = 1, rodaP = null, rodaQ = 0;      // a roda dispara muitos eventos: aplica o zoom uma vez por quadro
  vp.addEventListener("wheel", e => {
    e.preventDefault(); rodaF *= e.deltaY < 0 ? 1.12 : 1 / 1.12; rodaP = { x: e.clientX, y: e.clientY };
    if (!rodaQ) rodaQ = requestAnimationFrame(() => { zoomEm(rodaP.x, rodaP.y, rodaF); rodaF = 1; rodaQ = 0; });
  }, { passive: false });
  $("arena").addEventListener("click", e => {
    if (vp._arrastou) return;
    const n = e.target.closest(".no"); if (n) return clickNo(+n.dataset.r, +n.dataset.i);
    const j = e.target.closest(".jg"); if (j) return clickLinha(+j.dataset.r, +j.dataset.p);
    if (e.target.closest(".campeao.tem")) festa(campeaoId());
  });
}

/* ---------- Save ---------- */
function paraJSON() { return { versao: 1, cfg: C.cfg, prelim: C.prelim, slots: C.slots, res: C.res, festa: C.festa }; }
function deJSON(o) {
  if (!o || !Array.isArray(o.slots) || !Array.isArray(o.prelim) || !o.cfg) throw new Error("Arquivo de save inválido.");
  const ids = [...o.prelim, ...o.slots.filter(x => x != null)], falta = ids.filter(id => !T.has(id));
  if (falta.length) throw new Error("A base não tem mais estes times: " + falta.slice(0, 5).join(", "));
  if (ids.length < 2 || new Set(ids).size !== ids.length) throw new Error("Arquivo de save inválido.");
  const { B, m } = estrutura(ids.length);
  if (o.slots.length !== B || o.prelim.length !== 2 * m) throw new Error("Arquivo de save inválido.");
  C = { cfg: { ida: !!o.cfg.ida, finalUnico: !!o.cfg.finalUnico, sorteio: o.cfg.sorteio || "aleatorio", visual: o.cfg.visual === "classico" ? "classico" : "circular" }, prelim: o.prelim, slots: o.slots, res: [], festa: o.festa || null };
  preparar(o.res);
}
function preparar(res) {         // monta os anéis e confere os resultados guardados
  R = montarAneis(C.prelim.length + C.slots.filter(x => x != null).length);
  C.res = R.map((_, r) => (res && res[r] && typeof res[r] === "object") ? res[r] : {});
  derivar();
}
let tSalvar = 0;
function gravarLocal() { clearTimeout(tSalvar); tSalvar = 0; if (!C) return; try { localStorage.setItem(LOCAL, JSON.stringify(paraJSON())); } catch (e) { /* sem armazenamento */ } }
function salvarLocal() { clearTimeout(tSalvar); tSalvar = setTimeout(gravarLocal, 400); }
addEventListener("pagehide", () => { if (tSalvar) gravarLocal(); });
function baixar() {
  const a = document.createElement("a"), n = C.prelim.length + C.slots.filter(x => x != null).length;
  a.href = URL.createObjectURL(new Blob([JSON.stringify(paraJSON())], { type: "application/json" }));
  a.download = `copa-${n}-times.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  aviso("Save baixado.");
}
function abrirArquivo() {
  const i = document.createElement("input"); i.type = "file"; i.accept = ".json,application/json";
  i.onchange = () => {
    const f = i.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => { try { deJSON(JSON.parse(r.result)); salvarLocal(); sincronizarHub(campeaoId()); entrarCopa(); aviso("Save carregado."); } catch (e) { aviso(e.message || "Não consegui ler esse save.", true); } };
    r.readAsText(f);
  };
  i.click();
}

/* ---------- Questionário (adapta-se às respostas) ---------- */
const pool = () => TIMES.filter(t => Q.reg.includes(t.regiao));
const qTotal = () => Q.modo === "manual" ? Q.escolha.size : Q.n;
function qRecalcular() {         // depois de mudar as regiões: mantém só o que ainda existe e ajusta o número
  const ids = new Set(pool().map(t => t.id));
  Q.escolha = new Set([...Q.escolha].filter(id => ids.has(id)));
  Q.n = Math.min(Math.max(Q.n || 2, 2), Math.max(ids.size, 2));
}
function descricao(n) {          // resumo do formato para o número de times escolhido
  const { B, m, byes } = estrutura(n), fases = montarAneis(n).map(a => `${a.nome} (${a.count})`).join(" → ");
  const prelim = m > 0 ? `${n} não é potência de 2: ${2 * m} times jogam uma fase preliminar (${m} jogos) e ${byes} entram direto na fase de ${B}. ` : `${n} é potência de 2: não precisa de fase preliminar. `;
  return `<p>${n} times · ${n - 1} confrontos até o campeão.</p><p>${prelim}</p><p class="fases">${h(fases)}</p>`;
}
function questionario() {
  C = null; $("chip").hidden = true;
  if (!Q) { Q = { reg: [...new Set(TIMES.map(t => t.regiao))], modo: "sorteio", n: TIMES.length, escolha: new Set(), busca: "", sorteio: "aleatorio", visual: "circular", ida: false, finalUnico: true }; qRecalcular(); Q.n = pool().length; }
  const regs = [...new Set(TIMES.map(t => t.regiao))];
  $("app").innerHTML = `<div class="quest">
   <section class="card"><h2><span class="n">1</span>De onde vêm os times?</h2>
    <div class="opts">${regs.map(r => `<label class="opt"><input type="checkbox" data-reg="${h(r)}" ${Q.reg.includes(r) ? "checked" : ""}> ${h(REG[r] || r)} <small>(${TIMES.filter(t => t.regiao === r).length})</small></label>`).join("")}</div>
    <p class="dica" id="q-pool"></p></section>
   <section class="card"><h2><span class="n">2</span>Quantos times e quais?</h2>
    <div class="opts"><label class="opt"><input type="radio" name="q-modo" value="sorteio" ${Q.modo === "sorteio" ? "checked" : ""}> Sortear a quantidade</label>
      <label class="opt"><input type="radio" name="q-modo" value="manual" ${Q.modo === "manual" ? "checked" : ""}> Escolher os times manualmente</label></div>
    <div id="q-nw"><div class="campos"><label>Quantidade de times<input type="number" id="q-n" min="2" value="${Q.n}"></label></div><div class="linha" id="q-pre"></div></div>
    <div class="board" id="q-manual" hidden><div class="board-h"><input id="q-busca" type="search" placeholder="Buscar time" aria-label="Buscar time" value="${h(Q.busca)}">
      <button class="b peq" data-a="q-marcar">Marcar listados</button><button class="b peq" data-a="q-desmarcar">Desmarcar listados</button><button class="b peq" data-a="q-limpar">Limpar tudo</button>
      <span class="dica" id="q-sel"></span></div><div class="board-l" id="q-chips"></div></div></section>
   <section class="card"><h2><span class="n">3</span>Qual visual de chaveamento?</h2>
    <div class="opts"><label class="opt"><input type="radio" name="q-vis" value="circular" ${Q.visual === "circular" ? "checked" : ""}> ◎ Circular especial</label>
      <label class="opt"><input type="radio" name="q-vis" value="classico" ${Q.visual === "classico" ? "checked" : ""}> ▤ Clássico (árvore em colunas)</label></div>
    <p class="dica">Os dois mostram a mesma copa — dá para trocar de visual a qualquer momento, no botão da barra de ações.</p></section>
   <section class="card"><h2><span class="n">4</span>Como sortear o chaveamento?</h2>
    <div class="campos"><label>Sorteio<select id="q-so"><option value="aleatorio">Totalmente aleatório</option><option value="separar">Espalhar times do mesmo estado pelo círculo</option><option value="base">Ordem da base (alfabética)</option></select></label></div>
    <p class="dica">“Espalhar” faz times do mesmo estado tenderem a só se encontrar nas fases finais. Em “Ordem da base”, vizinhos no círculo são vizinhos na lista.</p></section>
   <section class="card"><h2><span class="n">5</span>Formato dos jogos</h2>
    <div class="campos"><label>Confrontos<select id="q-ida"><option value="unico">Jogo único</option><option value="ida">Ida e volta</option></select></label>
      <label class="linha-chk" id="q-fuw" hidden><input type="checkbox" id="q-fu" ${Q.finalUnico ? "checked" : ""}> Final em jogo único</label></div>
    <p class="dica">Empate (no jogo único ou no agregado) vai para os pênaltis. Dá para lançar o placar de cada confronto clicando na linha dele no círculo.</p></section>
   <section class="card"><div id="q-res"></div><button class="b verde" id="q-go" data-a="q-go">Começar copa</button></section></div>`;
  $("q-so").value = Q.sorteio; $("q-ida").value = Q.ida ? "ida" : "unico";
  qParciais();
}
function qListados() {           // times do universo que passam pela busca
  const termo = sem(Q.busca.trim());
  return pool().filter(t => !termo || sem(`${t.nome} ${t.uf} ${sigla(t)}`).includes(termo));
}
function qChips() {
  $("q-chips").innerHTML = qListados().map(t => `<div class="tchip${Q.escolha.has(t.id) ? " sel" : ""}" tabindex="0" role="button" aria-pressed="${Q.escolha.has(t.id)}" data-id="${h(t.id)}">${esc(t)}<span>${h(t.nome)}</span><small>${h(t.uf)}</small></div>`).join("") || `<p class="dica">Nenhum time encontrado.</p>`;
  $("q-sel").textContent = `${Q.escolha.size} selecionado${Q.escolha.size === 1 ? "" : "s"}`;
}
function qParciais() {           // redesenha só o que depende das respostas anteriores (não mexe nos campos que a pessoa está digitando)
  if (!$("q-pool")) return;
  const pn = pool().length;
  $("q-pool").textContent = `${pn} time${pn === 1 ? "" : "s"} nas regiões marcadas.`;
  $("q-nw").hidden = Q.modo === "manual"; $("q-manual").hidden = Q.modo !== "manual"; $("q-fuw").hidden = !Q.ida;
  $("q-pre").innerHTML = [`<button class="b peq" data-a="q-n" data-v="${pn}">Todos (${pn})</button>`, ...[128, 64, 32, 16, 8].filter(x => x < pn).map(x => `<button class="b peq" data-a="q-n" data-v="${x}">${x}</button>`)].join("");
  if (Q.modo === "manual") qChips();
  qRes();
}
function qErros() {
  const e = [], pn = pool().length, n = qTotal();
  if (pn < 2) e.push("Marque regiões que somem pelo menos 2 times.");
  else if (n < 2) e.push(Q.modo === "manual" ? "Marque pelo menos 2 times." : "Use pelo menos 2 times.");
  if (Q.modo === "sorteio" && n > pn) e.push(`Só há ${pn} times nas regiões marcadas.`);
  return e;
}
function qRes() {
  const e = qErros();
  $("q-res").innerHTML = e.length ? `<ul class="erros">${e.map(x => `<li>${h(x)}</li>`).join("")}</ul>` : descricao(qTotal());
  $("q-go").disabled = e.length > 0;
}
function qPick(c) {
  const id = c.dataset.id, marcar = !Q.escolha.has(id);
  marcar ? Q.escolha.add(id) : Q.escolha.delete(id);
  c.classList.toggle("sel", marcar); c.setAttribute("aria-pressed", marcar);
  $("q-sel").textContent = `${Q.escolha.size} selecionado${Q.escolha.size === 1 ? "" : "s"}`; qRes();
}
function comecar() {
  const ids = Q.modo === "manual" ? [...Q.escolha] : embaralhar(pool().map(t => t.id)).slice(0, Q.n);
  const { prelim, slots } = montarSorteio(ids, Q.sorteio);
  C = { cfg: { ida: Q.ida, finalUnico: Q.ida && Q.finalUnico, sorteio: Q.sorteio, visual: Q.visual }, prelim, slots, res: [], festa: null };
  preparar(); sincronizarHub(null); salvarLocal(); entrarCopa();
}

/* ---------- Tela da copa ---------- */
function entrarCopa() {
  pararFogos();
  const n = C.prelim.length + C.slots.filter(x => x != null).length;
  $("chip").hidden = false; $("chip").textContent = `${n} times`;
  $("app").innerHTML = `<div class="layout">
    <aside class="card lista"><h3>Times na copa <small id="lt-n" class="dica"></small></h3>
      <input id="lt-busca" type="search" placeholder="Buscar time" aria-label="Buscar time"><div class="lista-l" id="lt"></div></aside>
    <section>
      <div class="acoes"><button class="b sim" id="b-fase" data-a="sim-fase">⏭ Simular fase</button><button class="b sim" id="b-tudo" data-a="sim-tudo">⏩ Simular tudo</button>
        <button class="b" data-a="visual" id="b-vis"></button><button class="b" data-a="sortear">🎲 Sortear de novo</button><button class="b" data-a="limpar">↺ Limpar resultados</button><span class="esp"></span>
        <button class="b" data-a="baixar">💾 Baixar save</button><button class="b" data-a="abrir">📂 Abrir save</button><button class="b perigo" data-a="nova">⚙ Nova copa</button></div>
      <p id="status"></p><div class="legenda" id="legenda"></div>
      <div class="vp" id="vp"><div class="zoom"><button data-a="z+" aria-label="Aproximar">+</button><button data-a="z-" aria-label="Afastar">−</button><button data-a="z0" aria-label="Centralizar" title="Centralizar">⌖</button></div>
        <div id="arena"><svg id="svg"></svg><button type="button" class="campeao" id="campeao"></button></div></div>
      <p class="dica">Clique na <b>linha</b> de um confronto para lançar o placar, simular ou ver os times. Clique no <b>escudo</b> para fazê-lo avançar direto (clique de novo para desfazer). Arraste para mover; roda do mouse ou pinça para o zoom.</p>
    </section></div>`;
  ligarZoom();
  $("lt-busca").addEventListener("input", desenharLista);
  desenhar(); rotuloVisual(); ajustar();
}
function rotuloVisual() { $("b-vis").textContent = C.cfg.visual === "classico" ? "◎ Ver circular" : "▤ Ver clássico"; }

/* ---------- Ações dos botões ---------- */
function acao(a, v) {
  switch (a) {
    case "q-go": return comecar();
    case "q-n": Q.n = +v; $("q-n").value = Q.n; return qParciais();
    case "q-marcar": qListados().forEach(t => Q.escolha.add(t.id)); return qParciais();
    case "q-desmarcar": qListados().forEach(t => Q.escolha.delete(t.id)); return qParciais();
    case "q-limpar": Q.escolha.clear(); return qParciais();
    case "visual": C.cfg.visual = C.cfg.visual === "classico" ? "circular" : "classico"; salvarLocal(); desenhar(); rotuloVisual(); return ajustar();
    case "sim-fase": return simularFase();
    case "sim-tudo": return simularTudo();
    case "sortear": {
      if (C.res.some(rs => Object.keys(rs).length) && !confirm("Sortear de novo apaga os resultados desta copa. Continuar?")) return;
      const ids = C.slots.concat(C.prelim).filter(Boolean), { prelim, slots } = montarSorteio(ids, C.cfg.sorteio);
      C.prelim = prelim; C.slots = slots; C.festa = null; preparar(); return atualizar();
    }
    case "limpar":
      if (C.res.some(rs => Object.keys(rs).length) && !confirm("Apagar todos os resultados e manter o sorteio?")) return;
      C.res = R.map(() => ({})); C.festa = null; return atualizar();
    case "baixar": return baixar();
    case "abrir": return abrirArquivo();
    case "nova":
      if (C && !confirm("Começar uma nova copa? A atual será substituída (baixe o save antes se quiser guardá-la).")) return;
      clearTimeout(tSalvar); try { localStorage.removeItem(LOCAL); } catch (e) { /* ignora */ }
      sincronizarHub(null); pararFogos(); return questionario();
    case "z+": case "z-": case "z0": {
      const r = $("vp").getBoundingClientRect();
      return a === "z0" ? ajustar() : zoomEm(r.left + r.width / 2, r.top + r.height / 2, a === "z+" ? 1.25 : 0.8);
    }
    case "j-sim": case "j-a": case "j-b": case "j-limpar": return acaoJogo(a);
    case "j-fechar": return $("jogoDlg").close();
    case "t-fechar": return $("timeDlg").close();
    case "festa-fechar": return pararFogos();
  }
}
document.addEventListener("click", e => {
  const b = e.target.closest("[data-a]"); if (b && !b.disabled) return acao(b.dataset.a, b.dataset.v);
  const c = e.target.closest("#q-chips .tchip"); if (c) return qPick(c);
  const t = e.target.closest(".titem, .lado"); if (t) return abrirTime(t.dataset.id);
  const im = e.target.closest("[data-img]"); if (im) return abrirImagem(im.dataset.img);
});
document.addEventListener("keydown", e => {
  if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches("#q-chips .tchip")) { e.preventDefault(); qPick(e.target); }
  if (e.key === "Escape" && !$("festa").hidden) pararFogos();
});
document.addEventListener("input", e => { if (e.target.id === "q-busca") { Q.busca = e.target.value; qChips(); } });
document.addEventListener("change", e => {
  const el = e.target, d = el.dataset;
  if (el.closest("#jogoDlg")) return (d.l != null || d.pen != null) ? lerJogo() : null;
  if (!Q || C) return;
  if (d.reg) {                           // regiões mudaram: se estava em "Todos", continua em "Todos"
    const todos = Q.n >= pool().length;
    Q.reg = el.checked ? [...Q.reg, d.reg] : Q.reg.filter(r => r !== d.reg);
    qRecalcular(); if (todos && pool().length >= 2) Q.n = pool().length;
    $("q-n").value = Q.n; qParciais();
  }
  else if (el.name === "q-modo") { Q.modo = el.value; qParciais(); }
  else if (el.name === "q-vis") Q.visual = el.value;
  else if (el.id === "q-n") { Q.n = Math.min(Math.max(parseInt(el.value) || 2, 2), Math.max(pool().length, 2)); el.value = Q.n; qRes(); }
  else if (el.id === "q-so") Q.sorteio = el.value;
  else if (el.id === "q-ida") { Q.ida = el.value === "ida"; qParciais(); }
  else if (el.id === "q-fu") Q.finalUnico = el.checked;
});
for (const id of ["jogoDlg", "timeDlg", "imgDlg"]) $(id).addEventListener("click", e => { if (e.target === $(id)) $(id).close(); });   // clique fora fecha

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
  try { const salvo = localStorage.getItem(LOCAL); if (salvo) { deJSON(JSON.parse(salvo)); sincronizarHub(campeaoId()); return entrarCopa(); } } catch (e) { /* save local inválido: recomeça */ }
  questionario();
})();
