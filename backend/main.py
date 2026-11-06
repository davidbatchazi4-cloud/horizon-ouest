"""Serveur FastAPI du tableau de bord du developpement humain.

Lancement, depuis le dossier dashboard-ci :
    python -m uvicorn backend.main:app --reload
puis ouvrir http://127.0.0.1:8000 (le site) ou http://127.0.0.1:8000/docs (l'API).

Le serveur fait deux choses :
  1. il sert le site (index.html, equipe.html, css, js, images) ;
  2. il expose une API JSON sous /api : catalogue, series de la Banque mondiale
     (avec cache) et analyse complete calculee en Python.
Le site reste utilisable sans ce serveur : il calcule alors tout dans le navigateur.
"""

import hashlib
import hmac
import json
import os
import secrets
import threading
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Literal

from fastapi import Depends, FastAPI, Header, HTTPException, Query
from pydantic import BaseModel, Field
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import banque_mondiale
from .banque_mondiale import ErreurBanqueMondiale
from .calculs import (
    ISO_REFERENCE_ECART, MODES_AFFICHAGE, calculer_stats, construire_series,
    detecter_ruptures, prevoir, serie_vide, transformer_series,
)
from .catalogue import ANNEE_MAX, ANNEE_MIN, CODES_PAYS, INDICATEURS, PAYS, trouver_indicateur

RACINE_SITE = Path(__file__).resolve().parent.parent

app = FastAPI(
    title="Horizon Ouest : API du développement humain en Afrique de l'Ouest",
    description=(
        "API du projet de développement web de l'ENSEA Abidjan (AS3, 2026-2027).\n\n"
        "Les **données** viennent de la Banque mondiale (World Development Indicators). "
        "Les **calculs** (statistiques, indice base 100, écart à l'Afrique subsaharienne, "
        "prévision log-linéaire, détection de ruptures) sont faits par ce serveur, en Python."
    ),
    version="1.0.0",
)


# ===================== Validation commune des parametres =====================

def _valider(indicateur: str, pays: str, debut: int, fin: int):
    """Controle les parametres contre le catalogue ; renvoie (indicateur, liste des pays)."""
    entree = trouver_indicateur(indicateur)
    if entree is None:
        raise HTTPException(400, f"Indicateur inconnu : {indicateur}. Voir /api/catalogue.")

    codes = [c.strip().upper() for c in pays.split(",") if c.strip()]
    if not codes:
        raise HTTPException(400, "Indiquez au moins un pays (ex. pays=CIV,GHA).")
    inconnus = [c for c in codes if c not in CODES_PAYS]
    if inconnus:
        raise HTTPException(400, f"Pays inconnu(s) : {', '.join(inconnus)}. Codes acceptés : {', '.join(CODES_PAYS)}.")
    codes = list(dict.fromkeys(codes))  # sans doublons, ordre conserve

    if not (ANNEE_MIN <= debut <= ANNEE_MAX and ANNEE_MIN <= fin <= ANNEE_MAX):
        raise HTTPException(400, f"Les années doivent être comprises entre {ANNEE_MIN} et {ANNEE_MAX}.")
    if debut > fin:
        raise HTTPException(400, "L'année de début doit précéder l'année de fin.")
    return entree, codes


async def _charger(codes, code_indicateur, debut, fin):
    try:
        return await banque_mondiale.charger_indicateur(codes, code_indicateur, debut, fin)
    except ErreurBanqueMondiale as erreur:
        # 502 : le serveur fonctionne, mais sa source (la Banque mondiale) a echoue.
        raise HTTPException(502, str(erreur)) from erreur


def _json_sur(nombre):
    """JSON n'accepte pas l'infini : un score infini est renvoye a None."""
    if nombre is None or nombre in (float("inf"), float("-inf")):
        return None
    return nombre


# ===================== Routes de l'API =====================

@app.get("/api/sante", tags=["Service"], summary="Le serveur répond-il ?")
def sante():
    """Utilise par le site pour savoir s'il peut confier ses calculs au serveur."""
    return {"statut": "ok", "series_en_cache": banque_mondiale.taille_cache()}


@app.get("/api/catalogue", tags=["Catalogue"], summary="Indicateurs, pays et modes de calcul")
def catalogue():
    return {
        "indicateurs": INDICATEURS,
        "pays": PAYS,
        "modes": MODES_AFFICHAGE,
        "annees": {"min": ANNEE_MIN, "max": ANNEE_MAX},
    }


@app.get("/api/serie", tags=["Données"], summary="Valeurs brutes de la Banque mondiale")
async def serie(
    indicateur: str = Query(..., examples=["SP.DYN.LE00.IN"], description="Code de l'indicateur"),
    pays: str = Query(..., examples=["CIV,GHA,SEN"], description="Codes ISO3 séparés par des virgules"),
    debut: int = Query(2000, description="Première année"),
    fin: int = Query(ANNEE_MAX - 1, description="Dernière année"),
):
    """Série rangée sur une grille d'années croissantes (null = donnée absente)."""
    entree, codes = _valider(indicateur, pays, debut, fin)
    observations = await _charger(codes, entree["code"], debut, fin)
    annees, series = construire_series(observations, codes)
    return {"indicateur": entree, "annees": annees, "series": series}


@app.get("/api/analyse", tags=["Calculs"], summary="Analyse complète, calculée en Python")
async def analyse(
    indicateur: str = Query(..., examples=["SP.DYN.LE00.IN"]),
    pays: str = Query(..., examples=["CIV,GHA,SEN"]),
    debut: int = Query(2000),
    fin: int = Query(ANNEE_MAX - 1),
    mode: Literal["brut", "base100", "ecart"] = Query("brut", description="Calcul appliqué aux séries"),
    prevision: bool = Query(False, description="Ajouter une prévision à 5 ans"),
    ruptures: bool = Query(False, description="Détecter les ruptures"),
):
    """Séries transformées selon le mode, statistiques par pays, prévision et ruptures.

    En mode « ecart », la série de l'Afrique subsaharienne est chargée automatiquement
    comme référence, même si elle n'est pas demandée.
    """
    entree, codes = _valider(indicateur, pays, debut, fin)
    if mode == "ecart" and all(c == ISO_REFERENCE_ECART for c in codes):
        raise HTTPException(400, "En mode écart, choisissez au moins un pays autre que l'Afrique subsaharienne.")

    codes_requete = codes + [ISO_REFERENCE_ECART] if mode == "ecart" and ISO_REFERENCE_ECART not in codes else codes
    observations = await _charger(codes_requete, entree["code"], debut, fin)
    annees, toutes = construire_series(observations, codes_requete)

    brutes = {c: toutes[c] for c in codes}
    reference = toutes.get(ISO_REFERENCE_ECART) if mode == "ecart" else None
    series, indic = transformer_series(brutes, entree, mode, reference)

    resultat = {
        "indicateur": indic,
        "mode": mode,
        "annees": annees,
        "series": series,
        "vide": not annees or all(serie_vide(v) for v in series.values()),
        "statistiques": {c: calculer_stats(annees, v, indic["format"]) for c, v in series.items()},
        "previsions": None,
        "ruptures": None,
        "calcule_par": "serveur FastAPI (Python)",
    }
    if prevision:
        resultat["previsions"] = {c: p for c, v in series.items() if (p := prevoir(annees, v, 5))}
    if ruptures:
        resultat["ruptures"] = {
            c: [{**r, "score": _json_sur(r["score"])} for r in liste]
            for c, v in series.items() if (liste := detecter_ruptures(annees, v, indic["format"]))
        }
    return resultat


@app.delete("/api/cache", tags=["Service"], summary="Vider le cache du serveur")
def vider_cache():
    banque_mondiale.vider_cache()
    return {"statut": "ok", "series_en_cache": 0}


# Une ligne JSON par suggestion ; le fichier n'est pas servi (seuls css, js, images le sont).
FICHIER_SUGGESTIONS = Path(__file__).resolve().parent / "suggestions.jsonl"
_verrou_suggestions = threading.Lock()  # deux ecritures simultanees ne doivent pas se melanger


class Suggestion(BaseModel):
    nom: str = Field("", max_length=80)
    email: str = Field("", max_length=120)
    message: str = Field(..., min_length=5, max_length=2000)


def _lire_suggestions() -> list[dict]:
    """Toutes les suggestions du fichier. Les lignes ecrites avant l'ajout des identifiants
    recoivent un identifiant stable (empreinte de la ligne) ; une ligne illisible est ignoree."""
    if not FICHIER_SUGGESTIONS.exists():
        return []
    suggestions = []
    for ligne in FICHIER_SUGGESTIONS.read_text(encoding="utf-8").splitlines():
        if not ligne.strip():
            continue
        try:
            s = json.loads(ligne)
        except json.JSONDecodeError:
            continue
        s.setdefault("id", hashlib.sha1(ligne.encode("utf-8")).hexdigest()[:12])
        s.setdefault("lu", False)
        suggestions.append(s)
    return suggestions


def _ecrire_suggestions(suggestions: list[dict]) -> None:
    """Reecrit le fichier d'un coup (fichier temporaire puis remplacement : pas de fichier a moitie ecrit)."""
    temporaire = FICHIER_SUGGESTIONS.with_suffix(".tmp")
    temporaire.write_text("".join(json.dumps(s, ensure_ascii=False) + "\n" for s in suggestions), encoding="utf-8")
    temporaire.replace(FICHIER_SUGGESTIONS)


@app.post("/api/suggestions", tags=["Suggestions"], summary="Envoyer une suggestion", status_code=201)
def envoyer_suggestion(s: Suggestion):
    """Enregistre la suggestion dans backend/suggestions.jsonl."""
    if not s.message.strip():
        raise HTTPException(400, "Le message est vide.")
    ligne = {"id": uuid.uuid4().hex[:12], "date": datetime.now().isoformat(timespec="seconds"),
             "lu": False, **s.model_dump()}
    with _verrou_suggestions, open(FICHIER_SUGGESTIONS, "a", encoding="utf-8") as f:
        f.write(json.dumps(ligne, ensure_ascii=False) + "\n")
    return {"statut": "ok"}


# ===================== Administration : lire les suggestions =====================
# Protegee par un mot de passe : variable d'environnement HORIZON_ADMIN_MDP, sinon le fichier
# backend/mot_de_passe_admin.txt, cree avec un mot de passe aleatoire au premier besoin.
# Ce fichier n'est pas servi par le site ; il reste sur l'ordinateur qui fait tourner le serveur.

FICHIER_MDP_ADMIN = Path(__file__).resolve().parent / "mot_de_passe_admin.txt"


def mot_de_passe_admin() -> str:
    mdp = os.environ.get("HORIZON_ADMIN_MDP", "").strip()
    if mdp:
        return mdp
    if FICHIER_MDP_ADMIN.exists():
        mdp = FICHIER_MDP_ADMIN.read_text(encoding="utf-8").strip()
        if mdp:
            return mdp
    mdp = secrets.token_urlsafe(9)
    FICHIER_MDP_ADMIN.write_text(mdp + "\n", encoding="utf-8")
    print(f"\n  Mot de passe administrateur cree : ouvrez {FICHIER_MDP_ADMIN}\n")
    return mdp


def verifier_admin(authorization: str = Header("", description="« Bearer <mot de passe> »")):
    fourni = authorization.removeprefix("Bearer ").strip()
    attendu = mot_de_passe_admin()
    # compare_digest : meme duree de comparaison quel que soit le mot de passe essaye.
    if not fourni or not hmac.compare_digest(fourni.encode("utf-8"), attendu.encode("utf-8")):
        time.sleep(0.4)  # ralentit les essais a repetition
        raise HTTPException(401, "Mot de passe administrateur incorrect.")


class EtatLecture(BaseModel):
    lu: bool


@app.get("/api/admin/suggestions", tags=["Administration"], summary="Lister les suggestions reçues",
         dependencies=[Depends(verifier_admin)])
def lister_suggestions():
    suggestions = sorted(_lire_suggestions(), key=lambda s: s.get("date", ""), reverse=True)
    return {"total": len(suggestions), "non_lus": sum(not s["lu"] for s in suggestions), "suggestions": suggestions}


@app.patch("/api/admin/suggestions/{identifiant}", tags=["Administration"], summary="Marquer lue ou non lue",
           dependencies=[Depends(verifier_admin)])
def marquer_suggestion(identifiant: str, etat: EtatLecture):
    with _verrou_suggestions:
        suggestions = _lire_suggestions()
        cible = next((s for s in suggestions if s["id"] == identifiant), None)
        if cible is None:
            raise HTTPException(404, "Suggestion introuvable (déjà supprimée ?).")
        cible["lu"] = etat.lu
        _ecrire_suggestions(suggestions)
    return cible


@app.delete("/api/admin/suggestions/{identifiant}", tags=["Administration"], summary="Supprimer une suggestion",
            dependencies=[Depends(verifier_admin)])
def supprimer_suggestion(identifiant: str):
    with _verrou_suggestions:
        suggestions = _lire_suggestions()
        restantes = [s for s in suggestions if s["id"] != identifiant]
        if len(restantes) == len(suggestions):
            raise HTTPException(404, "Suggestion introuvable (déjà supprimée ?).")
        _ecrire_suggestions(restantes)
    return {"statut": "ok", "restantes": len(restantes)}


# ===================== Le site lui-meme =====================
# On ne publie que ce qui fait le site (pas le code du serveur ni les tests).

for dossier in ("css", "js", "images"):
    app.mount(f"/{dossier}", StaticFiles(directory=RACINE_SITE / dossier), name=dossier)


PAGES = ("index.html", "equipe.html", "pays.html", "theme.html", "trajectoires.html", "admin.html")


@app.get("/", include_in_schema=False)
def page_accueil():
    return FileResponse(RACINE_SITE / "index.html")


@app.get("/{page}.html", include_in_schema=False)
def page_du_site(page: str):
    if f"{page}.html" not in PAGES:  # liste fermee : on ne sert jamais un autre fichier
        raise HTTPException(404, "Page introuvable.")
    return FileResponse(RACINE_SITE / f"{page}.html")
