// pays.js : page « Fiche pays » (pays.html?c=SEN).
// Une ligne par indicateur : valeur, mini-courbe (pays + Afrique subsaharienne), evolution, rang, ODD.

const DEBUT_FICHE = 2000;
// Les donnees d'un indicateur (16 pays + SSF) sont chargees une fois, puis reutilisees
// quand on change de pays : changer de pays ne refait aucune requete.
const donneesFiche = new Map(); // code -> Promise<{annees, series}>

function donneesIndicateur(code) {
	if (!donneesFiche.has(code)) donneesFiche.set(code, chargerRegion(code, DEBUT_FICHE));
	return donneesFiche.get(code);
}

function paysDemande() {
	const c = new URLSearchParams(location.search).get("c");
	return PAYS_REGION.includes(c) ? c : "CIV";
}

/** Squelette : un bloc par theme, une ligne par indicateur (remplie a l'arrivee des donnees). */
function construireSquelette() {
	const zone = document.getElementById("pays-themes");
	const raccourcis = document.getElementById("pays-raccourcis");
	const lignes = new Map();
	for (const groupe of INDICATEURS) {
		const slug = slugTheme(groupe.theme);
		const lienRaccourci = document.createElement("a");
		lienRaccourci.href = `#t-${slug}`;
		lienRaccourci.textContent = groupe.theme;
		raccourcis.appendChild(lienRaccourci);

		const section = document.createElement("section");
		section.className = "fiche-theme";
		section.id = `t-${slug}`;
		section.innerHTML = `
			<header class="fiche-theme__entete">
				<h3 class="fiche-theme__titre"></h3>
				<span class="fiche-theme__compte"></span>
				<a class="fiche-theme__lien"></a>
			</header>`;
		section.querySelector(".fiche-theme__titre").textContent = groupe.theme;
		section.querySelector(".fiche-theme__compte").textContent = `${groupe.series.length} indicateur${groupe.series.length > 1 ? "s" : ""}`;
		const lien = section.querySelector(".fiche-theme__lien");
		lien.href = `theme.html?t=${slug}`;
		lien.textContent = "Comparer les 16 pays →";

		groupe.series.forEach((serie, i) => {
			const ligne = document.createElement("div");
			ligne.className = "ligne-pays";
			ligne.style.setProperty("--i", i);
			ligne.innerHTML = `
				<a class="ligne-pays__nom"></a>
				<span class="ligne-pays__valeur"><strong>…</strong><small></small></span>
				<span class="ligne-pays__courbe"></span>
				<span class="ligne-pays__evolution"></span>
				<span class="ligne-pays__rang"></span>
				<span class="ligne-pays__odd"></span>`;
			ligne.querySelector(".ligne-pays__nom").textContent = serie.nom;
			section.appendChild(ligne);
			lignes.set(serie.code, ligne);
		});
		zone.appendChild(section);
	}
	return lignes;
}

/** Rang illustre : un petit rail de 1 (a gauche, la meilleure situation) au dernier. */
function creerRang({ rang, total }, classe) {
	const conteneur = document.createElement("span");
	conteneur.className = "rang " + classe;
	conteneur.title = `${rang}${rang === 1 ? "ᵉʳ" : "ᵉ"} sur ${total} pays`;
	conteneur.innerHTML = '<span class="rang__texte"></span><span class="rang__rail"><span class="rang__point"></span></span>';
	conteneur.querySelector(".rang__texte").innerHTML = `<b>${rang}</b><sup>${rang === 1 ? "er" : "e"}</sup> / ${total}`;
	conteneur.style.setProperty("--p", total > 1 ? (rang - 1) / (total - 1) : 0);
	return conteneur;
}

function remplirLigne(ligne, serie, iso3, { annees, series }) {
	const q = (s) => ligne.querySelector(s);
	q(".ligne-pays__nom").href = `index.html?i=${serie.code}&p=${iso3},SSF&d=${DEBUT_FICHE}`;
	q(".ligne-pays__nom").title = ficheIndicateur(serie.code).definition;
	const valeurs = series.get(iso3);
	const dernier = derniereValeur(annees, valeurs);
	for (const s of [".ligne-pays__courbe", ".ligne-pays__evolution", ".ligne-pays__rang", ".ligne-pays__odd"]) q(s).textContent = "";
	q(".ligne-pays__evolution").className = "ligne-pays__evolution";
	if (!dernier) {
		q(".ligne-pays__valeur strong").textContent = "n.d.";
		q(".ligne-pays__valeur small").textContent = "Non publié pour ce pays";
		return null;
	}

	animerNombre(q(".ligne-pays__valeur strong"), dernier.valeur, serie.format);
	const legende = `${serie.unite}, ${dernier.annee}`;
	q(".ligne-pays__valeur small").textContent = legende;

	// La population se compare mal a celle de toute l'Afrique subsaharienne : pas de courbe de reference.
	const ssf = serie.code === "SP.POP.TOTL" ? null : series.get("SSF");
	q(".ligne-pays__courbe").appendChild(miniCourbe(annees, valeurs, ssf, (annee, v, vRef) => {
		q(".ligne-pays__valeur small").textContent = annee === null ? legende
			: `${annee} : ${formaterValeur(v, serie.format)}` + (vRef != null ? ` · Afr. subsah. : ${formaterValeur(vRef, serie.format)}` : "");
	}));

	const premier = valeurs.findIndex(v => v !== null);
	if (annees[premier] < dernier.annee) {
		const ecart = dernier.valeur - valeurs[premier];
		const evolution = q(".ligne-pays__evolution");
		evolution.textContent = (ecart > 0 ? "+" : "") + (serie.format === "pourcent"
			? ecart.toFixed(1).replace(".", ",") + " pts"
			: (ecart / Math.abs(valeurs[premier]) * 100).toFixed(0) + " %") + ` depuis ${annees[premier]}`;
		const sens = ficheIndicateur(serie.code).sens;
		evolution.classList.add(sens === 0 || ecart === 0 ? "ligne-pays__evolution--neutre"
			: ecart * sens > 0 ? "ligne-pays__evolution--bon" : "ligne-pays__evolution--mauvais");
	}

	const rang = rangRegion(serie.code, annees, series, iso3);
	if (rang) {
		const sens = ficheIndicateur(serie.code).sens;
		const tete = sens !== 0 && rang.rang <= 3, queue = sens !== 0 && rang.rang > rang.total - 3;
		q(".ligne-pays__rang").appendChild(creerRang(rang, tete ? "rang--tete" : queue ? "rang--queue" : ""));
	}

	const s = situationOdd(serie.code, annees, valeurs);
	if (s) {
		q(".ligne-pays__odd").append(creerPastille(s.statut));
		q(".ligne-pays__odd").title = `${ficheIndicateur(serie.code).odd.texte}. ${phraseRythme(s)}`;
	}
	return s;
}

/** Bilan en tete : trois tuiles, objectifs atteints / en chemin / loin. */
function afficherBilan(situations) {
	const bilan = document.getElementById("pays-bilan");
	bilan.textContent = "";
	const compte = { atteint: 0, proche: 0, loin: 0 };
	for (const s of situations) if (s) compte[s.statut]++;
	const total = compte.atteint + compte.proche + compte.loin;
	if (!total) return;
	const titre = document.createElement("p");
	titre.className = "bilan__titre";
	titre.textContent = `Objectifs 2030 : ${total} indicateurs ont une cible chiffrée`;
	bilan.appendChild(titre);
	for (const statut of ["atteint", "proche", "loin"]) {
		const tuile = document.createElement("div");
		tuile.className = `bilan__tuile bilan__tuile--${statut}`;
		tuile.innerHTML = '<span class="bilan__nombre"></span><span class="bilan__libelle"></span>';
		tuile.querySelector(".bilan__nombre").textContent = compte[statut];
		tuile.querySelector(".bilan__libelle").textContent = LIBELLES_ODD[statut];
		bilan.appendChild(tuile);
	}
}

async function afficherPays(iso3, lignes) {
	document.getElementById("pays-nom").textContent = trouverPays(iso3).nom;
	document.title = `${trouverPays(iso3).nom} | Fiche pays | Horizon Ouest`;
	const bilan = document.getElementById("pays-bilan");
	bilan.textContent = "Chargement des 21 indicateurs…";
	bilan.classList.add("bilan--attente");
	const series = INDICATEURS.flatMap(g => g.series);
	const resultats = await enParallele(series.map(serie => async () => {
		const ligne = lignes.get(serie.code);
		ligne.classList.add("ligne-pays--attente");
		try {
			const donnees = await donneesIndicateur(serie.code);
			if (document.getElementById("pays-choix").value !== iso3) return null; // pays change entre-temps
			return remplirLigne(ligne, serie, iso3, donnees);
		} catch (erreur) {
			donneesFiche.delete(serie.code); // on retentera au prochain changement de pays
			ligne.querySelector(".ligne-pays__valeur strong").textContent = "Indisponible";
			throw erreur;
		} finally {
			ligne.classList.remove("ligne-pays--attente");
		}
	}));
	if (document.getElementById("pays-choix").value !== iso3) return;
	bilan.classList.remove("bilan--attente");
	afficherBilan(resultats.filter(r => r.ok).map(r => r.valeur));
	const echecs = resultats.filter(r => !r.ok).length;
	const erreur = document.getElementById("pays-erreur");
	erreur.hidden = echecs === 0;
	erreur.textContent = `${echecs} indicateur(s) n'ont pas pu être chargés (Banque mondiale lente ou injoignable). Changez de pays ou rechargez la page pour réessayer.`;
}

(function demarrer() {
	brancherThemePage();
	const lignes = construireSquelette();
	const choix = document.getElementById("pays-choix");
	for (const iso3 of PAYS_REGION) choix.add(new Option(trouverPays(iso3).nom, iso3));
	choix.value = paysDemande();
	choix.addEventListener("change", () => {
		history.replaceState(null, "", `?c=${choix.value}`);
		afficherPays(choix.value, lignes);
	});
	afficherPays(choix.value, lignes);
})();
