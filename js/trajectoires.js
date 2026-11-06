// trajectoires.js : graphique a bulles anime (trajectoires.html?x=...&y=...&a=1990).
// Une bulle par pays : position = deux indicateurs, taille = population, une image par annee.

const DEBUT_TRAJ = 1960;
const POPULATION = "SP.POP.TOTL";
const DUREE_IMAGE_MS = 700; // une annee toutes les 0,7 s
const donneesTraj = new Map(); // code -> Promise<{annees, series}>

function donneesTrajectoire(code) {
	if (!donneesTraj.has(code)) {
		const p = chargerRegion(code, DEBUT_TRAJ, []);
		p.catch(() => donneesTraj.delete(code)); // un echec ne reste pas en memoire
		donneesTraj.set(code, p);
	}
	return donneesTraj.get(code);
}

/**
 * Valeur d'une annee, interpolee lineairement entre les deux annees connues qui l'entourent
 * (beaucoup d'indicateurs ne sont publies que certaines annees). Pas d'extrapolation : null hors de la plage connue.
 */
function valeurAnnee(annees, valeurs, annee) {
	let avant = null, apres = null;
	for (let i = 0; i < annees.length; i++) {
		if (valeurs[i] === null) continue;
		if (annees[i] === annee) return { valeur: valeurs[i], estimee: false };
		if (annees[i] < annee) avant = i;
		else if (apres === null) apres = i;
	}
	if (avant === null || apres === null) return null;
	const t = (annee - annees[avant]) / (annees[apres] - annees[avant]);
	return { valeur: valeurs[avant] + t * (valeurs[apres] - valeurs[avant]), estimee: true };
}

/** Bornes fixes des axes sur toute la periode : sans elles, les axes bougeraient a chaque annee. */
function bornes({ series }) {
	const toutes = [...series.values()].flat().filter(v => v !== null);
	const [min, max] = [Math.min(...toutes), Math.max(...toutes)];
	const marge = (max - min) * .06 || 1;
	// Bornes arrondies a un pas « rond » (1, 2, 5 x 10^n) : des graduations lisibles ;
	// un indicateur positif ne descend pas sous 0.
	const brut = (max - min + 2 * marge) / 6;
	const e = 10 ** Math.floor(Math.log10(brut));
	const pas = [1, 2, 5, 10].map(k => k * e).find(p => p >= brut);
	const bas = Math.floor((min - marge) / pas) * pas;
	return { min: min >= 0 ? Math.max(0, bas) : bas, max: Math.ceil((max + marge) / pas) * pas };
}

(function demarrer() {
	const etat = document.getElementById("trajectoires-etat");
	if (typeof Chart === "undefined") {
		etat.textContent = "La bibliothèque Chart.js n'a pas pu être chargée : vérifiez votre connexion.";
		return;
	}
	Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;

	const el = {
		x: document.getElementById("axe-x"), y: document.getElementById("axe-y"),
		trace: document.getElementById("trace-pays"), curseur: document.getElementById("curseur-annee"),
		anneeTexte: document.getElementById("annee-texte"), grandeAnnee: document.getElementById("grande-annee"),
		lecture: document.getElementById("lecture"), note: document.getElementById("trajectoires-note"),
	};
	const params = new URLSearchParams(location.search);
	for (const select of [el.x, el.y]) {
		for (const groupe of INDICATEURS) {
			const og = document.createElement("optgroup");
			og.label = groupe.theme;
			for (const s of groupe.series) og.appendChild(new Option(s.nom, s.code));
			select.appendChild(og);
		}
	}
	el.x.value = trouverIndicateur(params.get("x")) ? params.get("x") : "SP.DYN.TFRT.IN";
	el.y.value = trouverIndicateur(params.get("y")) ? params.get("y") : "SP.DYN.LE00.IN";
	el.trace.add(new Option("Aucune", ""));
	for (const iso3 of PAYS_REGION) el.trace.add(new Option(trouverPays(iso3).nom, iso3));
	el.trace.value = PAYS_REGION.includes(params.get("c")) ? params.get("c") : "CIV";
	el.curseur.max = ANNEE_MAX - 1;
	const a = Number(params.get("a"));
	el.curseur.value = a >= DEBUT_TRAJ && a < ANNEE_MAX ? a : 1990;

	let d = null; // { x, y, pop, ix, iy, bx, by, popMax }
	let chart = null;
	let minuterie = null;

	const annee = () => Number(el.curseur.value);
	const majAdresse = () => history.replaceState(null, "", `?x=${el.x.value}&y=${el.y.value}&a=${annee()}&c=${el.trace.value}`);

	/** Points d'une annee : une bulle par pays renseigne sur les deux axes. */
	function points(an) {
		return PAYS_REGION.map(iso3 => {
			const vx = valeurAnnee(d.x.annees, d.x.series.get(iso3), an);
			const vy = valeurAnnee(d.y.annees, d.y.series.get(iso3), an);
			if (!vx || !vy) return null;
			const vp = valeurAnnee(d.pop.annees, d.pop.series.get(iso3), an);
			const r = 4 + Math.sqrt((vp?.valeur || 0) / d.popMax) * 30;
			return { iso3, x: vx.valeur, y: vy.valeur, r, pop: vp?.valeur, estimee: vx.estimee || vy.estimee };
		});
	}

	function majAnnee() {
		if (!chart) return;
		const an = annee();
		el.anneeTexte.textContent = an;
		el.grandeAnnee.textContent = an;
		const pts = points(an);
		PAYS_REGION.forEach((iso3, i) => { chart.data.datasets[i].data = pts[i] ? [pts[i]] : []; });
		// Trace : positions passees du pays choisi, de 1960 a l'annee affichee.
		const trace = chart.data.datasets[PAYS_REGION.length];
		trace.data = [];
		if (el.trace.value) {
			for (let a = DEBUT_TRAJ; a <= an; a++) {
				const p = points(a)[PAYS_REGION.indexOf(el.trace.value)];
				if (p) trace.data.push({ x: p.x, y: p.y });
			}
			trace.borderColor = trouverPays(el.trace.value).couleur;
		}
		const visibles = pts.filter(Boolean).length;
		etat.hidden = visibles > 0;
		etat.textContent = `Aucun pays n'a de données pour ces deux indicateurs en ${an}.`;
		chart.update();
		majAdresse();
	}

	function creerGraphique() {
		chart?.destroy();
		const sx = trouverIndicateur(el.x.value), sy = trouverIndicateur(el.y.value);
		const texte = couleurTheme("--texte-faible"), grille = couleurTheme("--bordure");
		const jeux = PAYS_REGION.map(iso3 => {
			const p = trouverPays(iso3);
			return { label: p.nom, data: [], backgroundColor: p.couleur + "bb", borderColor: p.couleur,
				borderWidth: (ctx) => (ctx.raw?.iso3 === el.trace.value ? 3 : 1) };
		});
		jeux.push({ type: "line", label: "Trace", data: [], borderWidth: 1.5, borderDash: [3, 3],
			pointRadius: 2, tension: .3, order: 10 });
		chart = new Chart(document.getElementById("bulles"), {
			type: "bubble",
			data: { datasets: jeux },
			options: {
				responsive: true, maintainAspectRatio: false,
				animation: { duration: mouvementReduit() ? 0 : DUREE_IMAGE_MS * .9, easing: "linear" },
				plugins: {
					legend: { position: "bottom", labels: { color: texte, usePointStyle: true, boxWidth: 8,
						filter: (item) => item.text !== "Trace" } },
					tooltip: {
						filter: (item) => item.dataset.label !== "Trace",
						callbacks: {
							label: (c) => {
								const r = c.raw;
								return [`${c.dataset.label}${r.estimee ? " (valeur interpolée)" : ""}`,
									`${sx.nom} : ${formaterValeur(r.x, sx.format)}`,
									`${sy.nom} : ${formaterValeur(r.y, sy.format)}`,
									`Population : ${r.pop ? formaterValeur(r.pop, "nombre") : "n.d."}`];
							},
						},
					},
				},
				scales: {
					x: { min: d.bx.min, max: d.bx.max, title: { display: true, text: `${sx.nom} (${sx.unite})`, color: texte },
						ticks: { color: texte }, grid: { color: grille } },
					y: { min: d.by.min, max: d.by.max, title: { display: true, text: `${sy.nom} (${sy.unite})`, color: texte },
						ticks: { color: texte }, grid: { color: grille } },
				},
			},
		});
		el.note.textContent = `Bulles : ${PAYS_REGION.length} pays, taille proportionnelle à la population. `
			+ "Quand une année manque, la valeur est interpolée entre les deux années publiées qui l'entourent (signalé au survol). "
			+ `Données disponibles : ${sx.nom} de ${premiereAnnee(d.x)}, ${sy.nom} de ${premiereAnnee(d.y)}.`;
		majAnnee();
	}

	function premiereAnnee({ annees, series }) {
		const i = Math.min(...[...series.values()].map(v => v.findIndex(x => x !== null)).filter(i => i >= 0));
		return Number.isFinite(i) ? annees[i] : "?";
	}

	async function charger() {
		arreter();
		etat.hidden = false;
		etat.textContent = "Chargement des données…";
		try {
			const [x, y, pop] = await Promise.all([el.x.value, el.y.value, POPULATION].map(donneesTrajectoire));
			const popMax = Math.max(...[...pop.series.values()].flat().filter(v => v !== null));
			d = { x, y, pop, popMax, bx: bornes(x), by: bornes(y) };
			creerGraphique();
		} catch (erreur) {
			etat.textContent = "Les données n'ont pas pu être chargées (Banque mondiale lente ou injoignable). Changez d'indicateur ou rechargez la page.";
			console.error(erreur);
		}
	}

	function arreter() {
		clearInterval(minuterie);
		minuterie = null;
		el.lecture.textContent = "▶ Lecture";
		el.lecture.setAttribute("aria-label", "Lancer l'animation");
	}

	el.lecture.addEventListener("click", () => {
		if (minuterie) { arreter(); return; }
		if (annee() >= Number(el.curseur.max)) el.curseur.value = DEBUT_TRAJ; // a la fin : on repart du debut
		el.lecture.textContent = "❚❚ Pause";
		el.lecture.setAttribute("aria-label", "Mettre l'animation en pause");
		minuterie = setInterval(() => {
			if (annee() >= Number(el.curseur.max)) { arreter(); return; }
			el.curseur.value = annee() + 1;
			majAnnee();
		}, DUREE_IMAGE_MS);
	});
	el.curseur.addEventListener("input", () => { arreter(); majAnnee(); });
	el.x.addEventListener("change", charger);
	el.y.addEventListener("change", charger);
	el.trace.addEventListener("change", () => { chart?.update("none"); majAnnee(); });
	brancherThemePage(() => { if (d) creerGraphique(); });
	charger();
})();
