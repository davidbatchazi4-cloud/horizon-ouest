# Horizon Ouest : le développement humain en Afrique de l'Ouest, année après année

Logo (`images/logo.svg`) : un soleil levant orange sur l'horizon (lignes blanche et verte) : le progrès qui se lève.

Projet de développement web, ENSEA Abidjan, AS3 (2026-2027).
Équipe : BATCHAZI Essoham David et DEGLA Novignon Elvis.

Application web qui permet de choisir un indicateur de développement humain et social
(santé, éducation, conditions de vie, démographie, égalité femmes-hommes), une période et
des pays de comparaison, puis d'obtenir un graphique, un tableau, des statistiques et des
exports, à partir des données ouvertes de la Banque mondiale (*World Development Indicators*).

**Périmètre volontairement non économique.** Les indicateurs économiques (PIB, croissance,
inflation, exportations) ont été retirés : le projet se concentre sur ce que vivent les
populations : santé, école, accès à l'eau et à l'électricité. Un pays peut croître vite
tout en gardant une mortalité infantile élevée ; c'est cet angle que le tableau de bord montre.

## Catalogue (21 indicateurs)

| Thème | Indicateurs |
|---|---|
| Santé | espérance de vie, mortalité infantile, mortalité des moins de 5 ans, mortalité maternelle, vaccination rougeole, nouvelles infections VIH |
| Éducation | scolarisation primaire et secondaire, achèvement du primaire, alphabétisation |
| Conditions de vie | électricité, eau potable, assainissement, combustibles propres, Internet |
| Démographie | population, croissance démographique, population urbaine, fécondité |
| Égalité femmes-hommes | femmes au Parlement, fécondité des adolescentes |

## Lancer le projet

**Avec le serveur FastAPI (recommandé, bonus du cours).** Une seule fois, installer les
dépendances, puis lancer le serveur depuis le dossier `dashboard-ci` :

```bash
python -m pip install -r backend/requirements.txt
python -m uvicorn backend.main:app --reload
```

Sous Windows, un double-clic sur `lancer.bat` fait la même chose et ouvre le navigateur.
Ensuite : le site sur <http://127.0.0.1:8000>, la documentation interactive de l'API sur
<http://127.0.0.1:8000/docs>.

**Sans serveur Python.** Le site fonctionne aussi seul : il calcule alors tout dans le
navigateur. Il suffit de servir le dossier en HTTP (pour que `localStorage` fonctionne) :

```bash
python -m http.server 8000
```

Sous chaque titre de série, le site indique qui a fait les calculs : « serveur Python
(FastAPI) » ou « navigateur (JavaScript) ».

## Organisation des fichiers

```
dashboard-ci/
├── index.html          tableau de bord : formulaire + résultats
├── equipe.html         page « Nous contacter » (adresses, formulaire, qui vous répond, le projet)
├── pays.html           fiche pays : les 21 indicateurs, rang parmi les 16, objectifs 2030 (?c=SEN)
├── theme.html          pages par thème : un graphique par indicateur, 16 pays + Afrique subsaharienne (?t=sante)
├── trajectoires.html   graphique à bulles animé depuis 1960 (?x=…&y=…&a=1990)
├── admin.html          espace administrateur : messages reçus (lire, marquer lus, supprimer), protégé par mot de passe
├── lancer.bat          lance le serveur FastAPI et ouvre le site (Windows)
├── deploiement-iis/   déploiement sur IIS : guide, web.config (proxy inverse), scripts d'installation et de désinstallation
├── exemples-csv/      fichiers CSV fictifs pour tester l'import (valides et en erreur)
├── images/             photos de l'équipe, carte du monde du bandeau
├── css/
│   └── style.css       mise en page, thème clair/sombre, responsive
├── js/
│   ├── config.js       catalogue des indicateurs et des pays
│   ├── fiches.js       définition, sens (« plus bas = mieux ») et cible ODD 2030 de chaque indicateur
│   ├── api.js          appels à l'API + cache localStorage + erreurs
│   ├── donnees.js      tri, séries, statistiques, prévision
│   ├── graphique.js    rendu Chart.js
│   ├── tableau.js      tableau, cartes clés, commentaire automatique
│   ├── carte.js        carte choroplèthe des 16 pays d'Afrique de l'Ouest, classement, bande des années
│   ├── menu.js         menu « trois barres » (tiroir de navigation, ouvert au clic ou au survol), sur toutes les pages
│   ├── commun.js       briques partagées : pastille ODD, mini-courbe, thème, chargement des 16 pays, rang
│   ├── pays.js         page Fiche pays
│   ├── theme.js        pages Thèmes
│   ├── trajectoires.js page Trajectoires (bulles animées, interpolation des années manquantes)
│   ├── admin.js        page administrateur (appels à /api/admin/suggestions)
│   ├── carrousel.js    photos de monuments en fond de l'en-tête (images/monuments/ISO3.jpg, puis ISO3-2.jpg, ISO3-3.jpg… ; 1600 px)
│   ├── carte-afrique.js contours de l'Afrique de l'Ouest (fichier généré)
│   ├── export.js       export CSV, Excel (SheetJS) et rapport PDF
│   ├── favoris.js      vues enregistrées (localStorage)
│   ├── import.js       lecture d'un CSV personnel
│   ├── equipe.js       page équipe : thème et photos (indépendant de main.js)
│   └── main.js         formulaire, validation, états, préférences, lien partageable
├── backend/            serveur FastAPI (Python)
│   ├── main.py         routes de l'API et service du site
│   ├── calculs.py      statistiques, base 100, écart, prévision, ruptures (traduction de donnees.js)
│   ├── banque_mondiale.py  appel à l'API de la Banque mondiale + cache mémoire 24 h
│   ├── catalogue.py    indicateurs et pays (copie de config.js, vérifiée par les tests)
│   ├── requirements.txt
│   └── tests/          75 tests pytest (calculs, API, second essai, parité Python/JavaScript)
└── README.md
```

## Portée du projet

Le périmètre a été resserré par rapport à la fiche de proposition initiale.

**Retiré :** IndexedDB (une série pèse quelques kilo-octets, `localStorage` suffit
largement), mini-serveur Node.js, assistant IA et base SQLite : hors du périmètre d'un
cours front-end, et ils empêchaient un déploiement en fichiers statiques. Le serveur
finalement ajouté (FastAPI, en Python) est facultatif : le site reste déployable seul.

**Niveau 1 : socle (fait)**
choix de l'indicateur · période validée · multi-pays · graphique courbes/barres ·
tableau · export CSV · états chargement / erreur / aucune donnée · responsive.

**Niveau 2 : fait**
cartes d'indicateurs clés · mode sombre · préférences mémorisées ·
commentaire automatique · lien partageable via l'URL · rapport PDF (jsPDF) ·
carte choroplèthe des 16 pays d'Afrique de l'Ouest, avec classement et bande des années (précédente / suivante, flèches du clavier).

**Niveau 3 : fait**
favoris · export Excel (SheetJS) · détection de ruptures · import d'un CSV personnel.

**Indicateurs calculés par l'application : fait**
indice base 100 · écart à l'Afrique subsaharienne (menu « Calcul appliqué »).

**Bonus : serveur FastAPI (fait)**
API documentée sur `/docs` · calculs en Python · cache serveur · repli automatique sur
le navigateur · 60 tests pytest, dont la parité Python / JavaScript.

## Ce qui est importé, ce qui est calculé

Les 21 indicateurs sont **importés tels quels** de l'API de la Banque mondiale (`js/api.js`).
Tout le reste est **calculé dans le navigateur** :

| Calcul | Formule | Où |
|---|---|---|
| Variation (niveaux) | (V_fin − V_début) / \|V_début\| × 100 | `donnees.js`, `calculerStats` |
| Évolution (taux, écarts) | V_fin − V_début, en points | `donnees.js`, `calculerStats` |
| TCAM | (V_fin / V_début)^(1/n) − 1 | `donnees.js`, `calculerStats` |
| Moyenne, min, max | sur les années renseignées | `donnees.js`, `calculerStats` |
| Indice base 100 | V(t) / V(première année) × 100 | `donnees.js`, `indiceBase100` |
| Écart régional | V_pays(t) − V_Afrique subsaharienne(t) | `donnees.js`, `ecartReference` |
| Prévision 5 ans | moindres carrés sur log(V) | `donnees.js`, `prevoir` |
| Ruptures | écart à la tendance locale, score robuste > 3 + plancher | `donnees.js`, `detecterRuptures` |

## Points techniques à connaître

**L'API répond HTTP 200 même sur une requête invalide.** Le corps vaut alors
`[{ message: [...] }]` au lieu de `[métadonnées, observations]`. Tester
`response.ok` ne détecte donc rien : `api.js` inspecte le corps de la réponse.

**Les observations arrivent de la plus récente à la plus ancienne** et doivent être
triées (`construireSeries`).

**Les séries sont souvent lacunaires** : `SI.POV.DDAY` ne compte que 3 valeurs entre
2010 et 2024. Le graphique relie les points (`spanGaps`), le tableau affiche « n.d. »
et la prévision refuse de s'exécuter en dessous de 5 années renseignées.

**L'indexation se fait sur `countryiso3code`** (« CIV »), et non sur `country.value`
(« Cote d'Ivoire », sans accent) ni sur `country.id` (« CI », qui est un code ISO2).

**La prévision est log-linéaire.** On ajuste `log(V) = a + b·t` par moindres carrés,
ce qui revient à supposer un taux de croissance constant, hypothèse cohérente avec le
TCAM affiché à côté. Une droite ajustée sur `V` directement supposerait une progression
en valeur absolue constante, peu défendable sur une population ou une mortalité. Repli sur une
tendance linéaire classique quand la série contient des valeurs négatives ou nulles
(croissance démographique, écarts), où le logarithme n'est pas défini.

**Le CSV est exporté en UTF-8 avec BOM et séparateur point-virgule**, pour qu'Excel en
configuration française l'ouvre correctement sans étape d'import.

**Les bibliothèques du CDN portent un attribut `integrity`.** Ce hash doit être calculé
sur le fichier réellement servi, jamais recopié de mémoire : s'il ne correspond pas, le
navigateur refuse d'exécuter le script sans message visible dans la page. Pour le
recalculer après un changement de version :

```bash
curl -s <url> | openssl dgst -sha512 -binary | openssl base64 -A
```

**L'image du graphique insérée dans le PDF est recomposée sur fond blanc**, avec les
couleurs d'axes forcées en version claire. Une capture directe du canvas donnerait un
fond transparent et, en thème sombre, des étiquettes gris clair illisibles sur la page.

**Le lien partageable est relu avec validation.** Chaque paramètre d'URL est vérifié
contre le catalogue avant d'être appliqué : une adresse modifiée à la main ne doit pas
pouvoir mettre l'interface dans un état incohérent. Le lien l'emporte sur les
préférences enregistrées localement.

**Taux et niveaux ne se traitent pas pareil.** Pour un indicateur déjà en % (taux d'accès,
scolarisation, croissance démographique) ou un écart, l'évolution est une différence en
points : passer de 10 % à 60 % d'utilisateurs d'Internet, c'est +50 points, pas « +500 % ».
Le TCAM n'est calculé que sur des niveaux (population, mortalité...). Même règle pour la
détection de ruptures.

**Détection de ruptures.**
1. Variation annuelle : taux de croissance pour un niveau, différence en points pour un taux.
2. Tendance locale : médiane des 5 variations centrées sur l'année. Comparer à une médiane
   globale faisait passer une série qui accélère (Internet) pour « anormale » chaque année.
3. Score robuste = résidu / (1,4826 × MAD des résidus). Médiane et MAD plutôt que moyenne et
   écart-type : une rupture forte gonflerait l'écart-type et se masquerait elle-même.
4. Rupture si |score| > 3 **et** résidu au-dessus d'un plancher (3 % par an pour un niveau,
   1 point au moins pour une série en %). Sans plancher, les séries modélisées, très lisses
   (mortalité infantile), faisaient signaler des écarts de 0,1 % sans portée.

Exemples retrouvés pour la Côte d'Ivoire : vaccination contre la rougeole en 2012 (+25 points,
rattrapage après la crise de 2011), mortalité maternelle en 2020-2022 (période COVID),
Internet en 2015 (+28 points).

**Le graphique est dessiné après l'affichage de la zone de résultats.** Chart.js mesure son
conteneur à la création : dessiné dans une zone masquée, il prend une taille 0 × 0.

**Page « Notre équipe » (`equipe.html`).** Page séparée, pour garder le tableau de bord
centré sur les données. Elle a son propre script (`equipe.js`) : `main.js` cherche les
éléments du formulaire et ne doit être chargé que sur `index.html`. Le thème clair/sombre
utilise la même clé `localStorage` sur les deux pages, il suit donc la navigation. Tant
qu'une photo n'est pas déposée dans `images/`, un rond avec les initiales s'affiche à la
place d'une image cassée (`preparerPhotosEquipe`).

**Import CSV.** Même format que l'export (le fichier exporté se réimporte). Les données
restent dans le navigateur : rien n'est envoyé, elles ne se partagent ni par lien ni en favori.
Limite : les cellules entre guillemets contenant le séparateur ne sont pas gérées.

## Serveur FastAPI (bonus)

Le serveur (`backend/`) ajoute une vraie API web au projet, documentée automatiquement
sur `/docs` :

| Route | Rôle |
|---|---|
| `GET /api/sante` | le serveur répond-il ? (utilisé par le site pour choisir où calculer) |
| `GET /api/catalogue` | les 21 indicateurs, les pays, les modes de calcul |
| `GET /api/serie` | valeurs brutes de la Banque mondiale, rangées par pays et par année |
| `GET /api/analyse` | analyse complète calculée en Python : série transformée (brut, base 100, écart), statistiques, prévision, ruptures |
| `DELETE /api/cache` | vider le cache du serveur |
| `POST /api/suggestions` | formulaire de la page équipe ; une ligne JSON par message dans `backend/suggestions.jsonl` |

Exemple : `/api/analyse?indicateur=SH.IMM.MEAS&pays=CIV,GHA&debut=2000&fin=2024&ruptures=true`.

**Repli automatique.** Au chargement, le site interroge `/api/sante`. Si le serveur répond,
il lui confie les calculs ; sinon (fichier ouvert directement, simple serveur de fichiers,
serveur arrêté en cours de route), il calcule dans le navigateur. La démonstration ne
dépend donc jamais du serveur. Les données d'un CSV importé restent toujours dans le
navigateur : elles ne sont jamais envoyées au serveur.

**Paramètres vérifiés.** Indicateur, pays et années sont contrôlés contre le catalogue ;
une erreur renvoie un code 400 avec un message en français. Une panne de la Banque
mondiale renvoie un code 502 (le serveur fonctionne, c'est sa source qui a échoué).

**Tests.** `python -m pytest backend/tests -v` lance 60 tests :
- calculs vérifiés à la main (TCAM de 10 %, taux constant de 5 %, rupture de 2012…) ;
- routes de l'API, avec des données réelles enregistrées dans `backend/tests/donnees/`
  (tests hors ligne et reproductibles) ;
- second essai automatique quand la Banque mondiale est lente (15 s par essai, 2 essais) ;
- **parité Python / JavaScript** : les deux versions des calculs sont exécutées sur les
  mêmes données (Node.js lance `js/donnees.js`) et doivent donner les mêmes résultats.
  Un seuil modifié d'un seul côté fait échouer 11 tests ;
- catalogue du serveur identique à celui du site.

## Source des données

Banque mondiale, World Development Indicators, via l'API publique
`https://api.worldbank.org/v2/`. Accès libre, sans inscription ni clé.

Photos des monuments (`images/monuments/`) : Wikimedia Commons, licences libres (CC BY, CC BY-SA, domaine public) ; les crédits (auteur, licence) sont listés en pied de page (« Crédits des photos ») et au survol de chaque vignette.

**Rapport PDF.** Mise en page reprise du modèle de rapport de l'équipe : page de garde (logo, bandes, encadré du titre), sommaire avec numéros de page, introduction, I. évolution, II. comparaison (chiffres clés, prévision, ruptures), conclusion, annexe des données. 4 à 6 pages selon les options.

Carte du monde du bandeau d'accueil (`images/carte-monde.svg`) : générée depuis les données
Natural Earth 1:110m (domaine public), via le paquet `world-atlas` (licence ISC). Projection
équirectangulaire, Côte d'Ivoire en orange. Le fichier SVG est statique : aucun appel réseau.

Carte choroplèthe (`js/carte-afrique.js`) : Natural Earth 1:50m, les 16 pays d'Afrique de
l'Ouest (CEDEAO et Mauritanie), le Cap-Vert dans un encadré. L'échelle de couleurs est fixée sur toute la période choisie, pour que
la même couleur désigne la même valeur d'une année à l'autre ; un pays sans donnée est hachuré.

## Déploiement

- **En ligne (GitHub Pages)** : <https://davidbatchazi4-cloud.github.io/horizon-ouest/>. Hébergement statique :
  les calculs se font dans le navigateur, le formulaire de contact ouvre la messagerie, l'espace
  administrateur n'est pas disponible. Chaque `git push` sur `main` met le site à jour.
- **IIS (avec le serveur Python)** : voir [`deploiement-iis/LISEZ-MOI-IIS.md`](deploiement-iis/LISEZ-MOI-IIS.md).
  IIS sert le site et transmet `/api` à FastAPI par un proxy inverse (URL Rewrite + ARR).
