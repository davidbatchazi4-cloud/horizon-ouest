"""Tests des routes de l'API FastAPI.

La Banque mondiale est remplacee par les donnees enregistrees (tests hors ligne,
resultats reproductibles).
"""

import pytest
from fastapi.testclient import TestClient

from backend import banque_mondiale, main
from backend.banque_mondiale import ErreurBanqueMondiale

from .conftest import observations

client = TestClient(main.app)


@pytest.fixture(autouse=True)
def banque_mondiale_simulee(monkeypatch):
    async def charger(codes_pays, indicateur, debut, fin):
        return [o for o in observations(indicateur)
                if o["countryiso3code"] in codes_pays and debut <= int(o["date"]) <= fin]
    monkeypatch.setattr(banque_mondiale, "charger_indicateur", charger)


def test_sante_et_catalogue():
    assert client.get("/api/sante").json()["statut"] == "ok"
    cat = client.get("/api/catalogue").json()
    assert sum(len(g["series"]) for g in cat["indicateurs"]) == 21
    assert set(cat["modes"]) == {"brut", "base100", "ecart"}


def test_serie_brute():
    r = client.get("/api/serie", params={"indicateur": "SP.DYN.LE00.IN", "pays": "CIV,GHA", "debut": 2000, "fin": 2024})
    assert r.status_code == 200
    j = r.json()
    assert j["annees"][0] == 2000 and j["annees"][-1] == 2024
    assert list(j["series"]) == ["CIV", "GHA"]


def test_analyse_complete():
    r = client.get("/api/analyse", params={
        "indicateur": "SH.IMM.MEAS", "pays": "CIV,GHA", "debut": 2000, "fin": 2024,
        "prevision": True, "ruptures": True,
    })
    assert r.status_code == 200
    j = r.json()
    assert j["calcule_par"].startswith("serveur")
    assert j["statistiques"]["CIV"]["enPoints"] is True
    assert set(j["previsions"]) == {"CIV", "GHA"}
    assert 2012 in [x["annee"] for x in j["ruptures"]["CIV"]]


def test_mode_ecart_charge_la_reference_automatiquement():
    j = client.get("/api/analyse", params={"indicateur": "SP.DYN.LE00.IN", "pays": "CIV", "mode": "ecart",
                                            "debut": 2000, "fin": 2024}).json()
    assert list(j["series"]) == ["CIV"]          # la reference n'est pas renvoyee
    assert j["indicateur"]["format"] == "+annees"
    assert j["series"]["CIV"][-1] < 0            # esperance de vie inferieure a la moyenne regionale


def test_mode_base100():
    j = client.get("/api/analyse", params={"indicateur": "SP.POP.TOTL", "pays": "CIV,NGA", "mode": "base100",
                                            "debut": 2000, "fin": 2024}).json()
    assert j["series"]["CIV"][0] == pytest.approx(100)
    assert j["series"]["NGA"][0] == pytest.approx(100)


@pytest.mark.parametrize("params, message", [
    ({"indicateur": "XXX", "pays": "CIV"}, "Indicateur inconnu"),
    ({"indicateur": "SP.POP.TOTL", "pays": "FRA"}, "Pays inconnu"),
    ({"indicateur": "SP.POP.TOTL", "pays": "CIV", "debut": 2020, "fin": 2000}, "précéder"),
    ({"indicateur": "SP.POP.TOTL", "pays": "CIV", "debut": 1900}, "comprises entre"),
    ({"indicateur": "SP.POP.TOTL", "pays": "SSF", "mode": "ecart"}, "autre que"),
])
def test_parametres_refuses(params, message):
    r = client.get("/api/analyse", params=params)
    assert r.status_code == 400
    assert message in r.json()["detail"]


def test_erreur_de_la_banque_mondiale_renvoyee_en_502(monkeypatch):
    async def en_panne(*args):
        raise ErreurBanqueMondiale("L'API de la Banque mondiale n'a pas répondu en 20 secondes.")
    monkeypatch.setattr(banque_mondiale, "charger_indicateur", en_panne)
    r = client.get("/api/analyse", params={"indicateur": "SP.POP.TOTL", "pays": "CIV"})
    assert r.status_code == 502 and "20 secondes" in r.json()["detail"]


def test_le_site_est_servi_mais_pas_le_code_du_serveur():
    assert client.get("/").status_code == 200
    assert client.get("/equipe.html").status_code == 200
    assert client.get("/js/main.js").status_code == 200
    assert client.get("/backend/main.py").status_code == 404


def test_suggestion_enregistree(monkeypatch, tmp_path):
    fichier = tmp_path / "suggestions.jsonl"
    monkeypatch.setattr(main, "FICHIER_SUGGESTIONS", fichier)
    r = client.post("/api/suggestions", json={"nom": "Awa", "message": "Ajouter le Tchad, svp."})
    assert r.status_code == 201
    assert "Tchad" in fichier.read_text(encoding="utf-8")
    # message trop court ou absent : refuse, rien n'est ecrit en plus
    assert client.post("/api/suggestions", json={"message": "ok"}).status_code == 422
    assert client.post("/api/suggestions", json={"nom": "x"}).status_code == 422
    assert len(fichier.read_text(encoding="utf-8").splitlines()) == 1
