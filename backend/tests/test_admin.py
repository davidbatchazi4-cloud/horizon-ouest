"""Espace administrateur : lecture, marquage et suppression des suggestions, protege par mot de passe."""

import json

import pytest
from fastapi.testclient import TestClient

from backend import main

client = TestClient(main.app)
MDP = "mot-de-passe-de-test"
ENTETE = {"Authorization": f"Bearer {MDP}"}


@pytest.fixture(autouse=True)
def isoler(monkeypatch, tmp_path):
    """Fichiers dans un dossier temporaire, mot de passe fixe, pas d'attente apres un echec."""
    monkeypatch.setattr(main, "FICHIER_SUGGESTIONS", tmp_path / "suggestions.jsonl")
    monkeypatch.setattr(main, "FICHIER_MDP_ADMIN", tmp_path / "mot_de_passe_admin.txt")
    monkeypatch.setenv("HORIZON_ADMIN_MDP", MDP)
    monkeypatch.setattr(main.time, "sleep", lambda s: None)


def envoyer(message, nom=""):
    assert client.post("/api/suggestions", json={"nom": nom, "message": message}).status_code == 201


def test_mot_de_passe_obligatoire():
    assert client.get("/api/admin/suggestions").status_code == 401
    assert client.get("/api/admin/suggestions", headers={"Authorization": "Bearer faux"}).status_code == 401
    assert client.delete("/api/admin/suggestions/abc").status_code == 401


def test_lister_marquer_supprimer():
    envoyer("Premier message de test", "Awa")
    envoyer("Second message de test")
    r = client.get("/api/admin/suggestions", headers=ENTETE).json()
    assert (r["total"], r["non_lus"]) == (2, 2)
    ident = r["suggestions"][0]["id"]

    assert client.patch(f"/api/admin/suggestions/{ident}", json={"lu": True}, headers=ENTETE).json()["lu"] is True
    assert client.get("/api/admin/suggestions", headers=ENTETE).json()["non_lus"] == 1

    assert client.delete(f"/api/admin/suggestions/{ident}", headers=ENTETE).json()["restantes"] == 1
    assert client.delete(f"/api/admin/suggestions/{ident}", headers=ENTETE).status_code == 404


def test_anciennes_lignes_sans_identifiant():
    """Les messages enregistres avant l'ajout des identifiants restent gerables."""
    main.FICHIER_SUGGESTIONS.write_text(
        json.dumps({"date": "2026-11-05T10:00:00", "nom": "", "email": "", "message": "Ancien message"}) + "\n",
        encoding="utf-8")
    s = client.get("/api/admin/suggestions", headers=ENTETE).json()["suggestions"][0]
    assert s["lu"] is False and s["id"]
    assert client.patch(f"/api/admin/suggestions/{s['id']}", json={"lu": True}, headers=ENTETE).status_code == 200


def test_mot_de_passe_cree_au_premier_besoin(monkeypatch):
    monkeypatch.delenv("HORIZON_ADMIN_MDP")
    assert client.get("/api/admin/suggestions").status_code == 401
    cree = main.FICHIER_MDP_ADMIN.read_text(encoding="utf-8").strip()
    assert len(cree) >= 12
    assert client.get("/api/admin/suggestions", headers={"Authorization": f"Bearer {cree}"}).status_code == 200


@pytest.mark.parametrize("page", ["index", "equipe", "pays", "theme", "trajectoires", "admin"])
def test_toutes_les_pages_sont_servies(page):
    assert client.get(f"/{page}.html").status_code == 200


def test_aucun_autre_fichier_servi():
    assert client.get("/README.html").status_code == 404
