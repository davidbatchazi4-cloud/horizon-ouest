"""Outils partages par les tests.

Lancer tous les tests depuis le dossier dashboard-ci :
    python -m pytest backend/tests -v
"""

import json
import math
import shutil
import subprocess
from pathlib import Path

import pytest

DOSSIER_TESTS = Path(__file__).resolve().parent
DOSSIER_DONNEES = DOSSIER_TESTS / "donnees"

# Les tests de parite executent le code JavaScript du site avec Node.js.
NODE = shutil.which("node")
avec_node = pytest.mark.skipif(NODE is None, reason="Node.js n'est pas installé")


def observations(code):
    """Observations reelles de la Banque mondiale, enregistrees pour les tests (hors ligne)."""
    with open(DOSSIER_DONNEES / f"{code}.json", encoding="utf-8") as f:
        return json.load(f)


def appeler_js(appels):
    """Execute des fonctions de js/donnees.js ; renvoie leurs resultats (meme ordre)."""
    sortie = subprocess.run(
        [NODE, str(DOSSIER_TESTS / "pont_js.js")],
        input=json.dumps(appels), capture_output=True, text=True, encoding="utf-8", check=True,
    )
    return json.loads(sortie.stdout, parse_constant=None)


def _infini(v):
    return {"inf": math.inf, "-inf": -math.inf}.get(v, v) if isinstance(v, str) else v


def egaux(a, b, tol=1e-9):
    """Egalite recursive avec tolerance relative sur les nombres a virgule."""
    a, b = _infini(a), _infini(b)
    if isinstance(a, dict) and isinstance(b, dict):
        return a.keys() == b.keys() and all(egaux(a[k], b[k], tol) for k in a)
    if isinstance(a, (list, tuple)) and isinstance(b, (list, tuple)):
        return len(a) == len(b) and all(egaux(x, y, tol) for x, y in zip(a, b))
    if isinstance(a, bool) or isinstance(b, bool):
        return a == b
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        if math.isinf(a) or math.isinf(b):
            return a == b
        return math.isclose(a, b, rel_tol=tol, abs_tol=1e-12)
    return a == b
