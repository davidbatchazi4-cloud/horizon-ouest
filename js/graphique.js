// graphique.js : rendu Chart.js.
// Une seule instance de graphique est maintenue : on la detruit avant de la recreer,
// sinon Chart.js empile les canvas et les infobulles deviennent incoherentes.

let instanceGraphique = null;
const COULEUR_RUPTURE = "#c1121f";

function couleurTexte() {
	return getComputedStyle(document.body).getPropertyValue("--texte-faible").trim();
}

function couleurGrille() {
	return getComputedStyle(document.body).getPropertyValue("--bordure").trim();
}

/**
 * @param {string} type        "line" ou "bar"
 * @param {number[]} annees
 * @param {Map<string,(number|null)[]>} series
 * @param {object} indicateur  entree du catalogue (nom, unite, format)
 * @param {Map<string,object>|null} previsions  prevision par pays, ou null
 * @param {Map<string,object[]>|null} ruptures   annees de rupture par pays, ou null
 */
function dessinerGraphique(type, annees, series, indicateur, previsions, ruptures) {
	// Chart.js vient d'un CDN : s'il est bloque (hors ligne, integrity invalide,
	// extension de navigateur), on le dit explicitement plutot que de laisser
	// remonter un ReferenceError illisible.
	if (typeof Chart === "undefined") {
		throw new ErreurApi(
			"La bibliothèque Chart.js n'a pas pu être chargée depuis le CDN. "
			+ "Vérifiez votre connexion Internet, ou consultez la console du navigateur."
		);
	}

	const canvas = document.getElementById("graphique");
	// Meme police que la page (Lato), pour que le graphique fasse partie du document.
	Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;

	if (instanceGraphique) {
		instanceGraphique.destroy();
		instanceGraphique = null;
	}

	// Les annees de prevision prolongent l'axe horizontal.
	let etiquettes = [...annees];
	if (previsions && previsions.size > 0) {
		const maxPrevu = Math.max(...[...previsions.values()].map(p => Math.max(...p.annees)));
		for (let a = annees[annees.length - 1] + 1; a <= maxPrevu; a++) etiquettes.push(a);
	}

	const jeux = [];

	for (const [iso3, valeurs] of series) {
		const pays = trouverPays(iso3);

		// Ruptures : les annees signalees ressortent (gros point cercle rouge, barre bordee de rouge).
		const anneesRupture = new Set((ruptures && ruptures.get(iso3) || []).map(r => r.annee));
		const estRupture = (ctx) => anneesRupture.has(etiquettes[ctx.dataIndex]);

		// Serie observee : on complete avec des null sur les annees de prevision.
		jeux.push({
			label: pays.nom,
			data: etiquettes.map((a, i) => (i < valeurs.length ? valeurs[i] : null)),
			borderColor: type === "bar"
				? (ctx) => (estRupture(ctx) ? COULEUR_RUPTURE : pays.couleur)
				: pays.couleur,
			backgroundColor: type === "bar" ? pays.couleur : pays.couleur + "22",
			// Series importees (fichier CSV) : trait epais et points en losange, pour les distinguer des pays.
			borderWidth: type === "bar" ? (ctx) => (estRupture(ctx) ? 3 : 0) : (pays.importe ? 3.5 : 2),
			pointStyle: pays.importe ? "rectRot" : "circle",
			pointRadius: (ctx) => (estRupture(ctx) ? 7 : (type === "line" ? (pays.importe ? 4 : 2) : 0)),
			pointBorderColor: (ctx) => (estRupture(ctx) ? COULEUR_RUPTURE : pays.couleur),
			pointBorderWidth: (ctx) => (estRupture(ctx) ? 3 : 1),
			pointBackgroundColor: (ctx) => (estRupture(ctx) ? "#ffffff" : pays.couleur),
			pointHoverRadius: 5,
			// Regions (Afrique subsaharienne, Monde) en tirets : des reperes, pas des pays.
			borderDash: pays.agregat && type === "line" ? [2, 3] : undefined,
			tension: .25,
			spanGaps: true, // relie les points de part et d'autre des annees manquantes
		});

		const prevision = previsions && previsions.get(iso3);
		if (prevision) {
			// Le premier point de la prevision reprend la derniere valeur observee,
			// sinon la courbe en pointille flotte sans etre raccordee.
			const donneesPrev = etiquettes.map(a => {
				const idxPrev = prevision.annees.indexOf(a);
				if (idxPrev !== -1) return prevision.valeurs[idxPrev];
				return null;
			});
			const idxDernier = valeurs.reduce((acc, v, i) => (v !== null ? i : acc), -1);
			if (idxDernier !== -1) donneesPrev[idxDernier] = valeurs[idxDernier];

			jeux.push({
				label: pays.nom + " (prévision)",
				data: donneesPrev,
				borderColor: pays.couleur,
				backgroundColor: "transparent",
				borderDash: [6, 4],
				borderWidth: 2,
				pointRadius: 0,
				tension: .25,
				spanGaps: true,
			});
		}
	}

	instanceGraphique = new Chart(canvas, {
		type,
		data: { labels: etiquettes, datasets: jeux },
		options: {
			responsive: true,
			maintainAspectRatio: false,
			interaction: { mode: "index", intersect: false },
			plugins: {
				legend: {
					position: "top",
					labels: { color: couleurTexte(), boxWidth: 12, usePointStyle: true, padding: 14 },
				},
				tooltip: {
					callbacks: {
						label: (ctx) => {
							if (ctx.parsed.y === null) return null;
							return `${ctx.dataset.label} : ${formaterValeur(ctx.parsed.y, indicateur.format)}`;
						},
					},
				},
			},
			scales: {
				x: {
					ticks: { color: couleurTexte(), maxRotation: 0, autoSkipPadding: 18 },
					grid: { color: couleurGrille(), drawOnChartArea: false },
				},
				y: {
					title: { display: true, text: indicateur.unite, color: couleurTexte() },
					ticks: {
						color: couleurTexte(),
						callback: (v) => formaterValeur(v, indicateur.format),
					},
					grid: { color: couleurGrille() },
				},
			},
		},
	});
}

/**
 * Image PNG du graphique courant, destinee au rapport PDF.
 *
 * Deux corrections sont necessaires par rapport a une simple capture du canvas :
 *  - le canvas est transparent, alors que la page du PDF est blanche ;
 *  - en theme sombre, les etiquettes d'axes sont gris clair, donc illisibles
 *    une fois posees sur du blanc.
 * On bascule donc temporairement les couleurs en version claire, on compose
 * le rendu sur un fond blanc, puis on remet le graphique dans son etat initial.
 */
function imageGraphique() {
	if (!instanceGraphique) return null;

	const o = instanceGraphique.options;
	const sauvegarde = {
		legende: o.plugins.legend.labels.color,
		xTicks: o.scales.x.ticks.color,
		yTicks: o.scales.y.ticks.color,
		yTitre: o.scales.y.title.color,
		xGrille: o.scales.x.grid.color,
		yGrille: o.scales.y.grid.color,
	};

	const ENCRE = "#333333";
	const GRILLE = "#dddddd";
	o.plugins.legend.labels.color = ENCRE;
	o.scales.x.ticks.color = ENCRE;
	o.scales.y.ticks.color = ENCRE;
	o.scales.y.title.color = ENCRE;
	o.scales.x.grid.color = GRILLE;
	o.scales.y.grid.color = GRILLE;
	instanceGraphique.update("none"); // "none" : rendu immediat, sans animation

	const source = instanceGraphique.canvas;
	const copie = document.createElement("canvas");
	copie.width = source.width;
	copie.height = source.height;
	const ctx = copie.getContext("2d");
	ctx.fillStyle = "#ffffff";
	ctx.fillRect(0, 0, copie.width, copie.height);
	ctx.drawImage(source, 0, 0);
	const image = copie.toDataURL("image/png");

	o.plugins.legend.labels.color = sauvegarde.legende;
	o.scales.x.ticks.color = sauvegarde.xTicks;
	o.scales.y.ticks.color = sauvegarde.yTicks;
	o.scales.y.title.color = sauvegarde.yTitre;
	o.scales.x.grid.color = sauvegarde.xGrille;
	o.scales.y.grid.color = sauvegarde.yGrille;
	instanceGraphique.update("none");

	return image;
}

/** Redessine la legende et les axes apres un changement de theme. */
function rafraichirCouleursGraphique() {
	if (!instanceGraphique) return;
	const o = instanceGraphique.options;
	o.plugins.legend.labels.color = couleurTexte();
	o.scales.x.ticks.color = couleurTexte();
	o.scales.y.ticks.color = couleurTexte();
	o.scales.y.title.color = couleurTexte();
	o.scales.x.grid.color = couleurGrille();
	o.scales.y.grid.color = couleurGrille();
	instanceGraphique.update();
}
