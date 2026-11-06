"""Calculs statistiques du tableau de bord, en Python.

Traduction fidele de js/donnees.js : memes formules, memes seuils, memes cas
limites. Les tests (tests/test_parite_js.py) executent les deux versions sur les
memes donnees et verifient qu'elles donnent les memes resultats.

Une valeur manquante est representee par None (null en JavaScript).
"""

import math

# ===================== Mise en forme des observations =====================


def construire_series(observations, codes_pays):
    """Regroupe les observations de l'API par pays, sur une grille d'annees triees.

    L'API renvoie les annees de la plus recente a la plus ancienne : il faut trier.
    Chaque pays demande recoit une valeur par annee (None si absente).
    """
    par_pays = {}
    annees_vues = set()
    for obs in observations:
        iso3 = obs.get("countryiso3code")
        try:
            annee = int(obs.get("date"))
        except (TypeError, ValueError):
            continue
        if not iso3:
            continue
        par_pays.setdefault(iso3, {})[annee] = obs.get("value")
        annees_vues.add(annee)

    annees = sorted(annees_vues)
    series = {}
    for iso3 in codes_pays:
        valeurs_pays = par_pays.get(iso3, {})
        series[iso3] = [_nombre_ou_none(valeurs_pays.get(a)) for a in annees]
    return annees, series


def _nombre_ou_none(v):
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        return None
    return float(v)


def serie_vide(valeurs):
    return all(v is None for v in valeurs)


def points_valides(annees, valeurs):
    """Paires (annee, valeur) en ignorant les trous."""
    return [(a, v) for a, v in zip(annees, valeurs) if v is not None]


def est_serie_en_points(format_):
    """Vrai pour un taux (« pourcent ») ou un ecart (format prefixe par « + »).

    Leur evolution se mesure par une difference en points, pas en %.
    """
    return format_ == "pourcent" or (isinstance(format_, str) and format_.startswith("+"))


# ===================== Statistiques descriptives =====================


def calculer_stats(annees, valeurs, format_):
    """Statistiques entre la premiere et la derniere valeur reellement disponibles.

    - niveau : variation en % et TCAM ;
    - taux ou ecart : variation = difference (en_points), pas de TCAM.
    """
    points = points_valides(annees, valeurs)
    if not points:
        return None

    annee_debut, v_debut = points[0]
    annee_fin, v_fin = points[-1]
    n = annee_fin - annee_debut
    nombres = [p[1] for p in points]

    stats = {
        "anneeDebut": annee_debut, "vDebut": v_debut,
        "anneeFin": annee_fin, "vFin": v_fin,
        "nbPoints": len(points),
        "min": min(nombres), "max": max(nombres),
        "moyenne": sum(nombres) / len(nombres),
        "variation": None, "tcam": None,
        "enPoints": est_serie_en_points(format_),
    }

    if stats["enPoints"]:
        stats["variation"] = v_fin - v_debut
        return stats

    if v_debut != 0:
        stats["variation"] = (v_fin - v_debut) / abs(v_debut) * 100
    # Le TCAM n'a de sens que sur une grandeur positive sur plus d'un an.
    if n > 0 and v_debut > 0 and v_fin > 0:
        stats["tcam"] = ((v_fin / v_debut) ** (1 / n) - 1) * 100
    return stats


# ===================== Prevision =====================

MIN_POINTS_PREVISION = 5


def prevoir(annees, valeurs, horizon=5):
    """Prevision par tendance log-lineaire : log(V) = a + b*t, moindres carres.

    Revient a supposer un taux de croissance constant. Repli sur une tendance
    lineaire si la serie contient des valeurs <= 0 (le log n'y est pas defini).
    """
    points = points_valides(annees, valeurs)
    if len(points) < MIN_POINTS_PREVISION:
        return None

    log_possible = all(v > 0 for _, v in points)
    t = [a for a, _ in points]
    y = [math.log(v) if log_possible else v for _, v in points]

    n = len(t)
    t_moy = sum(t) / n
    y_moy = sum(y) / n
    sxy = sum((ti - t_moy) * (yi - y_moy) for ti, yi in zip(t, y))
    sxx = sum((ti - t_moy) ** 2 for ti in t)
    if sxx == 0:
        return None

    b = sxy / sxx
    a = y_moy - b * t_moy
    derniere = t[-1]
    annees_prevues = [derniere + k for k in range(1, horizon + 1)]
    valeurs_prevues = [math.exp(a + b * an) if log_possible else a + b * an for an in annees_prevues]

    if log_possible:
        taux = f"{(math.exp(b) - 1) * 100:.2f}".replace(".", ",")
        methode = f"tendance log-linéaire (taux constant ≈ {taux} % par an)"
    else:
        methode = "tendance linéaire (série non strictement positive)"
    return {"annees": annees_prevues, "valeurs": valeurs_prevues, "methode": methode}


# ===================== Indicateurs derives =====================

MODES_AFFICHAGE = {
    "brut": "Valeurs brutes (Banque mondiale)",
    "base100": "Indice base 100 (première année)",
    "ecart": "Écart à l'Afrique subsaharienne",
}
ISO_REFERENCE_ECART = "SSF"


def indice_base100(valeurs):
    """I(t) = V(t) / V(base) x 100, base = premiere annee renseignee."""
    base = next((v for v in valeurs if v is not None), None)
    if base is None or base <= 0:
        return [None for _ in valeurs]
    return [None if v is None else v / base * 100 for v in valeurs]


def ecart_reference(valeurs, reference):
    """E(t) = V(t) - R(t), seulement sur les annees ou les deux existent."""
    return [None if v is None or r is None else v - r for v, r in zip(valeurs, reference)]


def transformer_series(series, indicateur, mode, reference):
    """Applique le mode d'affichage ; renvoie (series, indicateur decrit pour l'affichage)."""
    if mode == "base100":
        return (
            {iso: indice_base100(v) for iso, v in series.items()},
            {**indicateur, "nom": indicateur["nom"] + " (indice base 100)",
             "unite": "indice, 100 = première année renseignée", "format": "indice"},
        )
    if mode == "ecart" and reference is not None:
        unite = "points de %" if indicateur["format"] == "pourcent" else indicateur["unite"]
        return (
            {iso: ecart_reference(v, reference) for iso, v in series.items() if iso != ISO_REFERENCE_ECART},
            {**indicateur, "nom": indicateur["nom"] + " (écart à l'Afrique subsaharienne)",
             "unite": unite + ", pays − Afrique subsaharienne", "format": "+" + indicateur["format"]},
        )
    return series, indicateur


# ===================== Detection de ruptures =====================

MIN_VARIATIONS_RUPTURE = 6
SEUIL_RUPTURE = 3          # en ecarts robustes
DEMI_FENETRE_RUPTURE = 2   # tendance locale = 5 variations centrees


def mediane(nombres):
    t = sorted(nombres)
    m = len(t) // 2
    return t[m] if len(t) % 2 else (t[m - 1] + t[m]) / 2


def detecter_ruptures(annees, valeurs, format_):
    """Annees ou la serie s'ecarte brutalement de sa tendance du moment.

    1. Variation annuelle : log-difference pour un niveau positif, difference en
       points pour un taux ou un ecart (divisee par l'ecart d'annees s'il y a un trou).
    2. Tendance locale : mediane des 5 variations centrees.
    3. Score robuste = residu / (1,4826 x MAD des residus).
    4. Rupture si |score| > 3 et si le residu depasse un plancher.
    """
    points = points_valides(annees, valeurs)
    if len(points) < MIN_VARIATIONS_RUPTURE + 1:
        return []

    est_niveau = format_ in ("dollar", "nombre", "annees", "indice")
    en_taux = est_niveau and all(v > 0 for _, v in points)

    variations = []
    for (a0, v0), (a1, v1) in zip(points, points[1:]):
        brute = math.log(v1) - math.log(v0) if en_taux else v1 - v0
        variations.append((a1, brute / (a1 - a0)))

    residus = []
    for i, (_, valeur) in enumerate(variations):
        voisins = [x[1] for x in variations[max(0, i - DEMI_FENETRE_RUPTURE): i + DEMI_FENETRE_RUPTURE + 1]]
        residus.append(valeur - mediane(voisins))

    mad = mediane([abs(r) for r in residus]) * 1.4826
    typique = 0.1 * mediane([abs(v) for _, v in points])
    plancher = typique
    if en_taux:
        plancher = math.log(1.03)
    elif format_.lstrip("+") == "pourcent":
        plancher = max(1, typique)

    resultats = []
    for (annee, valeur), residu in zip(variations, residus):
        if mad > 0:
            score = residu / mad
        else:
            score = 0.0 if residu == 0 else math.copysign(math.inf, residu)
        if abs(score) > SEUIL_RUPTURE and abs(residu) > plancher:
            resultats.append({
                "annee": annee,
                "variation": (math.exp(valeur) - 1) * 100 if en_taux else valeur,
                "tendance": (math.exp(valeur - residu) - 1) * 100 if en_taux else valeur - residu,
                "residu": residu,
                "score": score,
                "enTaux": en_taux,
            })
    return resultats
