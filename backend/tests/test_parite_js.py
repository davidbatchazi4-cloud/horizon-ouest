"""Parite Python / JavaScript.

Le site calcule dans le navigateur (js/donnees.js) quand le serveur n'est pas lance,
et en Python (backend/calculs.py) quand il l'est. Les deux doivent donner exactement
les memes resultats : on execute les deux versions sur les memes donnees reelles.
"""

import pytest

from backend import calculs
from backend.catalogue import trouver_indicateur

from .conftest import appeler_js, avec_node, egaux, observations

CODES = ["SH.IMM.MEAS", "SP.DYN.LE00.IN", "IT.NET.USER.ZS", "SP.POP.TOTL", "SH.STA.MMRT", "SE.PRM.CMPT.ZS"]
PAYS = ["CIV", "GHA", "SEN", "NGA", "SSF"]

pytestmark = avec_node


def _jeu(code):
    obs = observations(code)
    annees, series = calculs.construire_series(obs, PAYS)
    return obs, annees, series, trouver_indicateur(code)


@pytest.mark.parametrize("code", CODES)
def test_construire_series(code):
    obs, annees, series, _ = _jeu(code)
    [js] = appeler_js([{"fonction": "construireSeries", "args": [obs, PAYS]}])
    assert js["annees"] == annees
    assert egaux(js["series"], series)


@pytest.mark.parametrize("code", CODES)
def test_statistiques_prevision_ruptures(code):
    _, annees, series, indic = _jeu(code)
    fmt = indic["format"]
    appels, attendus = [], []
    for valeurs in series.values():
        appels += [
            {"fonction": "calculerStats", "args": [annees, valeurs, fmt]},
            {"fonction": "prevoir", "args": [annees, valeurs, 5]},
            {"fonction": "detecterRuptures", "args": [annees, valeurs, fmt]},
        ]
        attendus += [
            calculs.calculer_stats(annees, valeurs, fmt),
            calculs.prevoir(annees, valeurs, 5),
            calculs.detecter_ruptures(annees, valeurs, fmt),
        ]
    resultats_js = appeler_js(appels)
    for appel, js, py in zip(appels, resultats_js, attendus):
        assert egaux(js, py), f"{code} {appel['fonction']} : JS={js} / Python={py}"


@pytest.mark.parametrize("mode", ["brut", "base100", "ecart"])
@pytest.mark.parametrize("code", CODES)
def test_modes_de_calcul(code, mode):
    _, annees, series, indic = _jeu(code)
    reference = series["SSF"] if mode == "ecart" else None
    py_series, py_indic = calculs.transformer_series(series, indic, mode, reference)
    [js] = appeler_js([{"fonction": "transformerSeries", "args": [annees, series, indic, mode, reference]}])
    assert egaux(js["series"], py_series)
    assert js["indicateur"] == py_indic
    # Les ruptures sur la serie transformee doivent aussi concorder (formats « indice » et « +... »).
    appels = [{"fonction": "detecterRuptures", "args": [annees, v, py_indic["format"]]} for v in py_series.values()]
    for js_r, v in zip(appeler_js(appels), py_series.values()):
        assert egaux(js_r, calculs.detecter_ruptures(annees, v, py_indic["format"]))
