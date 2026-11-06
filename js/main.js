// main.js : construction de l'interface, validation, enchainement des etats.

const CLE_PREFERENCES = "bm_preferences";
const CLE_THEME = "bm_theme";
const DELAI_AVANT_MESSAGE_LENTEUR_MS = 5000;

// Etat courant de l'application : ce que l'utilisateur a choisi et ce qui est affiche.
const etat = {
	typeGraphique: "line",
	dernierRendu: null, // { annees, series, indicateur, ... } : sert aux exports
	importe: null,      // { annees, series, nom } quand un CSV personnel est affiche
};

/* ===================== Elements du document ===================== */

const el = {
	formulaire:    document.getElementById("formulaire"),
	indicateur:    document.getElementById("indicateur"),
	uniteIndic:    document.getElementById("unite-indicateur"),
	mode:          document.getElementById("mode"),
	aideMode:      document.getElementById("aide-mode"),
	anneeDebut:    document.getElementById("annee-debut"),
	anneeFin:      document.getElementById("annee-fin"),
	erreurPeriode: document.getElementById("erreur-periode"),
	listePays:     document.getElementById("liste-pays"),
	erreurPays:    document.getElementById("erreur-pays"),
	prevision:     document.getElementById("afficher-prevision"),
	ruptures:      document.getElementById("detecter-ruptures"),
	boutonAfficher:document.querySelector(".bouton--principal"),
	ajouterFavori: document.getElementById("ajouter-favori"),
	exportCsv:     document.getElementById("export-csv"),
	exportExcel:   document.getElementById("export-excel"),
	exportPdf:     document.getElementById("export-pdf"),
	copierLien:    document.getElementById("copier-lien"),
	retourAction:  document.getElementById("retour-action"),
	reinitialiser: document.getElementById("reinitialiser"),
	listeFavoris:  document.getElementById("liste-favoris"),
	favorisVide:   document.getElementById("favoris-vide"),
	fichierCsv:    document.getElementById("fichier-csv"),
	erreurImport:  document.getElementById("erreur-import"),
	bandeauImport: document.getElementById("bandeau-import"),
	quitterImport: document.getElementById("quitter-import"),
	basculeTheme:  document.getElementById("bascule-theme"),
	viderCache:    document.getElementById("vider-cache"),
	tailleCache:   document.getElementById("taille-cache"),
	titreSerie:    document.getElementById("titre-serie"),
	legendeGraph:  document.getElementById("legende-graphique"),
	notePrevision: document.getElementById("note-prevision"),
	noteMode:      document.getElementById("note-mode"),
	messageErreur: document.getElementById("message-erreur"),
	reessayer:     document.getElementById("reessayer"),
	messageChargement: document.getElementById("message-chargement"),
	chiffresSite:  document.getElementById("chiffres-site"),
	resultats:     document.querySelector(".resultats"),
	origineCalculs:document.getElementById("origine-calculs"),
	fiche:         document.getElementById("fiche"),
	ficheDefinition: document.getElementById("fiche-definition"),
	ficheSens:     document.getElementById("fiche-sens"),
	ficheOdd:      document.getElementById("fiche-odd"),
	ficheLien:     document.getElementById("fiche-lien"),
	ficheCitation: document.getElementById("fiche-citation"),
	copierCitation:document.getElementById("copier-citation"),
	majWdi:        document.getElementById("maj-wdi"),
	etats: {
		accueil:    document.getElementById("etat-accueil"),
		chargement: document.getElementById("etat-chargement"),
		erreur:     document.getElementById("etat-erreur"),
		vide:       document.getElementById("etat-vide"),
		contenu:    document.getElementById("contenu"),
	},
};

/** Un seul etat visible a la fois. */
function afficherEtat(nom) {
	for (const [cle, noeud] of Object.entries(el.etats)) {
		noeud.hidden = cle !== nom;
	}
}

/* ===================== Construction du formulaire ===================== */

function remplirIndicateurs() {
	for (const groupe of INDICATEURS) {
		const optgroup = document.createElement("optgroup");
		optgroup.label = groupe.theme;
		for (const serie of groupe.series) {
			const option = document.createElement("option");
			option.value = serie.code;
			option.textContent = serie.nom;
			optgroup.appendChild(option);
		}
		el.indicateur.appendChild(optgroup);
	}
}

const AIDE_MODES = {
	brut:    "Les valeurs publiées par la Banque mondiale, sans calcul.",
	base100: "Calcul : valeur ÷ valeur de la première année × 100. Compare des trajectoires plutôt que des niveaux.",
	ecart:   "Calcul : valeur du pays − valeur de l'Afrique subsaharienne, année par année. Positif = au-dessus de la moyenne régionale.",
};

function remplirModes() {
	for (const [code, libelle] of Object.entries(MODES_AFFICHAGE)) {
		const option = document.createElement("option");
		option.value = code;
		option.textContent = libelle;
		el.mode.appendChild(option);
	}
}

function majAideMode() {
	el.aideMode.textContent = AIDE_MODES[el.mode.value] || "";
}

function remplirPays() {
	for (const pays of PAYS) {
		const label = document.createElement("label");
		label.className = "case" + (pays.agregat ? " case--agregat" : "");

		const case_ = document.createElement("input");
		case_.type = "checkbox";
		case_.value = pays.iso3;
		case_.checked = Boolean(pays.defaut);

		// Pas de pastille de couleur ici : la legende du graphique suffit.
		const nom = document.createElement("span");
		nom.textContent = pays.nom;

		label.append(case_, nom);
		el.listePays.appendChild(label);
	}
}

function paysSelectionnes() {
	return [...el.listePays.querySelectorAll("input:checked")].map(c => c.value);
}

function majUnite() {
	const indicateur = trouverIndicateur(el.indicateur.value);
	el.uniteIndic.textContent = indicateur ? "Unité : " + indicateur.unite : "";
}

/* ===================== Bandeau d'accueil ===================== */

/** Chiffres du bandeau, calcules depuis le catalogue (ils suivent ses evolutions). */
function remplirAccueil() {
	const nbIndicateurs = INDICATEURS.reduce((n, g) => n + g.series.length, 0);
	const nbPays = PAYS.filter(p => !p.agregat).length;
	const nbRegions = PAYS.length - nbPays;
	const chiffres = [
		`${nbIndicateurs} indicateurs`,
		`${INDICATEURS.length} thèmes`,
		`${nbPays} pays et ${nbRegions} régions`,
		`Données depuis ${ANNEE_MIN}`,
	];
	for (const texte of chiffres) {
		const li = document.createElement("li");
		li.textContent = texte;
		el.chiffresSite.appendChild(li);
	}
}

/* ===================== Validation ===================== */

/** @returns {{valide: boolean, debut?: number, fin?: number, pays?: string[]}} */
function validerFormulaire() {
	let valide = true;
	el.erreurPeriode.textContent = "";
	el.erreurPays.textContent = "";
	el.anneeDebut.classList.remove("invalide");
	el.anneeFin.classList.remove("invalide");

	const debut = Number(el.anneeDebut.value);
	const fin = Number(el.anneeFin.value);

	if (!Number.isInteger(debut) || !Number.isInteger(fin) || !el.anneeDebut.value || !el.anneeFin.value) {
		el.erreurPeriode.textContent = "Saisissez deux années entières.";
		el.anneeDebut.classList.add("invalide");
		el.anneeFin.classList.add("invalide");
		valide = false;
	} else if (debut < ANNEE_MIN || fin > ANNEE_MAX) {
		el.erreurPeriode.textContent = `Les années doivent être comprises entre ${ANNEE_MIN} et ${ANNEE_MAX}.`;
		el.anneeDebut.classList.add("invalide");
		el.anneeFin.classList.add("invalide");
		valide = false;
	} else if (debut > fin) {
		el.erreurPeriode.textContent = "L'année de début doit précéder l'année de fin.";
		el.anneeDebut.classList.add("invalide");
		valide = false;
	}

	const pays = paysSelectionnes();
	if (pays.length === 0) {
		el.erreurPays.textContent = "Sélectionnez au moins un pays.";
		valide = false;
	} else if (el.mode.value === "ecart" && pays.every(p => p === ISO_REFERENCE_ECART)) {
		el.erreurPays.textContent = "En mode écart, choisissez au moins un pays autre que l'Afrique subsaharienne.";
		valide = false;
	}

	return valide ? { valide, debut, fin, pays } : { valide: false };
}

/* ===================== Rendu commun (API ou CSV importe) ===================== */

/**
 * Applique le calcul choisi, la prevision et la detection de ruptures,
 * puis dessine cartes, graphique, tableau. Utilise pour les donnees de l'API
 * comme pour un CSV importe : le traitement est le meme.
 *
 * @param {object} p
 * @param {number[]} p.annees
 * @param {Map<string,(number|null)[]>} p.series       series brutes
 * @param {object} p.indicateur                         entree du catalogue (ou descripteur d'import)
 * @param {(number|null)[]|null} p.reference            serie SSF pour le mode ecart
 * @param {"api"|"import"|"comparatif"} p.source  comparatif = CSV importe + Banque mondiale
 * @param {object|null} [p.calculServeur]  resultats deja calcules par le serveur Python
 *        ({ series, indicateur, previsions, ruptures }) ; absent = calcul dans le navigateur
 * @returns {boolean} faux si rien n'est affichable
 */
function rendre({ annees, series: seriesBrutes, indicateur: indicateurBrut, reference, debut, fin, source, calculServeur = null }) {
	// 1. Calcul applique (valeurs brutes, base 100 ou ecart)
	const mode = el.mode.value;
	const { series, indicateur } = calculServeur
		|| transformerSeries(annees, seriesBrutes, indicateurBrut, mode, reference);

	if (series.size === 0 || [...series.values()].every(serieVide)) {
		afficherEtat("vide");
		etat.dernierRendu = null;
		return false;
	}

	el.noteMode.hidden = mode === "brut";
	if (mode === "base100") {
		el.noteMode.textContent = "Indice calculé par l'application : chaque série vaut 100 sa première année renseignée. "
			+ "Une série dont la première valeur est négative ou nulle ne peut pas être indicée.";
	} else if (mode === "ecart") {
		el.noteMode.textContent = "Écart calculé par l'application, uniquement sur les années où le pays "
			+ "et l'Afrique subsaharienne sont tous deux renseignés.";
	}

	// 2. Prevision
	let previsions = null;
	if (el.prevision.checked) {
		if (calculServeur && calculServeur.previsions) {
			previsions = calculServeur.previsions;
		} else {
			previsions = new Map();
			for (const [iso3, valeurs] of series) {
				const p = prevoir(annees, valeurs, 5);
				if (p) previsions.set(iso3, p);
			}
		}
		const methodes = new Set([...previsions.values()].map(p => p.methode));
		el.notePrevision.hidden = false;
		el.notePrevision.textContent = previsions.size === 0
			? `Prévision impossible : il faut au moins ${MIN_POINTS_PREVISION} années renseignées sur la période choisie.`
			: "Projection indicative sur 5 ans : " + [...methodes].join(" ; ")
				+ ". Elle prolonge une tendance passée et ne tient compte d'aucun choc (crise, épidémie, réforme).";
	} else {
		el.notePrevision.hidden = true;
	}

	// 3. Ruptures
	let ruptures = null;
	if (el.ruptures.checked) {
		if (calculServeur && calculServeur.ruptures) {
			ruptures = calculServeur.ruptures;
		} else {
			ruptures = new Map();
			for (const [iso3, valeurs] of series) {
				const r = detecterRuptures(annees, valeurs, indicateur.format);
				if (r.length > 0) ruptures.set(iso3, r);
			}
		}
	}

	// 4. Affichage
	const commentaire = commenterSerie(annees, series, indicateur);
	el.titreSerie.textContent = `${indicateur.nom} (${indicateur.unite}), ${debut}-${fin}`;
	el.legendeGraph.textContent = commentaire;
	el.bandeauImport.hidden = source === "api";
	const calculePar = calculServeur ? "serveur" : "navigateur";
	el.origineCalculs.textContent = calculServeur
		? "Calculs effectués par le serveur Python (FastAPI)."
		: "Calculs effectués dans le navigateur (JavaScript).";

	// La zone doit etre visible AVANT de dessiner : Chart.js mesure son conteneur
	// a la creation, et un conteneur masque mesure 0 x 0 (graphique vide).
	afficherEtat("contenu");
	dessinerCartes(annees, series, indicateur);
	remplirFiche(source !== "import" ? indicateur : null, debut, fin, [...series.keys()]);
	dessinerGraphique(etat.typeGraphique, annees, series, indicateur, previsions, ruptures);
	dessinerTableau(annees, series, indicateur, ruptures);
	dessinerRuptures(ruptures, indicateur);

	etat.dernierRendu = { annees, series, indicateur, commentaire, debut, fin, previsions, ruptures, source, calculePar };
	return true;
}

/* ===================== Fiche et citation ===================== */

/** « Comprendre l'indicateur » : definition, sens, cible, source et citation. */
function remplirFiche(indicateur, debut, fin, codesPays) {
	el.fiche.hidden = !indicateur;
	if (!indicateur) return;
	const fiche = ficheIndicateur(indicateur.code);
	el.ficheDefinition.textContent = fiche.definition;
	el.ficheSens.textContent = fiche.sens === 1 ? "Plus la valeur est élevée, mieux c'est."
		: fiche.sens === -1 ? "Plus la valeur est basse, mieux c'est."
		: "Ni une hausse ni une baisse n'est bonne en soi : tout dépend du contexte.";
	el.ficheOdd.hidden = !fiche.odd;
	el.ficheOdd.textContent = fiche.odd ? "Cible : " + fiche.odd.texte + "." : "";
	el.ficheLien.href = `https://donnees.banquemondiale.org/indicateur/${indicateur.code}`;
	el.ficheLien.textContent = indicateur.code;
	const pays = codesPays.map(c => trouverPays(c).nom).join(", ");
	const jour = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
	el.ficheCitation.textContent = `Horizon Ouest (ENSEA Abidjan), « ${indicateur.nom} », ${pays}, ${debut}-${fin}. `
		+ `D'après Banque mondiale, World Development Indicators (${indicateur.code}). Consulté le ${jour}.`;
}

async function copierCitation() {
	majLien();
	try {
		await navigator.clipboard.writeText(el.ficheCitation.textContent + " " + location.href);
		retour("Citation copiée dans le presse-papiers.");
	} catch {
		retour("Copie impossible : sélectionnez le texte de la citation.", true);
	}
}

/** Date de mise a jour de la base WDI (affichee en pied de page ; rien si l'API ne repond pas). */
async function afficherMiseAJour() {
	try {
		const corps = await telechargerJson("https://api.worldbank.org/v2/sources/2?format=json");
		const date = corps?.[1]?.[0]?.lastupdated;
		if (!date) return;
		const texte = new Date(date + "T00:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
		el.majWdi.textContent = `, mise à jour le ${texte}`;
	} catch { /* information facultative */ }
}

/* ===================== Enchainement principal (API) ===================== */

let requeteEnCours = false;

async function afficherResultats() {
	if (requeteEnCours) return;

	const choix = validerFormulaire();
	if (!choix.valide) return;

	// Un affichage depuis le formulaire quitte le mode « CSV importe ».
	quitterModeImport();

	const codeIndicateur = el.indicateur.value;
	const indicateur = trouverIndicateur(codeIndicateur);

	// En mode ecart, la serie de l'Afrique subsaharienne est necessaire meme si
	// elle n'est pas cochee : on l'ajoute a la requete, sans l'afficher.
	const avecReference = el.mode.value === "ecart";
	const paysRequete = avecReference && !choix.pays.includes(ISO_REFERENCE_ECART)
		? [...choix.pays, ISO_REFERENCE_ECART]
		: choix.pays;

	requeteEnCours = true;
	el.boutonAfficher.disabled = true;
	afficherEtat("chargement");
	// Si la Banque mondiale tarde, on le dit : sinon le site semble bloque.
	el.messageChargement.textContent = "Chargement des données…";
	const minuterieLenteur = setTimeout(() => {
		el.messageChargement.textContent = "La Banque mondiale met du temps à répondre. "
			+ "Le site patiente et réessaiera automatiquement si besoin…";
	}, DELAI_AVANT_MESSAGE_LENTEUR_MS);

	try {
		// Avec le serveur Python : il charge les donnees et fait tous les calculs.
		if (await serveurDisponible()) {
			try {
				const r = await chargerAnalyse({
					indicateur: codeIndicateur, pays: choix.pays, debut: choix.debut, fin: choix.fin,
					mode: el.mode.value, prevision: el.prevision.checked, ruptures: el.ruptures.checked,
				});
				const calculServeur = analyseVersRendu(r);
				const affiche = !r.vide && rendre({
					annees: r.annees, series: null, indicateur, reference: null,
					debut: choix.debut, fin: choix.fin, source: "api", calculServeur,
				});
				if (affiche) {
					enregistrerPreferences();
					majLien();
					majCarte(codeIndicateur, choix.debut, choix.fin);
				} else {
					afficherEtat("vide");
					etat.dernierRendu = null;
				}
				return;
			} catch (erreur) {
				if (!(erreur instanceof ServeurIndisponible)) throw erreur;
				// Le serveur s'est arrete : on continue sans lui, dans le navigateur.
				console.warn("Serveur Python indisponible, calcul dans le navigateur.", erreur);
				oublierServeur();
			}
		}

		const observations = await chargerIndicateur(paysRequete, codeIndicateur, choix.debut, choix.fin);
		const { annees, series: toutes } = construireSeries(observations, paysRequete);

		const series = new Map(choix.pays.map(iso => [iso, toutes.get(iso)]));
		const reference = avecReference ? toutes.get(ISO_REFERENCE_ECART) : null;

		// Requete valide mais aucune valeur exploitable : etat dedie, pas une erreur.
		if (annees.length === 0 || [...series.values()].every(serieVide)) {
			afficherEtat("vide");
			etat.dernierRendu = null;
			return;
		}

		if (rendre({ annees, series, indicateur, reference, debut: choix.debut, fin: choix.fin, source: "api" })) {
			enregistrerPreferences();
			majLien();
			majCarte(codeIndicateur, choix.debut, choix.fin);
		}

	} catch (erreur) {
		// Pour une erreur attendue, le message suffit. Pour le reste, on affiche aussi
		// le detail technique : sans lui, une panne est indiagnosticable en demonstration.
		el.messageErreur.textContent = erreur instanceof ErreurApi
			? erreur.message
			: `Une erreur inattendue est survenue (${erreur.name} : ${erreur.message}).`;
		afficherEtat("erreur");
		console.error(erreur);
	} finally {
		clearTimeout(minuterieLenteur);
		requeteEnCours = false;
		el.boutonAfficher.disabled = false;
		majTailleCache();
	}
}

/**
 * Convertit la reponse JSON de /api/analyse dans les structures utilisees par
 * l'affichage (Map par pays). Les objets JSON gardent l'ordre des pays demandes.
 */
function analyseVersRendu(r) {
	const enMap = (objet) => (objet ? new Map(Object.entries(objet)) : null);
	const ruptures = enMap(r.ruptures);
	if (ruptures) {
		// JSON ne connait pas l'infini : un score null signifie « serie jusque-la
		// parfaitement reguliere » ; on retrouve son signe grace au residu.
		for (const liste of ruptures.values()) {
			for (const rupture of liste) {
				if (rupture.score === null) rupture.score = Math.sign(rupture.residu) * Infinity;
			}
		}
	}
	return {
		series: new Map(Object.entries(r.series)),
		indicateur: r.indicateur,
		previsions: enMap(r.previsions),
		ruptures,
	};
}

/**
 * Apres un changement d'option (calcul, prevision, ruptures), on reaffiche
 * directement si des resultats sont deja a l'ecran. Cote API, la serie est en cache :
 * aucun nouvel appel reseau.
 */
function rafraichirSiAffiche() {
	if (!etat.dernierRendu) return;
	if (etat.importe) afficherImport();
	else afficherResultats();
}

/* ===================== Import d'un CSV personnel ===================== */
//
// Apres lecture du fichier, une fenetre demande ce que mesurent les chiffres (un indicateur
// du catalogue) et la periode : on charge alors les memes series de la Banque mondiale pour
// les pays coches, et on affiche le tout ensemble (source « comparatif »).
// Sans indicateur (« Mes donnees seules »), le fichier s'affiche seul, comme avant.

let importEnAttente = null; // fichier lu, en attente des choix de la fenetre

/** Pays de la Banque mondiale mis en regard des donnees importees : ceux qui sont coches. */
function paysComparaison() {
	const pays = paysSelectionnes();
	return pays.length ? pays : ["CIV", ISO_REFERENCE_ECART];
}

/** Reunit plusieurs jeux {annees, series} sur un axe d'annees commun, borne a [debut, fin]. */
function fusionnerSeries(jeux, debut, fin) {
	const annees = [...new Set(jeux.flatMap(j => j.annees))].filter(a => a >= debut && a <= fin).sort((a, b) => a - b);
	const series = new Map();
	for (const j of jeux) {
		for (const [cle, valeurs] of j.series) {
			const parAnnee = new Map(j.annees.map((a, i) => [a, valeurs[i]]));
			series.set(cle, annees.map(a => parAnnee.get(a) ?? null));
		}
	}
	return { annees, series };
}

async function afficherImport() {
	const importe = etat.importe;
	const { annees, series, nom, code } = importe;
	masquerCarte(); // la carte ne montre que les donnees de la Banque mondiale

	// L'ecart a l'Afrique subsaharienne n'a pas de sens pour des donnees quelconques.
	if (el.mode.value === "ecart") {
		el.mode.value = "brut";
		majAideMode();
		retour("Le mode « écart » ne s'applique pas aux données importées.", true);
	}

	if (!code) {
		const indicateur = { code: nomFichierSur(nom), nom, unite: "unité du fichier", format: "nombre" };
		rendre({
			annees, series, indicateur, reference: null,
			debut: annees[0], fin: annees[annees.length - 1], source: "import",
		});
		return;
	}

	// Comparatif : series importees d'abord (les cartes cles les decrivent), puis la Banque mondiale.
	const { debut, fin } = importe;
	const indicateur = trouverIndicateur(code);
	const pays = paysComparaison();
	afficherEtat("chargement");
	el.messageChargement.textContent = "Chargement des données de la Banque mondiale pour la comparaison…";
	try {
		const observations = await chargerIndicateur(pays, code, debut, fin);
		if (etat.importe !== importe) return; // l'utilisateur est passe a autre chose entre-temps
		const bm = construireSeries(observations, pays);
		const tout = fusionnerSeries([{ annees, series }, bm], debut, fin);
		if (!tout.annees.length) {
			afficherEtat("vide");
			etat.dernierRendu = null;
			return;
		}
		rendre({ annees: tout.annees, series: tout.series, indicateur, reference: null, debut, fin, source: "comparatif" });
	} catch (erreur) {
		el.messageErreur.textContent = erreur instanceof ErreurApi
			? "Vos données sont bien lues, mais celles de la Banque mondiale n'ont pas pu être chargées : " + erreur.message
			: `Une erreur inattendue est survenue (${erreur.name} : ${erreur.message}).`;
		afficherEtat("erreur");
		console.error(erreur);
	}
}

/** Ouvre la fenetre de choix, pre-remplie avec les annees du fichier et l'indicateur courant. */
function ouvrirDialogueImport(lu) {
	importEnAttente = lu;
	const premier = lu.annees[0], dernier = lu.annees[lu.annees.length - 1];
	document.getElementById("import-resume").textContent =
		`« ${lu.nom} » : ${lu.series.size} série(s) (${[...lu.series.keys()].join(", ")}), de ${premier} à ${dernier}.`;
	const select = document.getElementById("import-indicateur");
	if (!select.options.length) {
		for (const groupe of INDICATEURS) {
			const og = document.createElement("optgroup");
			og.label = groupe.theme;
			for (const s of groupe.series) og.appendChild(new Option(s.nom, s.code));
			select.appendChild(og);
		}
		select.addEventListener("change", majUniteImport);
	}
	select.value = el.indicateur.value;
	majUniteImport();
	document.getElementById("import-debut").value = Math.max(premier, ANNEE_MIN);
	document.getElementById("import-fin").value = Math.min(dernier, ANNEE_MAX);
	document.getElementById("import-erreur").textContent = "";
	document.getElementById("import-pays").textContent = "Comparé avec : "
		+ paysComparaison().map(p => trouverPays(p).nom).join(", ")
		+ ". Pour en changer, annulez puis cochez d'autres pays dans « Pays à comparer ».";
	document.getElementById("dialogue-import").showModal();
}

function majUniteImport() {
	const s = trouverIndicateur(document.getElementById("import-indicateur").value);
	document.getElementById("import-unite").textContent = s
		? `Unité attendue dans votre fichier : ${s.unite}. ${ficheIndicateur(s.code).definition}` : "";
}

/** Validation de la fenetre : « comparer » (indicateur + periode) ou « seul ». */
function validerDialogueImport(action) {
	const lu = importEnAttente;
	if (!lu) return;
	if (action === "comparer") {
		const debut = Number(document.getElementById("import-debut").value);
		const fin = Number(document.getElementById("import-fin").value);
		const erreur = document.getElementById("import-erreur");
		if (!Number.isInteger(debut) || !Number.isInteger(fin) || debut < ANNEE_MIN || fin > ANNEE_MAX || debut > fin) {
			erreur.textContent = `Saisissez deux années entre ${ANNEE_MIN} et ${ANNEE_MAX}, la première avant la seconde.`;
			return;
		}
		if (!lu.annees.some(a => a >= debut && a <= fin)) {
			erreur.textContent = "Votre fichier n'a aucune année dans cette période.";
			return;
		}
		const code = document.getElementById("import-indicateur").value;
		etat.importe = { ...lu, code, debut, fin };
		// Le formulaire suit le comparatif : changer d'option (prevision, base 100) le reaffiche.
		el.indicateur.value = code;
		el.anneeDebut.value = debut;
		el.anneeFin.value = fin;
		majUnite();
	} else {
		etat.importe = { ...lu, code: null };
	}
	importEnAttente = null;
	document.getElementById("dialogue-import").close();
	history.replaceState(null, "", location.pathname); // un import ne se partage pas par lien
	afficherImport();
	el.resultats.scrollIntoView({ behavior: "smooth", block: "start" });
	retour(`${lu.series.size} série(s) importée(s) sur ${lu.annees.length} année(s).`);
}

async function importerFichier() {
	const fichier = el.fichierCsv.files[0];
	el.fichierCsv.value = ""; // permet de reimporter le meme fichier apres correction
	if (!fichier) return;

	el.erreurImport.textContent = "";
	try {
		const { annees, series } = await importerCsv(fichier);
		ouvrirDialogueImport({ annees, series, nom: fichier.name.replace(/\.[^.]+$/, "") });
	} catch (erreur) {
		el.erreurImport.textContent = erreur instanceof ErreurImport
			? erreur.message
			: "Import impossible : " + erreur.message;
		console.error(erreur);
	}
}

function brancherDialogueImport() {
	const dialogue = document.getElementById("dialogue-import");
	document.getElementById("formulaire-import").addEventListener("submit", (e) => {
		e.preventDefault();
		validerDialogueImport(e.submitter?.value || "comparer");
	});
	document.getElementById("import-annuler").addEventListener("click", () => dialogue.close());
	// Fermeture sans choix (Annuler, Echap) : l'import est abandonne, l'affichage ne change pas.
	dialogue.addEventListener("close", () => {
		if (importEnAttente) {
			importEnAttente = null;
			if (!etat.importe) PAYS_IMPORTES.length = 0;
		}
	});
}

function quitterModeImport() {
	etat.importe = null;
	PAYS_IMPORTES.length = 0;
	el.bandeauImport.hidden = true;
}

/* ===================== Favoris ===================== */

function choixCourant() {
	return {
		indicateur: el.indicateur.value,
		debut: Number(el.anneeDebut.value),
		fin: Number(el.anneeFin.value),
		pays: paysSelectionnes(),
		mode: el.mode.value,
		typeGraphique: etat.typeGraphique,
		prevision: el.prevision.checked,
		ruptures: el.ruptures.checked,
	};
}

function enregistrerFavori() {
	if (etat.importe) {
		retour("Les données importées ne peuvent pas être mises en favori.", true);
		return;
	}
	if (!validerFormulaire().valide) return;
	const resultat = ajouterFavori(choixCourant());
	retour(resultat.message, !resultat.ok);
	if (resultat.ok) afficherFavoris();
}

function afficherFavoris() {
	const liste = lireFavoris();
	el.listeFavoris.textContent = "";
	el.favorisVide.hidden = liste.length > 0;

	for (const favori of liste) {
		const li = document.createElement("li");

		const ouvrir = document.createElement("button");
		ouvrir.type = "button";
		ouvrir.className = "favori__ouvrir";
		ouvrir.textContent = favori.nom;
		ouvrir.title = favori.nom;
		ouvrir.addEventListener("click", () => ouvrirFavori(favori));

		const supprimer = document.createElement("button");
		supprimer.type = "button";
		supprimer.className = "favori__supprimer";
		supprimer.textContent = "×";
		supprimer.setAttribute("aria-label", "Supprimer le favori " + favori.nom);
		supprimer.addEventListener("click", () => {
			supprimerFavori(favori.id);
			afficherFavoris();
		});

		li.append(ouvrir, supprimer);
		el.listeFavoris.appendChild(li);
	}
}

/** Applique un favori au formulaire (avec les memes controles que le lien partageable). */
function ouvrirFavori(favori) {
	appliquerChoix(favori.choix);
	afficherResultats();
}

/**
 * Applique un ensemble de choix au formulaire, en verifiant chaque valeur contre
 * le catalogue : favori ancien, preferences ou lien modifie a la main ne doivent
 * pas pouvoir mettre l'interface dans un etat incoherent.
 */
function appliquerChoix(c) {
	if (c.indicateur && trouverIndicateur(c.indicateur)) el.indicateur.value = c.indicateur;

	const debut = Number(c.debut);
	const fin = Number(c.fin);
	if (Number.isInteger(debut) && debut >= ANNEE_MIN && debut <= ANNEE_MAX) el.anneeDebut.value = debut;
	if (Number.isInteger(fin) && fin >= ANNEE_MIN && fin <= ANNEE_MAX) el.anneeFin.value = fin;

	const pays = (c.pays || []).filter(code => PAYS.some(p => p.iso3 === code));
	if (pays.length > 0) {
		for (const caseP of el.listePays.querySelectorAll("input")) caseP.checked = pays.includes(caseP.value);
	}

	if (c.mode in MODES_AFFICHAGE) el.mode.value = c.mode;
	if (c.typeGraphique === "bar" || c.typeGraphique === "line") changerTypeGraphique(c.typeGraphique);
	el.prevision.checked = Boolean(c.prevision);
	el.ruptures.checked = Boolean(c.ruptures);

	majUnite();
	majAideMode();
}

/* ===================== Exports (delegues a export.js) ===================== */

let minuterieRetour = null;

/** Message bref sous les boutons : confirmation ou echec d'une action. */
function retour(message, estErreur = false) {
	el.retourAction.textContent = message;
	el.retourAction.style.color = estErreur ? "var(--rouge)" : "var(--vert)";
	clearTimeout(minuterieRetour);
	minuterieRetour = setTimeout(() => { el.retourAction.textContent = ""; }, 4000);
}

/** Enveloppe commune aux exports : rien a exporter, ou echec de la bibliotheque. */
function lancerExport(fonction, nomAction) {
	if (!etat.dernierRendu) {
		retour("Affichez d'abord des données.", true);
		return;
	}
	try {
		fonction(etat.dernierRendu);
		retour(nomAction + " généré.");
	} catch (erreur) {
		retour(erreur instanceof ErreurApi ? erreur.message : nomAction + " impossible.", true);
		console.error(erreur);
	}
}

/* ===================== Lien partageable ===================== */

/** Encode les choix courants dans l'adresse, sans recharger la page. */
function majLien() {
	const params = new URLSearchParams({
		i: el.indicateur.value,
		d: el.anneeDebut.value,
		f: el.anneeFin.value,
		p: paysSelectionnes().join(","),
		g: etat.typeGraphique,
	});
	if (el.mode.value !== "brut") params.set("m", el.mode.value);
	if (el.prevision.checked) params.set("prev", "1");
	if (el.ruptures.checked) params.set("r", "1");
	history.replaceState(null, "", "?" + params.toString());
}

/**
 * Applique les parametres d'URL au formulaire (valides par appliquerChoix).
 * @returns {boolean} vrai si l'adresse contenait des parametres exploitables
 */
function lireLien() {
	const params = new URLSearchParams(location.search);
	if (![...params.keys()].length) return false;

	appliquerChoix({
		indicateur: params.get("i"),
		debut: params.get("d"),
		fin: params.get("f"),
		pays: (params.get("p") || "").split(","),
		mode: params.get("m") || "brut",
		typeGraphique: params.get("g"),
		prevision: params.get("prev") === "1",
		ruptures: params.get("r") === "1",
	});
	return true;
}

async function copierLien() {
	if (etat.importe) {
		retour("Les données importées restent sur votre ordinateur : elles ne se partagent pas par lien.", true);
		return;
	}
	majLien();
	try {
		await navigator.clipboard.writeText(location.href);
		retour("Lien copié dans le presse-papiers.");
	} catch {
		// L'API presse-papiers exige un contexte securise (https ou 127.0.0.1).
		retour("Copie impossible : sélectionnez l'adresse dans la barre du navigateur.", true);
	}
}

/* ===================== Preferences et theme ===================== */

function enregistrerPreferences() {
	try {
		localStorage.setItem(CLE_PREFERENCES, JSON.stringify(choixCourant()));
	} catch { /* stockage indisponible : sans consequence */ }
}

function chargerPreferences() {
	let prefs = null;
	try {
		prefs = JSON.parse(localStorage.getItem(CLE_PREFERENCES));
	} catch { /* ignore */ }

	el.anneeDebut.min = el.anneeFin.min = ANNEE_MIN;
	el.anneeDebut.max = el.anneeFin.max = ANNEE_MAX;

	// Par defaut on s'arrete a l'annee precedente : la Banque mondiale publie avec
	// un decalage, l'annee en cours est presque toujours vide.
	el.anneeDebut.value = 2000;
	el.anneeFin.value = ANNEE_MAX - 1;

	if (prefs && typeof prefs === "object") appliquerChoix(prefs);
	majUnite();
	majAideMode();
}

function changerTypeGraphique(type) {
	etat.typeGraphique = type;
	for (const bouton of document.querySelectorAll(".bascule__option")) {
		const actif = bouton.dataset.type === type;
		bouton.classList.toggle("actif", actif);
		bouton.setAttribute("aria-pressed", String(actif));
	}
}

function appliquerTheme(theme) {
	document.documentElement.setAttribute("data-theme", theme);
	try { localStorage.setItem(CLE_THEME, theme); } catch { /* ignore */ }
	rafraichirCouleursGraphique();
	colorierCarte();
}

function majTailleCache() {
	el.tailleCache.textContent = tailleCache() + " série(s)";
}

/* ===================== Branchement des evenements ===================== */

function brancherEvenements() {
	el.formulaire.addEventListener("submit", (e) => {
		e.preventDefault();
		afficherResultats();
	});

	el.indicateur.addEventListener("change", majUnite);
	el.mode.addEventListener("change", () => {
		majAideMode();
		rafraichirSiAffiche();
	});
	el.prevision.addEventListener("change", rafraichirSiAffiche);
	el.ruptures.addEventListener("change", rafraichirSiAffiche);

	el.reessayer.addEventListener("click", afficherResultats);
	el.ajouterFavori.addEventListener("click", enregistrerFavori);
	el.exportCsv.addEventListener("click", () => lancerExport(exporterCsv, "Fichier CSV"));
	el.exportExcel.addEventListener("click", () => lancerExport(exporterExcel, "Fichier Excel"));
	el.exportPdf.addEventListener("click", () => lancerExport(exporterPdf, "Rapport PDF"));
	el.copierLien.addEventListener("click", copierLien);
	el.copierCitation.addEventListener("click", copierCitation);

	el.fichierCsv.addEventListener("change", importerFichier);
	el.quitterImport.addEventListener("click", afficherResultats);
	brancherDialogueImport();

	for (const bouton of document.querySelectorAll(".bascule__option")) {
		bouton.addEventListener("click", () => {
			changerTypeGraphique(bouton.dataset.type);
			// Changer courbes/barres ne touche pas aux donnees : on redessine
			// a partir du dernier rendu au lieu de relancer tout l'enchainement.
			if (etat.dernierRendu) {
				const r = etat.dernierRendu;
				dessinerGraphique(etat.typeGraphique, r.annees, r.series, r.indicateur, r.previsions, r.ruptures);
			}
			if (!etat.importe) {
				enregistrerPreferences();
				if (etat.dernierRendu) majLien();
			}
		});
	}

	el.basculeTheme.addEventListener("click", () => {
		const actuel = document.documentElement.getAttribute("data-theme");
		appliquerTheme(actuel === "sombre" ? "clair" : "sombre");
	});

	el.reinitialiser.addEventListener("click", () => {
		try { localStorage.removeItem(CLE_PREFERENCES); } catch { /* ignore */ }
		history.replaceState(null, "", location.pathname);
		quitterModeImport();
		el.indicateur.selectedIndex = 0;
		el.mode.value = "brut";
		el.anneeDebut.value = 2000;
		el.anneeFin.value = ANNEE_MAX - 1;
		el.prevision.checked = false;
		el.ruptures.checked = false;
		el.erreurImport.textContent = "";
		for (const c of el.listePays.querySelectorAll("input")) {
			c.checked = trouverPays(c.value).defaut === true;
		}
		changerTypeGraphique("line");
		validerFormulaire();
		majUnite();
		majAideMode();
		afficherEtat("accueil");
		etat.dernierRendu = null;
	});

	el.viderCache.addEventListener("click", () => {
		viderCache();
		majTailleCache();
	});
}

/* ===================== Demarrage ===================== */

function demarrer() {
	remplirIndicateurs();
	remplirModes();
	remplirPays();
	remplirAccueil();
	chargerPreferences();
	// Une adresse partagee l'emporte sur les preferences locales : la personne
	// qui ouvre le lien doit voir la vue decrite par le lien, pas la sienne.
	const depuisLien = lireLien();
	brancherEvenements();
	afficherFavoris();

	let theme = null;
	try { theme = localStorage.getItem(CLE_THEME); } catch { /* ignore */ }
	if (!theme) {
		theme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "sombre" : "clair";
	}
	document.documentElement.setAttribute("data-theme", theme);

	majTailleCache();
	afficherEtat("accueil");
	afficherMiseAJour();

	// Le lien partage doit afficher directement son contenu, sans clic supplementaire.
	if (depuisLien) afficherResultats();
}

document.addEventListener("DOMContentLoaded", demarrer);
