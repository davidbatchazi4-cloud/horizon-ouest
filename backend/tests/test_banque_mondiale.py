"""Second essai automatique quand la Banque mondiale est lente ou en panne passagere."""

import asyncio

import httpx
import pytest

from backend import banque_mondiale
from backend.banque_mondiale import ErreurBanqueMondiale, _ErreurPassagere


def reponse(code, corps):
    return httpx.Response(code, json=corps)


@pytest.fixture
def api(monkeypatch):
    """Remplace l'appel reseau par une suite de resultats prevus a l'avance."""
    banque_mondiale.vider_cache()
    monkeypatch.setattr(banque_mondiale, "PAUSE_TENTATIVES_S", 0)
    appels = []

    def programmer(*resultats):
        file = list(resultats)

        async def une_tentative(url, params):
            appels.append(url)
            resultat = file.pop(0)
            if isinstance(resultat, Exception):
                raise resultat
            return resultat

        monkeypatch.setattr(banque_mondiale, "_une_tentative", une_tentative)
        return appels

    return programmer


def charger():
    return asyncio.run(banque_mondiale.charger_indicateur(["CIV"], "SP.DYN.LE00.IN", 2000, 2010))


OBSERVATIONS = [{"countryiso3code": "CIV", "date": "2010", "value": 55.3}]


def test_lenteur_passagere_rattrapee_par_le_second_essai(api):
    appels = api(_ErreurPassagere("lent"), reponse(200, [{}, OBSERVATIONS]))
    assert charger() == OBSERVATIONS
    assert len(appels) == 2


def test_deux_echecs_donnent_une_erreur_expliquee(api):
    appels = api(_ErreurPassagere("n'a pas répondu"), _ErreurPassagere("n'a pas répondu"))
    with pytest.raises(ErreurBanqueMondiale, match="n'a pas répondu"):
        charger()
    assert len(appels) == 2


def test_requete_refusee_jamais_reessayee(api):
    appels = api(reponse(400, {"erreur": "parametre"}))
    with pytest.raises(ErreurBanqueMondiale, match="400"):
        charger()
    assert len(appels) == 1
