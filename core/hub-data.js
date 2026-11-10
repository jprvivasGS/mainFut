// Contrato de dados entre os sites. No GitHub Pages todos os projetos de
// jprvivasgs.github.io (inclusive /mainFut/) compartilham o localStorage, então este arquivo é a
// única "ponte" entre eles. Chaves (o prefixo "hub:" é adicionado sozinho):
//   campeonato:progresso      { concluidas, total }
//   campeonato:classificados  [{ id, nome, uf, regiao }]   (G4 de cada região)
//   campeonato:campeao        { id, nome, uf }           (campeão dos playoffs)
//   copa:campeao            { id, nome, uf }
const HubData = {
    prefixo: 'hub:',
    get(chave, padrao = null) {
        try {
            const v = localStorage.getItem(this.prefixo + chave);
            return v === null ? padrao : JSON.parse(v);
        } catch (e) { return padrao; }
    },
    set(chave, valor) {
        try { localStorage.setItem(this.prefixo + chave, JSON.stringify(valor)); return true; }
        catch (e) { return false; }
    },
    remove(chave) {
        try { localStorage.removeItem(this.prefixo + chave); } catch (e) { /* ignora */ }
    }
};
