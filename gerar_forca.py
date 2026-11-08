#!/usr/bin/env python3
"""Gera o campo "forca" (1 a 1000) para cada time do times.json.

Uso:
  python gerar_forca.py times.json                      # gera forca (semente 2026) e grava forca.csv
  python gerar_forca.py times.json --semente 7          # outra variação
  python gerar_forca.py times.json --preservar          # mantém forcas já existentes, só preenche quem não tem
  python gerar_forca.py times.json --aplicar forca.csv  # grava no times.json as forcas que você ajustou à mão no CSV

Cálculo: forca = base da série + bônus do estado + variação pequena (semente).
Depois, a média de cada estado é ajustada (só para baixo, o mínimo necessário) para
respeitar a ordem ORDEM_ESTADOS, e valores repetidos são separados em 1 ponto.
"""
import argparse, csv, json, random, statistics, sys

BASE_SERIE = {"A": 800, "B": 650, "C": 520, "D": 380}   # centro de cada série
BONUS_MAX = 40          # SP recebe +40, o último da ordem recebe -40 (linear)
RUIDO = 25              # variação aleatória de -25 a +25 por time
FOLGA_MEDIAS = 1.5      # diferença mínima entre as médias de estados vizinhos na ordem
ORDEM_ESTADOS = ["SP", "RJ", "MG", "RS", "PR", "SC", "BA", "GO", "CE", "PA", "PE", "AL", "MT", "AM",
                 "SE", "PB", "MA", "RN", "DF", "PI", "ES", "AC", "TO", "MS", "RO", "AP", "RR"]


def calcular(times, semente, preservar):
    rng = random.Random(semente)
    n = len(ORDEM_ESTADOS) - 1
    bonus = {uf: BONUS_MAX - 2 * BONUS_MAX * i / n for i, uf in enumerate(ORDEM_ESTADOS)}
    faltam = {t["uf"] for t in times} - set(ORDEM_ESTADOS)
    if faltam:
        sys.exit(f"UFs fora da ordem informada: {sorted(faltam)}")
    # ruído sorteado em ordem fixa (por id), assim a mesma semente sempre dá o mesmo resultado
    bruto = {}
    for t in sorted(times, key=lambda x: x["id"]):
        bruto[t["id"]] = BASE_SERIE[t["serie"]] + bonus[t["uf"]] + rng.uniform(-RUIDO, RUIDO)
    fixos = {t["id"]: t["forca"] for t in times if preservar and "forca" in t}
    ids = sorted(bruto)
    uf_de = {t["id"]: t["uf"] for t in times}
    desloc = {uf: 0.0 for uf in ORDEM_ESTADOS}

    def atribuir():
        """Arredonda, separa empates (empurrando para baixo) e respeita os valores fixos."""
        ini = {i: min(1000, max(1, round(bruto[i] + desloc[uf_de[i]]))) for i in ids if i not in fixos}
        usados, forca = set(fixos.values()), dict(fixos)
        for i in sorted(ini, key=lambda x: (-ini[x], x)):
            v = ini[i]
            while v in usados:
                v -= 1
            usados.add(v)
            forca[i] = v
        return forca

    # a média de cada estado deve seguir a ordem; ajusta só para baixo, o mínimo necessário, e repete
    # porque a separação de empates mexe um pouco nos valores
    for _ in range(100):
        forca = atribuir()
        medias = {uf: statistics.mean(forca[t["id"]] for t in times if t["uf"] == uf) for uf in ORDEM_ESTADOS}
        teto, ok = float("inf"), True
        for uf in ORDEM_ESTADOS:
            alvo = min(medias[uf], teto - FOLGA_MEDIAS)
            if alvo < medias[uf]:
                desloc[uf] += alvo - medias[uf]
                ok = False
            teto = alvo
        if ok:
            break
    return forca, desloc


def gravar(caminho, dados, forca):
    novos = []
    for t in dados["times"]:
        n = {}
        for k, v in t.items():
            if k == "forca":
                continue
            n[k] = v
            if k == "serie":
                n["forca"] = forca[t["id"]]
        if "forca" not in n:
            n["forca"] = forca[t["id"]]
        novos.append(n)
    dados["times"] = novos
    with open(caminho, "w", encoding="utf-8", newline="") as f:
        f.write(json.dumps(dados, ensure_ascii=False, indent=2).replace("\n", "\r\n"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("times_json")
    ap.add_argument("--semente", type=int, default=2026)
    ap.add_argument("--preservar", action="store_true")
    ap.add_argument("--aplicar", metavar="CSV")
    ap.add_argument("--saida-csv", default="forca.csv")
    a = ap.parse_args()
    with open(a.times_json, encoding="utf-8") as f:
        dados = json.load(f)
    times = dados["times"]
    if a.aplicar:
        with open(a.aplicar, encoding="utf-8-sig", newline="") as f:
            lidos = {r["id"]: int(r["forca"]) for r in csv.DictReader(f, delimiter=";")}
        ids = {t["id"] for t in times}
        if set(lidos) != ids:
            sys.exit(f"O CSV precisa ter os mesmos {len(ids)} ids do times.json (faltam {sorted(ids - set(lidos))[:5]}, sobram {sorted(set(lidos) - ids)[:5]}).")
        fora = [i for i, v in lidos.items() if not 1 <= v <= 1000]
        if fora:
            sys.exit(f"Forca fora de 1 a 1000: {fora[:10]}")
        gravar(a.times_json, dados, lidos)
        print(f"{len(lidos)} forcas aplicadas ao {a.times_json}")
        return
    forca, desloc = calcular(times, a.semente, a.preservar)
    gravar(a.times_json, dados, forca)
    with open(a.saida_csv, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(["id", "nome", "uf", "serie", "forca"])
        for t in sorted(times, key=lambda x: -forca[x["id"]]):
            w.writerow([t["id"], t["nome"], t["uf"], t["serie"], forca[t["id"]]])
    print(f"forca gravada em {a.times_json} e tabela em {a.saida_csv}")
    for uf in ORDEM_ESTADOS:
        ts = [forca[t["id"]] for t in times if t["uf"] == uf]
        aj = f" (ajuste {desloc[uf]:+.0f})" if abs(desloc[uf]) >= 0.5 else ""
        print(f"{uf}: média {statistics.mean(ts):6.1f}{aj}")


if __name__ == "__main__":
    main()
