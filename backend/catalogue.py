"""Catalogue des indicateurs et des pays, cote serveur.

Copie de js/config.js : le site doit aussi fonctionner sans le serveur, il garde
donc son propre catalogue. Le test tests/test_catalogue.py verifie que les deux
restent identiques.
"""

from datetime import date

ANNEE_MIN = 1960
ANNEE_MAX = date.today().year

# format : "nombre" | "pourcent" | "dollar" | "annees"
INDICATEURS = [
    {"theme": "Santé", "series": [
        {"code": "SP.DYN.LE00.IN", "nom": "Espérance de vie à la naissance", "unite": "années", "format": "annees"},
        {"code": "SP.DYN.IMRT.IN", "nom": "Mortalité infantile", "unite": "‰ naissances vivantes", "format": "nombre"},
        {"code": "SH.DYN.MORT", "nom": "Mortalité des moins de 5 ans", "unite": "‰ naissances vivantes", "format": "nombre"},
        {"code": "SH.STA.MMRT", "nom": "Mortalité maternelle", "unite": "pour 100 000 naissances vivantes", "format": "nombre"},
        {"code": "SH.IMM.MEAS", "nom": "Vaccination contre la rougeole", "unite": "% des enfants de 12-23 mois", "format": "pourcent"},
        {"code": "SH.HIV.INCD.TL.P3", "nom": "Nouvelles infections au VIH", "unite": "pour 1 000 personnes non infectées", "format": "nombre"},
    ]},
    {"theme": "Éducation", "series": [
        {"code": "SE.PRM.ENRR", "nom": "Scolarisation au primaire", "unite": "% brut", "format": "pourcent"},
        {"code": "SE.PRM.CMPT.ZS", "nom": "Achèvement du primaire", "unite": "% de la classe d'âge", "format": "pourcent"},
        {"code": "SE.SEC.ENRR", "nom": "Scolarisation au secondaire", "unite": "% brut", "format": "pourcent"},
        {"code": "SE.ADT.LITR.ZS", "nom": "Alphabétisation (15 ans et +)", "unite": "% de la population", "format": "pourcent"},
    ]},
    {"theme": "Conditions de vie", "series": [
        {"code": "EG.ELC.ACCS.ZS", "nom": "Accès à l'électricité", "unite": "% de la population", "format": "pourcent"},
        {"code": "SH.H2O.BASW.ZS", "nom": "Accès à l'eau potable de base", "unite": "% de la population", "format": "pourcent"},
        {"code": "SH.STA.BASS.ZS", "nom": "Accès à l'assainissement de base", "unite": "% de la population", "format": "pourcent"},
        {"code": "EG.CFT.ACCS.ZS", "nom": "Cuisson avec combustibles propres", "unite": "% de la population", "format": "pourcent"},
        {"code": "IT.NET.USER.ZS", "nom": "Utilisateurs d'Internet", "unite": "% de la population", "format": "pourcent"},
    ]},
    {"theme": "Démographie", "series": [
        {"code": "SP.POP.TOTL", "nom": "Population totale", "unite": "habitants", "format": "nombre"},
        {"code": "SP.POP.GROW", "nom": "Croissance démographique", "unite": "% par an", "format": "pourcent"},
        {"code": "SP.URB.TOTL.IN.ZS", "nom": "Population urbaine", "unite": "% de la population", "format": "pourcent"},
        {"code": "SP.DYN.TFRT.IN", "nom": "Fécondité", "unite": "enfants par femme", "format": "nombre"},
    ]},
    {"theme": "Égalité femmes-hommes", "series": [
        {"code": "SG.GEN.PARL.ZS", "nom": "Femmes au Parlement", "unite": "% des sièges", "format": "pourcent"},
        {"code": "SP.ADO.TFRT", "nom": "Fécondité des adolescentes", "unite": "naissances pour 1 000 filles de 15-19 ans", "format": "nombre"},
    ]},
]

PAYS = [
    {"iso3": "CIV", "nom": "Côte d'Ivoire", "couleur": "#f77f00", "defaut": True},
    {"iso3": "BEN", "nom": "Bénin", "couleur": "#e05fa0"},
    {"iso3": "BFA", "nom": "Burkina Faso", "couleur": "#d62839"},
    {"iso3": "CPV", "nom": "Cap-Vert", "couleur": "#6cb4ee"},
    {"iso3": "GMB", "nom": "Gambie", "couleur": "#9b5de5"},
    {"iso3": "GHA", "nom": "Ghana", "couleur": "#2a9d4b"},
    {"iso3": "GIN", "nom": "Guinée", "couleur": "#a0522d"},
    {"iso3": "GNB", "nom": "Guinée-Bissau", "couleur": "#b8b000"},
    {"iso3": "LBR", "nom": "Liberia", "couleur": "#2f6fdf"},
    {"iso3": "MLI", "nom": "Mali", "couleur": "#b5179e"},
    {"iso3": "MRT", "nom": "Mauritanie", "couleur": "#a68a64"},
    {"iso3": "NER", "nom": "Niger", "couleur": "#7cb518"},
    {"iso3": "NGA", "nom": "Nigeria", "couleur": "#8d99ae"},
    {"iso3": "SEN", "nom": "Sénégal", "couleur": "#12a4a4"},
    {"iso3": "SLE", "nom": "Sierra Leone", "couleur": "#5e60ce"},
    {"iso3": "TGO", "nom": "Togo", "couleur": "#f2c14e"},
    {"iso3": "SSF", "nom": "Afrique subsaharienne", "couleur": "#b08968", "agregat": True},
    {"iso3": "WLD", "nom": "Monde", "couleur": "#7a8796", "agregat": True},
]

CODES_PAYS = [p["iso3"] for p in PAYS]


def trouver_indicateur(code):
    for groupe in INDICATEURS:
        for serie in groupe["series"]:
            if serie["code"] == code:
                return serie
    return None
