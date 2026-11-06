// commun.js : briques partagees par l'accueil et les pages Pays, Themes et Trajectoires.
// (pastille ODD, mini-courbe, animation des chiffres, theme clair/sombre, chargement groupe)

const SVG_NS = "http://www.w3.org/2000/svg";

/** Pastille de couleur + libelle du statut ODD. */
function creerPastille(statut) {
	const span = document.createElement("span");
	span.className = "pastille pastille--" + statut;
	span.textContent = LIBELLES_ODD[statut];
	return span;
}


const mouvementReduit = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Fait defiler le nombre de 0 a sa valeur (600 ms) ; direct si l'utilisateur limite les animations. */
function animerNombre(noeud, valeur, format) {
	// L'espace fine des milliers (U+202F) n'est pas dessinee par Playfair : espace insecable classique.
	const texte = (v) => formaterValeur(v, format).replace(/ /g, " ");
	if (mouvementReduit()) { noeud.textContent = texte(valeur); return; }
	const depart = performance.now();
	const pas = (t) => {
		const p = Math.min(1, (t - depart) / 600);
		noeud.textContent = texte(valeur * (1 - (1 - p) ** 3));
		if (p < 1) requestAnimationFrame(pas);
	};
	requestAnimationFrame(pas);
}

/**
 * Petite courbe SVG : le pays (trait plein) et l'Afrique subsaharienne (tirets), sur la meme echelle.
 * survol(annee, valeur, valeurRef) est appele quand la souris parcourt la courbe, survol(null) a la sortie.
 * (Pas de Chart.js : quatre courbes de 40 px n'en valent pas la peine.)
 */
function miniCourbe(annees, valeurs, reference, survol) {
	const svg = document.createElementNS(SVG_NS, "svg");
	svg.setAttribute("viewBox", "0 0 120 40");
	svg.setAttribute("preserveAspectRatio", "none");
	svg.setAttribute("class", "mini-courbe");
	svg.setAttribute("aria-hidden", "true");
	const pts = annees.map((a, i) => [a, valeurs[i]]).filter(([, v]) => v !== null);
	if (pts.length < 2) return svg;
	const tous = [...valeurs, ...(reference || [])].filter(v => v !== null);
	const [aMin, aMax] = [annees[0], annees[annees.length - 1]];
	const [vMin, vMax] = [Math.min(...tous), Math.max(...tous)];
	const x = (a) => 2 + (a - aMin) / (aMax - aMin || 1) * 116;
	const y = (v) => 37 - (v - vMin) / (vMax - vMin || 1) * 34;
	const trait = (serie, classe) => {
		const p = annees.map((a, i) => [a, serie[i]]).filter(([, v]) => v !== null);
		const ligne = document.createElementNS(SVG_NS, "polyline");
		ligne.setAttribute("points", p.map(([a, v]) => `${x(a).toFixed(1)},${y(v).toFixed(1)}`).join(" "));
		ligne.setAttribute("class", classe);
		svg.appendChild(ligne);
	};
	if (reference) trait(reference, "mini-courbe__ref");
	// Aire legere sous la courbe du pays : donne du volume sans ajouter d'information.
	const aire = document.createElementNS(SVG_NS, "polygon");
	aire.setAttribute("points", [`${x(pts[0][0]).toFixed(1)},40`, ...pts.map(([a, v]) => `${x(a).toFixed(1)},${y(v).toFixed(1)}`),
		`${x(pts[pts.length - 1][0]).toFixed(1)},40`].join(" "));
	aire.setAttribute("class", "mini-courbe__aire");
	svg.appendChild(aire);
	trait(valeurs, "mini-courbe__pays");

	// Point = trait de longueur nulle a bout rond : il reste rond malgre l'etirement du SVG.
	const point = document.createElementNS(SVG_NS, "line");
	point.setAttribute("class", "mini-courbe__point");
	const placer = ([a, v]) => {
		for (const k of ["x1", "x2"]) point.setAttribute(k, x(a));
		for (const k of ["y1", "y2"]) point.setAttribute(k, y(v));
	};
	placer(pts[pts.length - 1]);
	svg.appendChild(point);

	svg.addEventListener("pointermove", (e) => {
		const r = svg.getBoundingClientRect();
		const annee = aMin + (e.clientX - r.left) / r.width * (aMax - aMin);
		const proche = pts.reduce((m, p) => (Math.abs(p[0] - annee) < Math.abs(m[0] - annee) ? p : m));
		placer(proche);
		const i = annees.indexOf(proche[0]);
		survol(proche[0], proche[1], reference ? reference[i] : null);
	});
	svg.addEventListener("pointerleave", () => { placer(pts[pts.length - 1]); survol(null); });
	return svg;
}

/* ===================== Theme clair / sombre (pages secondaires) ===================== */
// L'accueil a sa propre gestion (main.js) ; meme cle de stockage, le choix suit d'une page a l'autre.

function themeEnregistre() {
	let theme = null;
	try { theme = localStorage.getItem("bm_theme"); } catch { /* ignore */ }
	if (theme === "clair" || theme === "sombre") return theme;
	return window.matchMedia("(prefers-color-scheme: dark)").matches ? "sombre" : "clair";
}

/** Applique le theme et branche le bouton ◐ ; apresChangement() redessine ce qui depend des couleurs. */
function brancherThemePage(apresChangement = () => {}) {
	document.documentElement.setAttribute("data-theme", themeEnregistre());
	document.getElementById("bascule-theme").addEventListener("click", () => {
		const suivant = document.documentElement.getAttribute("data-theme") === "sombre" ? "clair" : "sombre";
		document.documentElement.setAttribute("data-theme", suivant);
		try { localStorage.setItem("bm_theme", suivant); } catch { /* ignore */ }
		apresChangement();
	});
}

/** Valeur d'une variable CSS du theme courant (pour Chart.js, qui ne lit pas le CSS). */
function couleurTheme(nom) {
	return getComputedStyle(document.body).getPropertyValue(nom).trim();
}

/* ===================== Chargement groupe ===================== */

const PAYS_REGION = PAYS.filter(p => !p.agregat).map(p => p.iso3);

/**
 * Un indicateur pour les 16 pays (+ pays supplementaires, ex. "SSF"), en une seule requete.
 * La meme requete sert a la fiche pays et aux themes : le cache local est partage.
 * @returns {Promise<{annees: number[], series: Map<string,(number|null)[]>}>}
 */
async function chargerRegion(code, debut, autres = ["SSF"]) {
	const codes = [...PAYS_REGION, ...autres];
	const observations = await chargerIndicateur(codes, code, debut, ANNEE_MAX - 1);
	return construireSeries(observations, codes);
}

/** Lance des taches asynchrones n par n (l'API de la Banque mondiale n'aime pas 21 requetes d'un coup). */
async function enParallele(taches, n = 4) {
	const resultats = new Array(taches.length);
	let suivante = 0;
	const ouvrier = async () => {
		while (suivante < taches.length) {
			const i = suivante++;
			try { resultats[i] = { ok: true, valeur: await taches[i]() }; }
			catch (erreur) { resultats[i] = { ok: false, erreur }; }
		}
	};
	await Promise.all(Array.from({ length: Math.min(n, taches.length) }, ouvrier));
	return resultats;
}

/** Derniere valeur renseignee d'une serie : { annee, valeur } ou null. */
function derniereValeur(annees, valeurs) {
	for (let i = valeurs.length - 1; i >= 0; i--) {
		if (valeurs[i] !== null) return { annee: annees[i], valeur: valeurs[i] };
	}
	return null;
}

/**
 * Rang d'un pays parmi les 16 sur sa derniere valeur. Rang 1 = le mieux place selon le « bon sens »
 * de l'indicateur ; sans bon sens (population...), rang 1 = la valeur la plus elevee.
 */
function rangRegion(code, annees, series, iso3) {
	const sens = ficheIndicateur(code).sens || 1;
	const liste = PAYS_REGION
		.map(p => ({ p, d: derniereValeur(annees, series.get(p) || []) }))
		.filter(x => x.d)
		.sort((a, b) => (b.d.valeur - a.d.valeur) * sens);
	const rang = liste.findIndex(x => x.p === iso3) + 1;
	return rang > 0 ? { rang, total: liste.length } : null;
}
