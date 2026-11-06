"""Statut ODD (js/fiches.js) : feu tricolore et annee estimee d'atteinte de la cible."""

import json
import subprocess

from .conftest import DOSSIER_TESTS, NODE, avec_node

FICHES = DOSSIER_TESTS.parent.parent / "js" / "fiches.js"


def situation(code, annees, valeurs):
    script = (FICHES.read_text(encoding="utf-8")
              + f";console.log(JSON.stringify(situationOdd({json.dumps(code)}, {annees}, {valeurs})))")
    sortie = subprocess.run([NODE, "-e", script], capture_output=True, text=True, encoding="utf-8", check=True)
    return json.loads(sortie.stdout)


@avec_node
def test_mortalite_loin_mais_en_progres():
    s = situation("SH.DYN.MORT", [2015, 2020], [100, 75])  # cible 25 : -5 par an -> 2030
    assert (s["statut"], s["tendance"], s["anneeCible"]) == ("loin", "progres", 2030)


@avec_node
def test_electricite_en_chemin():
    s = situation("EG.ELC.ACCS.ZS", [2018, 2023], [60, 70])  # cible 100 : +2 par an -> 2038
    assert (s["statut"], s["anneeCible"]) == ("proche", 2038)


@avec_node
def test_cible_atteinte_et_recul():
    assert situation("SG.GEN.PARL.ZS", [2018, 2023], [55, 52])["statut"] == "atteint"
    assert situation("SH.STA.MMRT", [2018, 2023], [400, 420])["tendance"] == "recul"


@avec_node
def test_indicateur_sans_cible():
    assert situation("SP.POP.TOTL", [2020], [1]) is None
