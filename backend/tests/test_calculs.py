"""Tests des calculs Python sur des cas dont on connait le resultat a la main."""

import math

import pytest

from backend.calculs import (
    calculer_stats, construire_series, detecter_ruptures, ecart_reference,
    indice_base100, mediane, prevoir, transformer_series,
)

from .conftest import observations


def test_construire_series_trie_et_aligne():
    obs = [
        {"countryiso3code": "CIV", "date": "2002", "value": 3},
        {"countryiso3code": "CIV", "date": "2000", "value": 1},
        {"countryiso3code": "GHA", "date": "2001", "value": 5},
        {"countryiso3code": "GHA", "date": "2002", "value": None},
    ]
    annees, series = construire_series(obs, ["CIV", "GHA", "SEN"])
    assert annees == [2000, 2001, 2002]  # l'API renvoie les annees a l'envers : on trie
    assert series == {"CIV": [1, None, 3], "GHA": [None, 5, None], "SEN": [None, None, None]}


def test_stats_niveau_variation_et_tcam():
    # 100 -> 121 en 2 ans : +21 %, soit exactement 10 % par an.
    s = calculer_stats([2000, 2001, 2002], [100, None, 121], "nombre")
    assert s["variation"] == pytest.approx(21)
    assert s["tcam"] == pytest.approx(10)
    assert s["nbPoints"] == 2 and s["moyenne"] == pytest.approx(110.5)


def test_stats_taux_en_points_sans_tcam():
    # Un taux qui passe de 40 % a 60 % gagne 20 points (et non « +50 % »).
    s = calculer_stats([2000, 2010], [40, 60], "pourcent")
    assert s["enPoints"] is True
    assert s["variation"] == pytest.approx(20)
    assert s["tcam"] is None


def test_stats_serie_vide():
    assert calculer_stats([2000, 2001], [None, None], "nombre") is None


def test_prevision_log_lineaire_retrouve_un_taux_constant():
    annees = list(range(2000, 2010))
    valeurs = [100 * 1.05 ** i for i in range(10)]  # +5 % par an exactement
    p = prevoir(annees, valeurs, 5)
    assert p["annees"] == [2010, 2011, 2012, 2013, 2014]
    assert p["valeurs"][0] == pytest.approx(100 * 1.05 ** 10)
    assert "5,00 %" in p["methode"]


def test_prevision_lineaire_si_valeur_negative():
    p = prevoir([2000, 2001, 2002, 2003, 2004], [-2, -1, 0, 1, 2], 2)
    assert p["valeurs"] == pytest.approx([3, 4])
    assert p["methode"].startswith("tendance linéaire")


def test_prevision_impossible_avec_trop_peu_de_points():
    assert prevoir([2000, 2001, 2002], [1, 2, 3]) is None


def test_indice_base100_et_ecart():
    assert indice_base100([None, 50, 75]) == [None, 100, 150]
    assert indice_base100([0, 5]) == [None, None]  # base nulle : indice non defini
    assert ecart_reference([10, None, 30], [4, 5, None]) == [6, None, None]


def test_transformer_ecart_retire_la_reference():
    indic = {"code": "X", "nom": "Accès", "unite": "%", "format": "pourcent"}
    series, decrit = transformer_series({"CIV": [50, 60], "SSF": [40, 45]}, indic, "ecart", [40, 45])
    assert series == {"CIV": [10, 15]}
    assert decrit["format"] == "+pourcent" and decrit["unite"].startswith("points de %")


def test_mediane():
    assert mediane([3, 1, 2]) == 2
    assert mediane([4, 1, 3, 2]) == 2.5


def test_rupture_vaccination_rougeole_2012():
    """Exemple du README : la vaccination contre la rougeole bondit de 25 points en 2012."""
    annees, series = construire_series(observations("SH.IMM.MEAS"), ["CIV"])
    r = detecter_ruptures(annees, series["CIV"], "pourcent")
    rupture_2012 = [x for x in r if x["annee"] == 2012]
    assert rupture_2012, r
    assert rupture_2012[0]["variation"] == pytest.approx(25, abs=0.5)


def test_pas_de_rupture_sur_une_serie_reguliere():
    annees = list(range(2000, 2020))
    assert detecter_ruptures(annees, [50 + 0.5 * i for i in range(20)], "annees") == []


def test_score_infini_si_serie_parfaitement_reguliere_puis_saut():
    annees = list(range(2000, 2012))
    valeurs = [10.0] * 11 + [20.0]
    r = detecter_ruptures(annees, valeurs, "pourcent")
    assert len(r) == 1 and r[0]["annee"] == 2011 and math.isinf(r[0]["score"])
