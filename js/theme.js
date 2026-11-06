// theme.js : page « Thèmes » (theme.html?t=sante&c=CIV).
// Un graphique par indicateur : le pays mis en avant en couleur, les 15 autres en gris,
// l'Afrique subsaharienne en pointilles ; une phrase de lecture calculee sous chaque graphique.

const DEBUT_THEME = 2000;

// Textes d'introduction : cadrage general, sans chiffres (les chiffres viennent des donnees).
const INTROS_THEMES = {
	"Santé": "Vivre longtemps et en bonne santé est la première dimension du développement humain. En Afrique de l'Ouest, les progrès des vingt dernières années tiennent surtout au recul de la mortalité des jeunes enfants (vaccination, lutte contre le paludisme, accès aux soins), tandis que la mortalité maternelle reste parmi les plus élevées au monde.",
	"Éducation": "L'école est la deuxième dimension du développement humain. Presque tous les pays de la région ont fortement augmenté les inscriptions au primaire ; l'enjeu porte désormais sur l'achèvement du cycle, la poursuite au secondaire et l'alphabétisation des adultes.",
	"Conditions de vie": "L'électricité, l'eau potable, l'assainissement, la cuisson propre et Internet changent le quotidien : santé, temps de travail des femmes, études des enfants. Ce sont aussi les indicateurs où l'écart entre villes et campagnes est le plus fort.",
	"Démographie": "La population de l'Afrique de l'Ouest est l'une des plus jeunes et des plus dynamiques du monde. La baisse de la fécondité, plus ou moins avancée selon les pays, et l'urbanisation rapide dessinent les besoins futurs en écoles, emplois et logements.",
	"Égalité femmes-hommes": "La place des femmes en politique et la fécondité des adolescentes, souvent liée aux mariages précoces et à l'abandon scolaire des filles, éclairent les inégalités entre femmes et hommes.",
};

const graphiquesTheme = []; // { serie, canvas, phrase, chart }
let donneesTheme = new Map(); // code -> {annees, series}

function themeDemande() {
	const t = new URLSearchParams(location.search).get("t");
	return INDICATEURS.find(g => slugTheme(g.theme) === t) || INDICATEURS[0];
}

/** Phrase de lecture : niveau, evolution depuis 2000, comparaison a l'Afrique subsaharienne, rang. */
function phraseLecture(serie, iso3, { annees, series }) {
	const nom = trouverPays(iso3).nom;
	const valeurs = series.get(iso3);
	const d = derniereValeur(annees, valeurs);
	if (!d) return `${nom} : indicateur non publié par la Banque mondiale.`;
	const f = (v) => formaterValeur(v, serie.format);
	const premier = valeurs.findIndex(v => v !== null);
	let phrase = `${nom} : ${f(d.valeur)} en ${d.annee}`;
	if (annees[premier] < d.annee) phrase += `, contre ${f(valeurs[premier])} en ${annees[premier]}`;
	const ssf = derniereValeur(annees, series.get("SSF") || []);
	if (ssf) phrase += ` (Afrique subsaharienne : ${f(ssf.valeur)} en ${ssf.annee})`;
	const rang = rangRegion(serie.code, annees, series, iso3);
	if (rang) {
		const sens = ficheIndicateur(serie.code).sens;
		phrase += sens === 0
			? `. ${rang.rang}${rang.rang === 1 ? "ᵉʳ" : "ᵉ"} valeur la plus élevée sur ${rang.total} pays.`
			: `. ${rang.rang}${rang.rang === 1 ? "ᵉʳ" : "ᵉ"} sur ${rang.total} pays, du mieux au moins bien placé.`;
	}
	return phrase;
}

function dessinerGraphiqueTheme(g, iso3) {
	const donnees = donneesTheme.get(g.serie.code);
	if (!donnees) return;
	const { annees, series } = donnees;
	const mis = trouverPays(iso3);
	const gris = couleurTheme("--bordure-forte");
	const jeux = [];
	// Ordre de dessin : les gris d'abord, puis la region, puis le pays mis en avant (au-dessus).
	for (const p of PAYS_REGION) {
		if (p === iso3) continue;
		jeux.push({ label: trouverPays(p).nom, data: series.get(p), borderColor: gris, borderWidth: 1,
			pointRadius: 0, pointHoverRadius: 3, tension: .25, spanGaps: true, order: 3 });
	}
	jeux.push({ label: "Afrique subsaharienne", data: series.get("SSF"), borderColor: couleurTheme("--texte-faible"),
		borderDash: [4, 4], borderWidth: 2, pointRadius: 0, tension: .25, spanGaps: true, order: 2 });
	jeux.push({ label: mis.nom, data: series.get(iso3), borderColor: mis.couleur, backgroundColor: mis.couleur,
		borderWidth: 3, pointRadius: 0, pointHoverRadius: 5, tension: .25, spanGaps: true, order: 1 });

	if (g.chart) g.chart.destroy();
	g.chart = new Chart(g.canvas, {
		type: "line",
		data: { labels: annees, datasets: jeux },
		options: {
			responsive: true, maintainAspectRatio: false,
			animation: { duration: mouvementReduit() ? 0 : 700 },
			interaction: { mode: "nearest", axis: "xy", intersect: false },
			plugins: {
				legend: { display: false },
				tooltip: { callbacks: { label: (c) => `${c.dataset.label} : ${formaterValeur(c.parsed.y, g.serie.format)}` } },
			},
			scales: {
				x: { ticks: { color: couleurTheme("--texte-faible"), maxTicksLimit: 7 }, grid: { display: false } },
				y: { ticks: { color: couleurTheme("--texte-faible"), maxTicksLimit: 5 }, grid: { color: couleurTheme("--bordure") } },
			},
		},
	});
	g.phrase.textContent = phraseLecture(g.serie, iso3, donnees);
	g.legende.innerHTML = "";
	const puce = (texte, classe, couleur) => {
		const s = document.createElement("span");
		s.className = "legende-theme__puce " + classe;
		if (couleur) s.style.setProperty("--puce", couleur);
		s.textContent = texte;
		g.legende.appendChild(s);
	};
	puce(mis.nom, "legende-theme__puce--pays", mis.couleur);
	puce("Afrique subsaharienne", "legende-theme__puce--region");
	puce("15 autres pays", "legende-theme__puce--autres");
}

function afficherTheme(groupe, iso3) {
	document.getElementById("theme-titre").textContent = groupe.theme;
	document.title = `${groupe.theme} | Thèmes | Horizon Ouest`;
	document.getElementById("theme-intro").textContent = INTROS_THEMES[groupe.theme] || "";
	for (const a of document.querySelectorAll("#onglets-themes a")) {
		if (a.dataset.theme === groupe.theme) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
	}
	const zone = document.getElementById("theme-graphiques");
	for (const g of graphiquesTheme) g.chart?.destroy();
	graphiquesTheme.length = 0;
	zone.textContent = "";

	enParallele(groupe.series.map(serie => {
		const figure = document.createElement("figure");
		figure.className = "bloc graphique-theme";
		figure.innerHTML = `
			<figcaption class="bloc__titre"><a></a> <small></small></figcaption>
			<div class="legende-theme"></div>
			<div class="graphique-theme__zone"><canvas></canvas><p class="graphique-theme__attente">Chargement…</p></div>
			<p class="graphique-theme__phrase"></p>`;
		const lien = figure.querySelector("figcaption a");
		lien.textContent = serie.nom;
		lien.href = `index.html?i=${serie.code}&p=${iso3},SSF&d=${DEBUT_THEME}`;
		figure.querySelector("figcaption small").textContent = serie.unite;
		zone.appendChild(figure);
		const g = { serie, canvas: figure.querySelector("canvas"), phrase: figure.querySelector(".graphique-theme__phrase"),
			legende: figure.querySelector(".legende-theme"), chart: null };
		graphiquesTheme.push(g);
		return async () => {
			const attente = figure.querySelector(".graphique-theme__attente");
			try {
				if (!donneesTheme.has(serie.code)) donneesTheme.set(serie.code, await chargerRegion(serie.code, DEBUT_THEME));
				attente.remove();
				dessinerGraphiqueTheme(g, document.getElementById("theme-pays").value);
			} catch (erreur) {
				attente.textContent = "Données indisponibles (Banque mondiale lente ou injoignable). Rechargez la page pour réessayer.";
				console.warn(serie.code, erreur);
			}
		};
	}));
}

(function demarrer() {
	if (typeof Chart === "undefined") {
		document.getElementById("theme-graphiques").textContent = "La bibliothèque Chart.js n'a pas pu être chargée : vérifiez votre connexion.";
		return;
	}
	Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
	const params = new URLSearchParams(location.search);
	let groupe = themeDemande();
	const choixPays = document.getElementById("theme-pays");
	for (const iso3 of PAYS_REGION) choixPays.add(new Option(trouverPays(iso3).nom, iso3));
	choixPays.value = PAYS_REGION.includes(params.get("c")) ? params.get("c") : "CIV";

	const majAdresse = () => history.replaceState(null, "", `?t=${slugTheme(groupe.theme)}&c=${choixPays.value}`);
	const onglets = document.getElementById("onglets-themes");
	for (const g of INDICATEURS) {
		const a = document.createElement("a");
		a.href = `?t=${slugTheme(g.theme)}`;
		a.dataset.theme = g.theme;
		a.textContent = g.theme;
		a.addEventListener("click", (e) => {
			e.preventDefault(); // pas de rechargement : les donnees deja chargees restent en memoire
			groupe = g;
			majAdresse();
			afficherTheme(groupe, choixPays.value);
		});
		onglets.appendChild(a);
	}
	choixPays.addEventListener("change", () => {
		majAdresse();
		for (const g of graphiquesTheme) dessinerGraphiqueTheme(g, choixPays.value);
	});
	brancherThemePage(() => { for (const g of graphiquesTheme) dessinerGraphiqueTheme(g, choixPays.value); });
	afficherTheme(groupe, choixPays.value);
})();
