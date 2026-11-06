// tableau.js : rendu du tableau de donnees et des cartes d'indicateurs cles.
// Tout passe par textContent (jamais innerHTML avec des donnees de l'API).

function dessinerTableau(annees, series, indicateur, ruptures) {
	const table = document.getElementById("tableau");
	const thead = table.querySelector("thead");
	const tbody = table.querySelector("tbody");
	thead.textContent = "";
	tbody.textContent = "";

	const ligneEntete = document.createElement("tr");
	const thAnnee = document.createElement("th");
	thAnnee.scope = "col";
	thAnnee.textContent = "Année";
	ligneEntete.appendChild(thAnnee);

	for (const iso3 of series.keys()) {
		const th = document.createElement("th");
		th.scope = "col";
		th.textContent = trouverPays(iso3).nom;
		ligneEntete.appendChild(th);
	}
	thead.appendChild(ligneEntete);

	// Annees les plus recentes en haut : c'est ce qu'on regarde en premier.
	for (let i = annees.length - 1; i >= 0; i--) {
		const tr = document.createElement("tr");
		const th = document.createElement("th");
		th.scope = "row";
		th.textContent = annees[i];
		tr.appendChild(th);

		for (const [iso3, valeurs] of series) {
			const td = document.createElement("td");
			const v = valeurs[i];
			td.textContent = formaterValeur(v, indicateur.format);
			if (v === null) td.classList.add("nd");
			const rupture = ruptures && (ruptures.get(iso3) || []).find(r => r.annee === annees[i]);
			if (rupture) {
				td.classList.add("rupture");
				td.title = "Rupture détectée : variation inhabituelle par rapport aux autres années";
			}
			tr.appendChild(td);
		}
		tbody.appendChild(tr);
	}
}

function creerCarte(etiquette, valeur, detail, classeValeur, extra = null) {
	const carte = document.createElement("div");
	carte.className = "carte";

	const e = document.createElement("div");
	e.className = "carte__etiquette";
	e.textContent = etiquette;

	const v = document.createElement("div");
	v.className = "carte__valeur" + (classeValeur ? " carte__valeur--" + classeValeur : "");
	v.textContent = valeur;

	const d = document.createElement("div");
	d.className = "carte__detail";
	d.textContent = detail;

	carte.append(e, v, d);
	if (extra) carte.appendChild(extra); // courbe ou rail de rang, en bas de carte
	return carte;
}

/**
 * Cartes cles. On les calcule sur le pays de reference (le premier selectionne),
 * puis on ajoute un classement si plusieurs pays sont compares.
 */
function dessinerCartes(annees, series, indicateur) {
	const conteneur = document.getElementById("cartes");
	conteneur.textContent = "";

	const isoReference = series.keys().next().value;
	const valeursRef = series.get(isoReference);
	const stats = calculerStats(annees, valeursRef, indicateur.format);
	if (!stats) return;

	const pays = trouverPays(isoReference);
	// Vert = evolution favorable, rouge = defavorable (une mortalite qui baisse est en vert) ;
	// indicateur sans « bon sens » (population, scolarisation brute) : couleur neutre.
	const { sens } = ficheIndicateur(indicateur.code);
	const teinte = (v) => (sens === 0 || v === 0 ? "neutre" : v * sens > 0 ? "bon" : "mauvais");

	// Derniere valeur : avec la courbe du pays sur la periode (lecture au survol).
	const detailFin = `${pays.nom}, ${stats.anneeFin}`;
	const carteFin = creerCarte("Dernière valeur", formaterValeur(stats.vFin, indicateur.format), detailFin);
	carteFin.classList.add("carte--courbe");
	const zoneCourbe = document.createElement("div");
	zoneCourbe.className = "carte__courbe";
	zoneCourbe.appendChild(miniCourbe(annees, valeursRef, null, (annee, v) => {
		carteFin.querySelector(".carte__detail").textContent = annee === null ? detailFin
			: `${pays.nom}, ${annee} : ${formaterValeur(v, indicateur.format)}`;
	}));
	carteFin.appendChild(zoneCourbe);
	conteneur.appendChild(carteFin);

	if (stats.variation !== null) {
		conteneur.appendChild(creerCarte(
			stats.enPoints ? "Évolution sur la période" : "Variation sur la période",
			formaterVariation(stats, indicateur.format),
			`de ${stats.anneeDebut} à ${stats.anneeFin}`,
			teinte(stats.variation)
		));
	}

	if (stats.tcam !== null) {
		const signe = stats.tcam >= 0 ? "+" : "";
		conteneur.appendChild(creerCarte(
			"Croissance annuelle moyenne",
			signe + stats.tcam.toFixed(2).replace(".", ",") + " %",
			"par an (TCAM)",
			teinte(stats.tcam)
		));
	}

	conteneur.appendChild(creerCarte(
		"Moyenne de la période",
		formaterValeur(stats.moyenne, indicateur.format),
		`${stats.nbPoints} année(s) renseignée(s)`
	));

	// Classement : uniquement entre pays, les agregats ne sont pas comparables.
	// Rang 1 = la meilleure situation selon le « bon sens » de l'indicateur (la plus faible
	// mortalite) ; sans bon sens (population...), rang 1 = la valeur la plus elevee.
	if (series.size > 1) {
		const classement = [];
		for (const [iso3, valeurs] of series) {
			const p = trouverPays(iso3);
			if (p.agregat || p.importe) continue; // un rang entre series importees n'a pas de sens
			const s = calculerStats(annees, valeurs, indicateur.format);
			if (s) classement.push({ iso3, valeur: s.vFin });
		}
		if (classement.length > 1) {
			classement.sort((a, b) => (b.valeur - a.valeur) * (sens || 1));
			const rang = classement.findIndex(c => c.iso3 === isoReference) + 1;
			if (rang > 0) {
				const total = classement.length;
				const rail = document.createElement("div");
				rail.className = "rang__rail carte__rail";
				rail.innerHTML = '<span class="rang__point"></span>';
				rail.style.setProperty("--p", (rang - 1) / (total - 1));
				const carteRang = creerCarte("Rang", `${rang}${rang === 1 ? "ᵉʳ" : "ᵉ"} / ${total}`,
					sens === 0 ? "de la valeur la plus élevée à la plus basse" : "du mieux au moins bien placé", null, rail);
				if (sens !== 0) carteRang.classList.add(rang === 1 ? "rang--tete" : rang === total ? "rang--queue" : "rang--milieu");
				conteneur.appendChild(carteRang);
			}
		}
	}
}

/** Phrase de commentaire generee par regles (aucun service externe). */
function commenterSerie(annees, series, indicateur) {
	const isoReference = series.keys().next().value;
	const stats = calculerStats(annees, series.get(isoReference), indicateur.format);
	if (!stats) return "";

	const pays = trouverPays(isoReference).nom;
	if (stats.nbPoints < 2) {
		return `Une seule valeur disponible pour ${pays} (${stats.anneeFin}) : aucune tendance ne peut être décrite.`;
	}

	// Seuil de stabilite : 5 % pour un niveau ; pour un taux ou un ecart,
	// 5 % de la plus grande des deux valeurs (en valeur absolue).
	const seuil = stats.enPoints
		? 0.05 * Math.max(Math.abs(stats.vDebut), Math.abs(stats.vFin))
		: 5;
	const significatif = stats.variation !== null && Math.abs(stats.variation) > seuil;

	let sens = "est restée stable";
	if (significatif) sens = stats.variation > 0 ? "a augmenté" : "a diminué";

	let phrase = `Entre ${stats.anneeDebut} et ${stats.anneeFin}, la série « ${indicateur.nom} » ${sens}`;
	if (significatif) {
		// formaterVariation donne le signe ; le verbe porte deja le sens.
		phrase += ` de ${formaterVariation(stats, indicateur.format).replace(/^[+-]/, "")}`;
	}
	phrase += ` pour ${pays}`;
	if (stats.tcam !== null) {
		phrase += `, soit ${stats.tcam.toFixed(2).replace(".", ",")} % par an en moyenne`;
	}
	return phrase + ".";
}

/**
 * Liste des ruptures detectees, en phrases.
 * @param {Map<string,object[]>} ruptures
 */
function dessinerRuptures(ruptures, indicateur) {
	const bloc = document.getElementById("bloc-ruptures");
	const liste = document.getElementById("liste-ruptures");
	liste.textContent = "";

	if (!ruptures) {
		bloc.hidden = true;
		return;
	}
	bloc.hidden = false;

	let total = 0;
	for (const [iso3, items] of ruptures) {
		for (const r of items) {
			total += 1;
			const li = document.createElement("li");
			const sens = r.score > 0 ? "hausse" : "baisse";
			const formatBase = indicateur.format.replace(/^\+/, "");
			const ecrire = (x) => {
				const signe = x >= 0 ? "+" : "";
				if (r.enTaux) return signe + x.toFixed(1).replace(".", ",") + " %";
				if (formatBase === "pourcent") return signe + x.toFixed(1).replace(".", ",") + " pt";
				return formaterValeur(x, "+" + formatBase);
			};
			const force = Number.isFinite(r.score)
				? `${Math.abs(r.score).toFixed(1).replace(".", ",")} fois l'écart habituel`
				: "série jusque-là parfaitement régulière";
			li.textContent = `${trouverPays(iso3).nom}, ${r.annee} : variation de ${ecrire(r.variation)} `
				+ `alors que la tendance du moment était de ${ecrire(r.tendance)} par an : `
				+ `rupture à la ${sens} (${force}).`;
			li.className = sens;
			liste.appendChild(li);
		}
	}

	if (total === 0) {
		const li = document.createElement("li");
		li.textContent = `Aucune rupture : aucune variation ne s'écarte nettement de la tendance du moment `
			+ `(il faut au moins ${MIN_VARIATIONS_RUPTURE + 1} années renseignées par série).`;
		liste.appendChild(li);
	}
}
