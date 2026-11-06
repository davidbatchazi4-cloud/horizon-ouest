// donnees.js : transformation des observations brutes en series exploitables,
// statistiques descriptives et prevision.

/**
 * Regroupe les observations par pays et trie les annees dans l'ordre croissant.
 * L'API renvoie les observations de la plus recente a la plus ancienne : il FAUT trier.
 * On indexe sur countryiso3code (stable) et non sur country.value (libelle sans accent).
 * @returns {{annees: number[], series: Map<string, (number|null)[]>}}
 */
function construireSeries(observations, codesPays) {
	const parPays = new Map();
	const anneesVues = new Set();

	for (const obs of observations) {
		const iso3 = obs.countryiso3code;
		const annee = Number(obs.date);
		if (!iso3 || !Number.isFinite(annee)) continue;

		if (!parPays.has(iso3)) parPays.set(iso3, new Map());
		parPays.get(iso3).set(annee, obs.value); // value peut valoir null
		anneesVues.add(annee);
	}

	const annees = [...anneesVues].sort((a, b) => a - b);

	// Grille rectangulaire : chaque pays demande a une valeur par annee (null si absente),
	// ce qui garantit l'alignement entre le graphique et le tableau.
	const series = new Map();
	for (const iso3 of codesPays) {
		const valeursPays = parPays.get(iso3) || new Map();
		series.set(iso3, annees.map(a => {
			const v = valeursPays.get(a);
			return typeof v === "number" ? v : null;
		}));
	}

	return { annees, series };
}

/** Indique si une serie ne contient aucune valeur exploitable. */
function serieVide(valeurs) {
	return valeurs.every(v => v === null);
}

/** Paires [annee, valeur] en ignorant les trous. */
function pointsValides(annees, valeurs) {
	const points = [];
	for (let i = 0; i < annees.length; i++) {
		if (valeurs[i] !== null) points.push([annees[i], valeurs[i]]);
	}
	return points;
}

/**
 * Vrai si la serie est deja un taux (format "pourcent") ou un ecart (format "+...") :
 * son evolution se mesure alors par une difference (en points), pas en %.
 * Ex. : une croissance qui passe de 1 % a 6 % gagne 5 points ; dire qu'elle
 * « augmente de 500 % » serait faux en pratique, et un TCAM n'aurait pas de sens.
 */
function estSerieEnPoints(format) {
	return format === "pourcent" || (typeof format === "string" && format.startsWith("+"));
}

/**
 * Statistiques descriptives sur une serie.
 * Variation et TCAM sont calcules entre la PREMIERE et la DERNIERE valeur
 * reellement disponibles, pas entre les bornes demandees.
 *  - niveau (PIB, population...) : variation en %, et TCAM ;
 *  - taux ou ecart : variation = difference (enPoints = true), pas de TCAM.
 */
function calculerStats(annees, valeurs, format) {
	const points = pointsValides(annees, valeurs);
	if (points.length === 0) return null;

	const [anneeDebut, vDebut] = points[0];
	const [anneeFin, vFin] = points[points.length - 1];
	const n = anneeFin - anneeDebut;

	const nombres = points.map(p => p[1]);
	const stats = {
		anneeDebut, vDebut, anneeFin, vFin,
		nbPoints: points.length,
		min: Math.min(...nombres),
		max: Math.max(...nombres),
		moyenne: nombres.reduce((a, b) => a + b, 0) / nombres.length,
		variation: null,
		tcam: null,
		enPoints: estSerieEnPoints(format),
	};

	if (stats.enPoints) {
		stats.variation = vFin - vDebut;
		return stats;
	}

	if (vDebut !== 0) {
		stats.variation = ((vFin - vDebut) / Math.abs(vDebut)) * 100;
	}
	// Le TCAM n'a de sens que sur une grandeur positive sur plus d'un an.
	if (n > 0 && vDebut > 0 && vFin > 0) {
		stats.tcam = (Math.pow(vFin / vDebut, 1 / n) - 1) * 100;
	}

	return stats;
}

const MIN_POINTS_PREVISION = 5;

/**
 * Prevision par tendance LOG-lineaire : on ajuste log(V) = a + b*t par moindres carres,
 * ce qui revient a supposer un taux de croissance constant (coherent avec le TCAM affiche).
 * Une droite ajustee sur V directement supposerait une progression en valeur absolue
 * constante, hypothese peu defendable sur un PIB ou une population.
 *
 * Repli sur une tendance lineaire classique si la serie contient des valeurs <= 0
 * (croissance, inflation, solde : le logarithme n'y est pas defini).
 *
 * @returns {{annees: number[], valeurs: number[], methode: string}|null}
 */
function prevoir(annees, valeurs, horizon = 5) {
	const points = pointsValides(annees, valeurs);
	if (points.length < MIN_POINTS_PREVISION) return null;

	const logPossible = points.every(p => p[1] > 0);
	const t = points.map(p => p[0]);
	const y = points.map(p => (logPossible ? Math.log(p[1]) : p[1]));

	const n = t.length;
	const tMoy = t.reduce((a, b) => a + b, 0) / n;
	const yMoy = y.reduce((a, b) => a + b, 0) / n;

	let sxy = 0, sxx = 0;
	for (let i = 0; i < n; i++) {
		sxy += (t[i] - tMoy) * (y[i] - yMoy);
		sxx += (t[i] - tMoy) ** 2;
	}
	if (sxx === 0) return null; // une seule annee distincte

	const b = sxy / sxx;
	const a = yMoy - b * tMoy;

	const derniereAnnee = t[n - 1];
	const anneesPrevues = [];
	const valeursPrevues = [];
	for (let k = 1; k <= horizon; k++) {
		const annee = derniereAnnee + k;
		const brut = a + b * annee;
		anneesPrevues.push(annee);
		valeursPrevues.push(logPossible ? Math.exp(brut) : brut);
	}

	return {
		annees: anneesPrevues,
		valeurs: valeursPrevues,
		methode: logPossible
			? `tendance log-linéaire (taux constant ≈ ${((Math.exp(b) - 1) * 100).toFixed(2).replace(".", ",")} % par an)`
			: "tendance linéaire (série non strictement positive)",
	};
}

/* ===================== Indicateurs derives (calcules par l'application) ===================== */

const MODES_AFFICHAGE = {
	brut:   "Valeurs brutes (Banque mondiale)",
	base100:"Indice base 100 (première année)",
	ecart:  "Écart à l'Afrique subsaharienne",
};
const ISO_REFERENCE_ECART = "SSF";

/**
 * Indice base 100 : I(t) = V(t) / V(base) x 100, ou la base est la premiere annee
 * renseignee de CHAQUE pays. Rend comparables des pays d'ordres de grandeur differents
 * (ex. population du Nigeria et du Senegal) : on compare des trajectoires, pas des niveaux.
 * Non defini si la valeur de base est nulle ou negative.
 */
function indiceBase100(valeurs) {
	const base = valeurs.find(v => v !== null);
	if (base === undefined || base <= 0) return valeurs.map(() => null);
	return valeurs.map(v => (v === null ? null : (v / base) * 100));
}

/**
 * Ecart a une serie de reference : E(t) = V(t) - R(t), annee par annee.
 * Null si l'une des deux valeurs manque (on ne compare que des annees communes).
 */
function ecartReference(valeurs, reference) {
	return valeurs.map((v, i) => (v === null || reference[i] === null ? null : v - reference[i]));
}

/**
 * Applique le mode d'affichage choisi et renvoie de nouvelles series, plus
 * l'indicateur decrit pour l'affichage (nom, unite et format adaptes).
 * Les series de l'API ne sont jamais modifiees en place.
 * @param {string} mode  "brut" | "base100" | "ecart"
 * @param {(number|null)[]|null} reference  serie de l'Afrique subsaharienne (mode "ecart")
 */
function transformerSeries(annees, series, indicateur, mode, reference) {
	if (mode === "base100") {
		const resultat = new Map();
		for (const [iso3, valeurs] of series) resultat.set(iso3, indiceBase100(valeurs));
		return {
			series: resultat,
			indicateur: {
				...indicateur,
				nom: indicateur.nom + " (indice base 100)",
				unite: "indice, 100 = première année renseignée",
				format: "indice",
			},
		};
	}

	if (mode === "ecart" && reference) {
		const resultat = new Map();
		for (const [iso3, valeurs] of series) {
			if (iso3 === ISO_REFERENCE_ECART) continue; // l'ecart a soi-meme vaut 0 partout
			resultat.set(iso3, ecartReference(valeurs, reference));
		}
		return {
			series: resultat,
			indicateur: {
				...indicateur,
				nom: indicateur.nom + " (écart à l'Afrique subsaharienne)",
				unite: (indicateur.format === "pourcent" ? "points de %" : indicateur.unite)
					+ ", pays − Afrique subsaharienne",
				format: "+" + indicateur.format, // "+" : afficher le signe
			},
		};
	}

	return { series, indicateur };
}

/* ===================== Detection de ruptures ===================== */

const MIN_VARIATIONS_RUPTURE = 6;
const SEUIL_RUPTURE = 3;        // en ecarts robustes
const DEMI_FENETRE_RUPTURE = 2; // tendance locale = 5 variations centrees

function mediane(nombres) {
	const t = [...nombres].sort((a, b) => a - b);
	const m = Math.floor(t.length / 2);
	return t.length % 2 ? t[m] : (t[m - 1] + t[m]) / 2;
}

/**
 * Repere les annees ou la serie s'ecarte brutalement de sa tendance du moment.
 *
 * 1. Variation d'une annee renseignee a la suivante :
 *    - taux de croissance (log V(t) - log V(t-1)) pour un NIVEAU strictement positif
 *      (population, mortalite, indice...) ;
 *    - difference simple V(t) - V(t-1), en points, pour une serie deja exprimee en %
 *      (taux d'acces, scolarisation) ou un ecart : calculer le « taux de croissance
 *      d'un taux » n'a pas de sens ;
 *    divisee par le nombre d'annees separant les deux points s'il y a un trou.
 * 2. Tendance locale : mediane des 5 variations centrees sur l'annee. On compare
 *    chaque variation a SA tendance locale, et non a une moyenne sur toute la periode :
 *    sinon une serie qui accelere (Internet) paraitrait « anormale » chaque annee.
 * 3. Score robuste = residu / (1,4826 x MAD des residus). Mediane et MAD plutot que
 *    moyenne et ecart-type : une rupture forte gonflerait l'ecart-type et se masquerait.
 * 4. Rupture si |score| > 3 ET si le residu depasse un plancher : 3 % par an pour un
 *    niveau ; pour une serie en %, 1 point au minimum (ou 10 % de sa valeur typique
 *    si c'est plus) ; pour un ecart, 10 % de sa valeur typique. Sans ce plancher,
 *    une serie tres lissee (estimations modelisees) verrait signaler des ecarts
 *    de 0,1 % sans aucune portee.
 *
 * @returns {{annee: number, variation: number, tendance: number, score: number, enTaux: boolean}[]}
 */
function detecterRuptures(annees, valeurs, format) {
	const points = pointsValides(annees, valeurs);
	if (points.length < MIN_VARIATIONS_RUPTURE + 1) return [];

	const estNiveau = ["dollar", "nombre", "annees", "indice"].includes(format);
	const enTaux = estNiveau && points.every(p => p[1] > 0);
	const variations = [];
	for (let i = 1; i < points.length; i++) {
		const [a0, v0] = points[i - 1];
		const [a1, v1] = points[i];
		const ecartAnnees = a1 - a0;
		const brute = enTaux ? Math.log(v1) - Math.log(v0) : v1 - v0;
		variations.push({ annee: a1, valeur: brute / ecartAnnees });
	}

	const residus = variations.map((v, i) => {
		const voisins = variations
			.slice(Math.max(0, i - DEMI_FENETRE_RUPTURE), i + DEMI_FENETRE_RUPTURE + 1)
			.map(x => x.valeur);
		return v.valeur - mediane(voisins);
	});

	const mad = mediane(residus.map(Math.abs)) * 1.4826;
	const typique = 0.1 * mediane(points.map(p => Math.abs(p[1])));
	let plancher = typique;
	if (enTaux) plancher = Math.log(1.03);
	else if (format.replace(/^\+/, "") === "pourcent") plancher = Math.max(1, typique);

	return variations
		.map((v, i) => ({
			annee: v.annee,
			// En taux, on convertit le log-ecart en pourcentage lisible.
			variation: enTaux ? (Math.exp(v.valeur) - 1) * 100 : v.valeur,
			// Variation « attendue » d'apres la tendance locale, dans la meme unite.
			tendance: enTaux ? (Math.exp(v.valeur - residus[i]) - 1) * 100 : v.valeur - residus[i],
			residu: residus[i],
			score: mad > 0 ? residus[i] / mad : (residus[i] === 0 ? 0 : Math.sign(residus[i]) * Infinity),
			enTaux,
		}))
		.filter(r => Math.abs(r.score) > SEUIL_RUPTURE && Math.abs(r.residu) > plancher);
}

/** Variation sur la periode, en % (niveaux) ou en points / unites (taux et ecarts). */
function formaterVariation(stats, format) {
	if (stats.variation === null) return "n.d.";
	const v = stats.variation;
	const signe = v >= 0 ? "+" : "";
	if (!stats.enPoints) return signe + v.toFixed(1).replace(".", ",") + " %";
	const base = format.replace(/^\+/, "");
	if (base === "pourcent") return signe + v.toFixed(1).replace(".", ",") + " pts";
	return formaterValeur(v, "+" + base);
}

/** Mise en forme d'une valeur selon le format declare dans config.js. */
function formaterValeur(valeur, format) {
	if (valeur === null || valeur === undefined) return "n.d.";
	// Format prefixe par "+" : meme rendu, mais avec le signe explicite (ecarts).
	if (format.startsWith("+")) {
		// Ecart entre deux taux : une difference en points, pas un pourcentage.
		if (format === "+pourcent") {
			return (valeur > 0 ? "+" : "") + valeur.toFixed(1).replace(".", ",") + " pt";
		}
		const texte = formaterValeur(valeur, format.slice(1));
		return valeur > 0 ? "+" + texte : texte;
	}
	switch (format) {
		case "indice":   return valeur.toFixed(1).replace(".", ",");
		case "pourcent": return valeur.toFixed(2).replace(".", ",") + " %";
		case "dollar":   return valeur.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + " $";
		case "annees":   return valeur.toFixed(1).replace(".", ",") + " ans";
		default:         return valeur.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
	}
}
