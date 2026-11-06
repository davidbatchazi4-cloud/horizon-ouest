"""Acces a l'API de la Banque mondiale, avec un cache en memoire.

Memes regles que js/api.js : l'API repond HTTP 200 meme quand la requete est
invalide (le corps vaut alors [{"message": [...]}]), on inspecte donc la reponse.
"""

import asyncio
import time

import httpx

BASE_API = "https://api.worldbank.org/v2/country"
DELAI_MAX_S = 15            # par tentative
NB_TENTATIVES = 2           # ralentissements passagers : on reessaie une fois
PAUSE_TENTATIVES_S = 1
DUREE_CACHE_S = 24 * 60 * 60
TAILLE_MAX_CACHE = 300

_cache = {}  # cle -> (horodatage, observations)


class ErreurBanqueMondiale(Exception):
    """Erreur attendue (API lente, injoignable ou requete refusee), message en francais."""


def _cle(codes_pays, indicateur, debut, fin):
    return f"{'-'.join(sorted(codes_pays))}_{indicateur}_{debut}_{fin}"


def vider_cache():
    _cache.clear()


def taille_cache():
    return len(_cache)


class _ErreurPassagere(Exception):
    """Lenteur, coupure ou erreur 5xx : vaut la peine d'un second essai."""


async def _une_tentative(url, params):
    try:
        async with httpx.AsyncClient(timeout=DELAI_MAX_S) as client:
            reponse = await client.get(url, params=params)
    except httpx.TimeoutException as erreur:
        raise _ErreurPassagere(
            f"L'API de la Banque mondiale n'a pas répondu ({NB_TENTATIVES} essais de {DELAI_MAX_S} secondes). "
            "Elle connaît parfois des ralentissements : réessayez dans un instant.") from erreur
    except httpx.HTTPError as erreur:
        raise _ErreurPassagere(
            "Le serveur n'a pas pu joindre l'API de la Banque mondiale. "
            "Vérifiez la connexion Internet.") from erreur
    if reponse.status_code >= 500 or reponse.status_code == 429:
        raise _ErreurPassagere(f"L'API a répondu avec le code HTTP {reponse.status_code}.")
    return reponse


async def charger_indicateur(codes_pays, indicateur, debut, fin):
    """Observations brutes de l'API pour un indicateur et plusieurs pays."""
    cle = _cle(codes_pays, indicateur, debut, fin)
    en_cache = _cache.get(cle)
    if en_cache and time.time() - en_cache[0] < DUREE_CACHE_S:
        return en_cache[1]

    url = f"{BASE_API}/{';'.join(codes_pays)}/indicator/{indicateur}"
    params = {"format": "json", "date": f"{debut}:{fin}", "per_page": 20000}
    for tentative in range(1, NB_TENTATIVES + 1):
        try:
            reponse = await _une_tentative(url, params)
            break
        except _ErreurPassagere as erreur:
            if tentative == NB_TENTATIVES:
                raise ErreurBanqueMondiale(str(erreur)) from erreur.__cause__
            await asyncio.sleep(PAUSE_TENTATIVES_S)

    if reponse.status_code != 200:
        raise ErreurBanqueMondiale(f"L'API a répondu avec le code HTTP {reponse.status_code}.")
    try:
        corps = reponse.json()
    except ValueError as erreur:
        raise ErreurBanqueMondiale("La réponse de l'API n'est pas du JSON exploitable.") from erreur

    if not isinstance(corps, list):
        raise ErreurBanqueMondiale("Réponse inattendue de l'API.")
    if corps and isinstance(corps[0], dict) and corps[0].get("message"):
        message = corps[0]["message"]
        detail = message[0].get("value") if message and isinstance(message[0], dict) else None
        raise ErreurBanqueMondiale("Requête refusée : " + (detail or "paramètre refusé par l'API"))

    observations = corps[1] if len(corps) > 1 and isinstance(corps[1], list) else []
    if observations:
        if len(_cache) >= TAILLE_MAX_CACHE:
            _cache.pop(next(iter(_cache)))  # on retire l'entree la plus ancienne
        _cache[cle] = (time.time(), observations)
    return observations
