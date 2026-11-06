// carte.js : carte choroplethe des 16 pays d'Afrique de l'Ouest.
// Chaque pays est colore selon la valeur de l'indicateur pour l'annee choisie
// dans la bande des annees, et un classement a cote de la carte donne les valeurs exactes
// (y compris pour les petits pays ou l'on ne peut pas ecrire sur la carte).
//
// L'echelle de couleurs est fixee sur TOUTE la periode : une meme couleur
// represente la meme valeur quelle que soit l'annee, ce qui rend les annees
// comparables entre elles quand on passe de l'une a l'autre.

const PAYS_CARTE = CARTE_AFRIQUE.pays.map(p => p.iso3);
const NOM_CARTE = Object.fromEntries(CARTE_AFRIQUE.pays.map(p => [p.iso3, p.nom]));

const etatCarte = {
	donnees: null,  // { annees, series (Map), indicateur, min, max }
	valeurs: null,  // Map iso3 -> valeur pour l'annee affichee
	annee: null,    // annee affichee
	anneesBande: [], // annees proposees dans la bande (celles ou au moins un pays est renseigne)
	jeton: 0,       // ignore une reponse arrivee apres une demande plus recente
};

const elCarte = {
	bloc:        document.getElementById("bloc-carte"),
	svg:         document.getElementById("carte-svg"),
	zone:        document.getElementById("carte-zone"),
	annee:       document.getElementById("carte-annee"),
	grandeAnnee: document.getElementById("carte-grande-annee"),
	sousTitre:   document.getElementById("carte-sous-titre"),
	classement:  document.getElementById("carte-classement"),
	infobulle:   document.getElementById("carte-infobulle"),
	bande:       document.getElementById("carte-bande"),
	precedente:  document.getElementById("carte-precedente"),
	suivante:    document.getElementById("carte-suivante"),
	min:         document.getElementById("carte-min"),
	max:         document.getElementById("carte-max"),
	note:        document.getElementById("carte-note"),
};

function creerSvg(nom, attributs) {
	const noeud = document.createElementNS(SVG_NS, nom);
	for (const [cle, valeur] of Object.entries(attributs)) noeud.setAttribute(cle, valeur);
	return noeud;
}

/** Construit une fois les contours : pays voisins en gris, 16 pays coloriables. */
function construireCarte() {
	const { largeur, hauteur, voisins, encadre, pays } = CARTE_AFRIQUE;
	elCarte.svg.setAttribute("viewBox", `0 0 ${largeur} ${hauteur}`);
	elCarte.svg.appendChild(creerSvg("path", { d: voisins, class: "choro__voisins" }));
	elCarte.svg.appendChild(creerSvg("rect", {
		x: encadre.x, y: encadre.y, width: encadre.l, height: encadre.h, class: "choro__encadre",
	}));
	const nomEncadre = creerSvg("text", {
		x: encadre.x + encadre.l / 2, y: encadre.y + encadre.h + 11, class: "choro__nom-encadre",
	});
	nomEncadre.textContent = "Cap-Vert";
	elCarte.svg.appendChild(nomEncadre);
	for (const p of pays) {
		elCarte.svg.appendChild(creerSvg("path", { d: p.d, class: "choro__pays", "data-iso3": p.iso3 }));
	}
	// Les etiquettes passent au-dessus de toutes les formes.
	for (const p of pays) {
		if (!p.etiquette) continue;
		const [x, y] = p.etiquette;
		elCarte.svg.appendChild(creerSvg("text", { x, y, class: "choro__valeur", "data-iso3": p.iso3 }));
	}

	// Survol : la carte et le classement se repondent.
	elCarte.svg.addEventListener("pointermove", (e) => {
		const iso3 = e.target.classList.contains("choro__pays") ? e.target.dataset.iso3 : null;
		if (!iso3) return masquerInfobulle();
		surlignerPays(iso3);
		afficherInfobulle(iso3, e);
	});
	elCarte.svg.addEventListener("pointerleave", masquerInfobulle);
	elCarte.classement.addEventListener("pointerover", (e) => {
		const ligne = e.target.closest("li");
		if (ligne) surlignerPays(ligne.dataset.iso3);
	});
	elCarte.classement.addEventListener("pointerleave", () => surlignerPays(null));

	// Navigation annee par annee, au rythme de l'utilisateur.
	elCarte.precedente.addEventListener("click", () => decalerAnnee(-1));
	elCarte.suivante.addEventListener("click", () => decalerAnnee(+1));
	elCarte.bande.addEventListener("click", (e) => {
		const bouton = e.target.closest("button[data-annee]");
		if (bouton) choisirAnnee(Number(bouton.dataset.annee));
	});
	// Fleches du clavier, des que le focus est dans le bloc de la carte.
	elCarte.bloc.addEventListener("keydown", (e) => {
		if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
			e.preventDefault();
			decalerAnnee(e.key === "ArrowLeft" ? -1 : +1);
		}
	});
}

/**
 * Charge l'indicateur pour les 16 pays (valeurs brutes) puis affiche la carte.
 * Echec silencieux : la carte est un complement, elle ne doit jamais bloquer le reste.
 */
async function majCarte(codeIndicateur, debut, fin) {
	const jeton = ++etatCarte.jeton;
	try {
		const observations = await chargerIndicateur(PAYS_CARTE, codeIndicateur, debut, fin);
		if (jeton !== etatCarte.jeton) return;
		const { annees, series } = construireSeries(observations, PAYS_CARTE);
		const indicateur = trouverIndicateur(codeIndicateur);
		const anneesRenseignees = annees.filter((_, i) => PAYS_CARTE.some(iso => series.get(iso)[i] !== null));
		if (anneesRenseignees.length === 0) return masquerCarte();

		const toutes = [...series.values()].flat().filter(v => v !== null);
		etatCarte.donnees = { annees, series, indicateur, min: Math.min(...toutes), max: Math.max(...toutes) };
		etatCarte.anneesBande = anneesRenseignees;
		construireBande();
		elCarte.bloc.hidden = false;
		choisirAnnee(anneeLaMieuxCouverte(annees, series));
	} catch (erreur) {
		if (jeton === etatCarte.jeton) masquerCarte();
		console.warn("Carte indisponible.", erreur);
	}
}

function masquerCarte() {
	etatCarte.jeton++;
	etatCarte.donnees = null;
	elCarte.bloc.hidden = true;
}

/** Annee la plus recente ou le plus de pays sont renseignes (souvent pas la derniere). */
function anneeLaMieuxCouverte(annees, series) {
	let meilleure = annees[annees.length - 1], record = -1;
	annees.forEach((annee, i) => {
		const n = PAYS_CARTE.filter(iso => series.get(iso)[i] !== null).length;
		if (n >= record) { record = n; meilleure = annee; }
	});
	return meilleure;
}

/** Couleur [r, g, b] entre --carte-min et --carte-max, t dans [0, 1]. */
function interpoler(t) {
	const style = getComputedStyle(document.documentElement);
	const rgb = nom => style.getPropertyValue(nom).trim().match(/\w\w/g).map(h => parseInt(h, 16));
	const a = rgb("--carte-min"), b = rgb("--carte-max");
	return a.map((v, k) => Math.round(v + (b[k] - v) * t));
}

const enRgb = couleur => `rgb(${couleur.join(",")})`;

/** Vrai si la couleur est foncee : on ecrit alors la valeur en blanc. */
function estFoncee([r, g, b]) {
	return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.55;
}

/** Ecriture courte pour la carte (l'unite est donnee au-dessus) : 62,1 ; 29,6 M ; 450 k. */
function formaterCourt(valeur) {
	const fr = (v, d) => v.toLocaleString("fr-FR", { maximumFractionDigits: d });
	const a = Math.abs(valeur);
	if (a >= 1e6) return fr(valeur / 1e6, 1) + " M";
	if (a >= 1e4) return fr(valeur / 1e3, 0) + " k";
	return fr(valeur, a >= 100 ? 0 : 1);
}

function colorierCarte() {
	if (!etatCarte.donnees) return;
	const { annees, series, indicateur, min, max } = etatCarte.donnees;
	const annee = etatCarte.annee;
	const i = annees.indexOf(annee);
	const couleurDe = v => interpoler(max > min ? (v - min) / (max - min) : 0.5);

	etatCarte.valeurs = new Map(PAYS_CARTE.map(iso => [iso, i >= 0 ? series.get(iso)[i] : null]));

	elCarte.annee.textContent = annee;
	elCarte.grandeAnnee.textContent = annee;
	elCarte.sousTitre.textContent = `${indicateur.nom}, en ${indicateur.unite}`;
	elCarte.min.textContent = formaterValeur(min, indicateur.format);
	elCarte.max.textContent = formaterValeur(max, indicateur.format);

	for (const forme of elCarte.svg.querySelectorAll(".choro__pays")) {
		const valeur = etatCarte.valeurs.get(forme.dataset.iso3);
		forme.style.fill = valeur === null ? "" : enRgb(couleurDe(valeur));
		forme.classList.toggle("choro__pays--manquant", valeur === null);
	}
	for (const texte of elCarte.svg.querySelectorAll(".choro__valeur")) {
		const valeur = etatCarte.valeurs.get(texte.dataset.iso3);
		texte.textContent = valeur === null ? "" : formaterCourt(valeur);
		texte.classList.toggle("choro__valeur--clair", valeur !== null && estFoncee(couleurDe(valeur)));
	}

	dessinerClassement(couleurDe);

	const manquants = [...etatCarte.valeurs.values()].filter(v => v === null).length;
	elCarte.note.textContent = "Valeurs brutes de la Banque mondiale, quel que soit le calcul choisi. "
		+ "L'échelle de couleurs couvre toute la période et les 16 pays."
		+ (manquants ? ` Hachuré : ${manquants} pays sans donnée en ${annee}.` : "");
}

/** Classement des pays pour l'annee affichee ; les pays sans donnee en dernier. */
function dessinerClassement(couleurDe) {
	const { indicateur, min, max } = etatCarte.donnees;
	// Barres partant de 0 (ou du minimum s'il est negatif) : leurs longueurs restent comparables.
	const base = Math.min(0, min);
	const tries = [...etatCarte.valeurs].sort(([isoA, a], [isoB, b]) =>
		(a === null) - (b === null) || b - a || NOM_CARTE[isoA].localeCompare(NOM_CARTE[isoB], "fr"));

	elCarte.classement.replaceChildren();
	let rang = 0;
	for (const [iso3, valeur] of tries) {
		const ligne = document.createElement("li");
		ligne.dataset.iso3 = iso3;
		ligne.className = "choro__ligne" + (iso3 === "CIV" ? " choro__ligne--civ" : "");

		const numero = document.createElement("span");
		numero.className = "choro__rang";
		numero.textContent = valeur === null ? "" : ++rang;

		const nom = document.createElement("span");
		nom.className = "choro__nom";
		nom.textContent = NOM_CARTE[iso3];

		const barre = document.createElement("span");
		barre.className = "choro__barre";
		if (valeur !== null) {
			const remplissage = document.createElement("span");
			remplissage.style.width = `${Math.max(2, (valeur - base) / (max - base) * 100)}%`;
			remplissage.style.background = enRgb(couleurDe(valeur));
			barre.appendChild(remplissage);
		}

		const chiffre = document.createElement("span");
		chiffre.className = "choro__chiffre";
		chiffre.textContent = valeur === null ? "n.d." : formaterValeur(valeur, indicateur.format);

		ligne.append(numero, nom, barre, chiffre);
		elCarte.classement.appendChild(ligne);
	}
}

/* ---------- Survol ---------- */

function surlignerPays(iso3) {
	for (const n of elCarte.bloc.querySelectorAll(".est-survole")) n.classList.remove("est-survole");
	if (!iso3) return;
	for (const n of elCarte.bloc.querySelectorAll(`[data-iso3="${iso3}"]`)) n.classList.add("est-survole");
	// La forme survolee passe devant ses voisines, sinon son contour serait en partie cache.
	const forme = elCarte.svg.querySelector(`.choro__pays[data-iso3="${iso3}"]`);
	elCarte.svg.insertBefore(forme, elCarte.svg.querySelector(".choro__valeur"));
}

function afficherInfobulle(iso3, evenement) {
	if (!etatCarte.donnees) return;
	const { indicateur } = etatCarte.donnees;
	const valeur = etatCarte.valeurs.get(iso3);
	const connues = [...etatCarte.valeurs.values()].filter(v => v !== null);
	const rang = valeur === null ? null : connues.filter(v => v > valeur).length + 1;

	const titre = document.createElement("strong");
	titre.textContent = NOM_CARTE[iso3];
	const detail = document.createElement("span");
	detail.textContent = valeur === null
		? `Pas de donnée en ${etatCarte.annee}`
		: `${formaterValeur(valeur, indicateur.format)} · ${rang}${rang === 1 ? "er" : "e"} sur ${connues.length}`;
	elCarte.infobulle.replaceChildren(titre, detail);
	elCarte.infobulle.hidden = false;

	const zone = elCarte.zone.getBoundingClientRect();
	const x = evenement.clientX - zone.left, y = evenement.clientY - zone.top;
	elCarte.infobulle.style.left = `${Math.max(4, Math.min(x + 14, zone.width - elCarte.infobulle.offsetWidth - 4))}px`;
	elCarte.infobulle.style.top = `${y + 16}px`;
}

function masquerInfobulle() {
	elCarte.infobulle.hidden = true;
	surlignerPays(null);
}

/* ---------- Bande des annees : precedente, suivante, ou clic sur une annee ---------- */

/** Un bouton par annee renseignee ; une annee ou moins de la moitie des pays ont une donnee est grisee. */
function construireBande() {
	const { annees, series } = etatCarte.donnees;
	elCarte.bande.replaceChildren();
	for (const annee of etatCarte.anneesBande) {
		const i = annees.indexOf(annee);
		const n = PAYS_CARTE.filter(iso => series.get(iso)[i] !== null).length;
		const bouton = document.createElement("button");
		bouton.type = "button";
		bouton.className = "choro__an" + (n < PAYS_CARTE.length / 2 ? " choro__an--partiel" : "");
		bouton.dataset.annee = annee;
		bouton.textContent = annee;
		bouton.title = `${n} pays sur ${PAYS_CARTE.length} renseignés en ${annee}`;
		bouton.setAttribute("aria-pressed", "false");
		elCarte.bande.appendChild(bouton);
	}
}

function choisirAnnee(annee) {
	etatCarte.annee = annee;
	const liste = etatCarte.anneesBande;
	const position = liste.indexOf(annee);
	elCarte.precedente.disabled = position <= 0;
	elCarte.suivante.disabled = position >= liste.length - 1;

	for (const bouton of elCarte.bande.children) {
		const actif = Number(bouton.dataset.annee) === annee;
		bouton.classList.toggle("actif", actif);
		bouton.setAttribute("aria-pressed", String(actif));
		// L'annee choisie est ramenee au centre de la bande (sans faire defiler la page).
		if (actif) {
			elCarte.bande.scrollTo({
				left: bouton.offsetLeft - (elCarte.bande.clientWidth - bouton.offsetWidth) / 2,
				behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
			});
		}
	}
	colorierCarte();
}

/** Annee precedente (-1) ou suivante (+1) parmi les annees renseignees. */
function decalerAnnee(sens) {
	const liste = etatCarte.anneesBande;
	const position = liste.indexOf(etatCarte.annee) + sens;
	if (position >= 0 && position < liste.length) choisirAnnee(liste[position]);
}

construireCarte();
