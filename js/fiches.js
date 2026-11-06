// fiches.js : ce qu'il faut savoir sur chaque indicateur (definition, sens, cible ODD).
// Separe de config.js : le catalogue y est recopie cote Python, pas ces textes.
//
// sens :  1 = plus haut, c'est mieux ; -1 = plus bas, c'est mieux ; 0 = ni l'un ni l'autre.
// odd  :  cible 2030 des Objectifs de developpement durable (ou d'une agence de l'ONU, precisee).

const FICHES = {
	"SP.DYN.LE00.IN": { sens: 1,
		definition: "Nombre d'années que vivrait un nouveau-né si les conditions de mortalité de l'année de sa naissance restaient les mêmes toute sa vie." },
	"SP.DYN.IMRT.IN": { sens: -1,
		definition: "Nombre d'enfants qui meurent avant leur premier anniversaire, pour 1 000 naissances vivantes." },
	"SH.DYN.MORT": { sens: -1,
		definition: "Probabilité qu'un enfant meure avant 5 ans, pour 1 000 naissances vivantes.",
		odd: { cible: 25, texte: "ODD 3.2 : 25 ‰ au plus d'ici 2030" } },
	"SH.STA.MMRT": { sens: -1,
		definition: "Décès de femmes pendant la grossesse ou dans les 42 jours qui suivent, pour 100 000 naissances vivantes. Estimation modélisée par les agences de l'ONU.",
		odd: { cible: 70, texte: "ODD 3.1 : moins de 70 pour 100 000 d'ici 2030" } },
	"SH.IMM.MEAS": { sens: 1,
		definition: "Part des enfants de 12 à 23 mois ayant reçu le vaccin contre la rougeole avant 12 mois.",
		odd: { cible: 95, texte: "Objectif de l'OMS : 95 % des enfants vaccinés" } },
	"SH.HIV.INCD.TL.P3": { sens: -1,
		definition: "Nouvelles infections au VIH dans l'année, pour 1 000 personnes non infectées (tous âges)." },
	"SE.PRM.ENRR": { sens: 0,
		definition: "Élèves inscrits au primaire, quel que soit leur âge, rapportés aux enfants qui ont l'âge officiel du primaire. Le taux peut dépasser 100 % à cause des redoublements et des entrées tardives." },
	"SE.PRM.CMPT.ZS": { sens: 1,
		definition: "Élèves entrant en dernière année du primaire, rapportés aux enfants qui ont l'âge de cette dernière année. Il peut dépasser 100 %.",
		odd: { cible: 100, texte: "ODD 4.1 : tous les enfants achèvent le primaire d'ici 2030" } },
	"SE.SEC.ENRR": { sens: 0,
		definition: "Élèves inscrits au secondaire, quel que soit leur âge, rapportés aux jeunes qui ont l'âge officiel du secondaire. Le taux peut dépasser 100 %." },
	"SE.ADT.LITR.ZS": { sens: 1,
		definition: "Part des personnes de 15 ans et plus qui savent lire et écrire un texte simple sur leur vie quotidienne. Mesurée lors d'enquêtes et de recensements : peu d'années renseignées." },
	"EG.ELC.ACCS.ZS": { sens: 1,
		definition: "Part de la population qui a accès à l'électricité, d'après des enquêtes auprès des ménages.",
		odd: { cible: 100, texte: "ODD 7.1 : accès universel à l'électricité d'ici 2030" } },
	"SH.H2O.BASW.ZS": { sens: 1,
		definition: "Part de la population qui utilise une source d'eau améliorée (robinet, forage, puits protégé) à moins de 30 minutes aller-retour.",
		odd: { cible: 100, texte: "ODD 6.1 : accès universel à l'eau potable d'ici 2030" } },
	"SH.STA.BASS.ZS": { sens: 1,
		definition: "Part de la population qui utilise des toilettes améliorées non partagées avec d'autres ménages.",
		odd: { cible: 100, texte: "ODD 6.2 : accès universel à l'assainissement d'ici 2030" } },
	"EG.CFT.ACCS.ZS": { sens: 1,
		definition: "Part de la population qui cuisine surtout avec des combustibles et des équipements propres (gaz, électricité) plutôt qu'au bois ou au charbon.",
		odd: { cible: 100, texte: "ODD 7.1.2 : accès universel d'ici 2030" } },
	"IT.NET.USER.ZS": { sens: 1,
		definition: "Part de la population qui a utilisé Internet au cours des trois derniers mois, quel que soit l'appareil." },
	"SP.POP.TOTL": { sens: 0,
		definition: "Toutes les personnes qui résident dans le pays, quelle que soit leur nationalité, au milieu de l'année." },
	"SP.POP.GROW": { sens: 0,
		definition: "Variation de la population d'une année sur l'autre, en %. Elle combine naissances, décès et migrations." },
	"SP.URB.TOTL.IN.ZS": { sens: 0,
		definition: "Part de la population qui vit en zone urbaine, selon la définition propre à chaque pays." },
	"SP.DYN.TFRT.IN": { sens: 0,
		definition: "Nombre moyen d'enfants qu'aurait une femme au long de sa vie si la fécondité de l'année restait la même à chaque âge." },
	"SG.GEN.PARL.ZS": { sens: 1,
		definition: "Part des sièges de la chambre basse (ou unique) du Parlement occupés par des femmes.",
		odd: { cible: 50, texte: "ODD 5.5 : parité, soit 50 % des sièges" } },
	"SP.ADO.TFRT": { sens: -1,
		definition: "Naissances chez les adolescentes de 15 à 19 ans, pour 1 000 adolescentes de cet âge." },
};

function ficheIndicateur(code) {
	return FICHES[code] || { sens: 0, definition: "" };
}

/**
 * Situation d'une serie face a sa cible ODD.
 * Statut : "atteint" ; "proche" (a moins de la moitie de la cible) ; "loin".
 * Annee estimee d'atteinte : prolongement de la tendance des 5 dernieres annees renseignees.
 * @returns {null|{statut, valeur, annee, tendance, anneeCible, pente}}
 */
function situationOdd(code, annees, valeurs) {
	const fiche = ficheIndicateur(code);
	if (!fiche.odd || !valeurs) return null;
	const points = annees.map((a, i) => [a, valeurs[i]]).filter(([, v]) => v !== null && v !== undefined);
	if (!points.length) return null;
	const [annee, valeur] = points[points.length - 1];
	const { cible } = fiche.odd;
	const atteint = fiche.sens > 0 ? valeur >= cible : valeur <= cible;
	const ecart = Math.abs(valeur - cible) / cible;
	const statut = atteint ? "atteint" : ecart <= .5 ? "proche" : "loin";

	// Tendance : pente sur les 5 dernieres annees renseignees, dans le bon sens ou non.
	const recents = points.filter(([a]) => a >= annee - 5);
	let tendance = null, anneeCible = null, pente = null;
	if (recents.length >= 2) {
		const [a0, v0] = recents[0];
		pente = (valeur - v0) / (annee - a0);
		tendance = Math.sign(pente) === fiche.sens ? "progres" : pente === 0 ? "stable" : "recul";
		if (!atteint && tendance === "progres") anneeCible = Math.ceil(annee + (cible - valeur) / pente);
	}
	return { statut, valeur, annee, tendance, anneeCible, pente }; // pente : unites par an (projection 2030)
}

const LIBELLES_ODD = { atteint: "Cible atteinte", proche: "En chemin", loin: "Loin de la cible" };

/** Phrase courte : « Au rythme actuel, cible atteinte vers 2041 ». */
function phraseRythme(s) {
	if (s.statut === "atteint") return "Cible déjà atteinte.";
	if (s.tendance === "progres") {
		if (s.anneeCible > 2100) return "Progrès trop lents : cible pas atteinte avant 2100 au rythme actuel.";
		return s.anneeCible <= 2030
			? `Au rythme actuel, cible atteinte vers ${s.anneeCible}.`
			: `Au rythme actuel, cible atteinte vers ${s.anneeCible}, après 2030.`;
	}
	return s.tendance === "recul" ? "La situation se dégrade depuis 5 ans." : "Pas de progrès depuis 5 ans.";
}
