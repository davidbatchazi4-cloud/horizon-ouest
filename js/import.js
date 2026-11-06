// import.js : lecture d'un fichier CSV personnel.
//
// Format attendu (le meme que celui produit par « Export CSV », pour pouvoir
// reimporter un fichier exporte) :
//
//   Annee;Serie A;Serie B
//   2010;12,5;8
//   2011;13,1;
//
// - premiere colonne : l'annee ; colonnes suivantes : une serie chacune ;
// - separateur « ; » ou « , » (detecte sur la ligne d'en-tete) ;
// - virgule ou point decimal ; cellule vide = donnee manquante.

const TAILLE_MAX_IMPORT = 1024 * 1024; // 1 Mo : largement assez pour des series annuelles
// Teintes vives absentes de la palette des pays (config.js) ; le graphique les dessine en plus epais.
const COULEURS_IMPORT = ["#ff1f6b", "#00c2a8", "#3a0ca3", "#ff7aa2", "#4d9de0", "#c44900", "#6a994e", "#9d4edd"];

class ErreurImport extends Error {
	constructor(message) {
		super(message);
		this.name = "ErreurImport";
	}
}

/** Lit le contenu texte d'un fichier choisi par l'utilisateur. */
function lireFichierTexte(fichier) {
	return new Promise((resoudre, rejeter) => {
		const lecteur = new FileReader();
		lecteur.onload = () => resoudre(lecteur.result);
		lecteur.onerror = () => rejeter(new ErreurImport("Le fichier n'a pas pu être lu."));
		lecteur.readAsText(fichier, "utf-8");
	});
}

/** Convertit une cellule en nombre, en acceptant la virgule decimale. Vide → null. */
function lireNombre(cellule, numeroLigne, nomColonne) {
	const texte = cellule.trim().replace(/\s/g, "");
	if (texte === "") return null;
	const nombre = Number(texte.replace(",", "."));
	if (!Number.isFinite(nombre)) {
		throw new ErreurImport(`Ligne ${numeroLigne}, colonne « ${nomColonne} » : « ${cellule.trim()} » n'est pas un nombre.`);
	}
	return nombre;
}

/**
 * Analyse le texte d'un CSV et renvoie des series au meme format que
 * construireSeries(), pour reutiliser tel quel le graphique, le tableau et les stats.
 * @returns {{annees: number[], series: Map<string,(number|null)[]>, noms: string[]}}
 */
function analyserCsv(texte) {
	const lignes = texte
		.replace(/^﻿/, "")       // BOM UTF-8 eventuel (ajoute par notre propre export)
		.split(/\r?\n/)
		.filter(l => l.trim() !== "");

	if (lignes.length < 3) {
		throw new ErreurImport("Le fichier doit contenir une ligne d'en-tête et au moins deux années.");
	}

	const separateur = lignes[0].includes(";") ? ";" : ",";
	const entete = lignes[0].split(separateur).map(c => c.trim());
	if (entete.length < 2) {
		throw new ErreurImport("Il faut au moins deux colonnes : l'année, puis une série.");
	}
	const noms = entete.slice(1).map((n, i) => n || `Série ${i + 1}`);
	const doublon = noms.find((n, i) => noms.indexOf(n) !== i);
	if (doublon) {
		throw new ErreurImport(`La colonne « ${doublon} » apparaît deux fois dans l'en-tête.`);
	}

	const parAnnee = new Map();
	for (let i = 1; i < lignes.length; i++) {
		const cellules = lignes[i].split(separateur);
		const annee = Number(cellules[0].trim());
		if (!Number.isInteger(annee) || annee < 1800 || annee > 2100) {
			throw new ErreurImport(`Ligne ${i + 1} : « ${cellules[0].trim()} » n'est pas une année valide.`);
		}
		if (parAnnee.has(annee)) {
			throw new ErreurImport(`L'année ${annee} apparaît deux fois.`);
		}
		parAnnee.set(annee, noms.map((nom, j) => lireNombre(cellules[j + 1] || "", i + 1, nom)));
	}

	const annees = [...parAnnee.keys()].sort((a, b) => a - b);
	const series = new Map();
	noms.forEach((nom, j) => {
		series.set(nom, annees.map(a => parAnnee.get(a)[j]));
	});

	if ([...series.values()].every(serieVide)) {
		throw new ErreurImport("Le fichier ne contient aucune valeur numérique.");
	}
	return { annees, series, noms };
}

/** Lit, verifie et analyse le fichier choisi. */
async function importerCsv(fichier) {
	if (!/\.(csv|txt)$/i.test(fichier.name)) {
		throw new ErreurImport("Choisissez un fichier .csv.");
	}
	if (fichier.size > TAILLE_MAX_IMPORT) {
		throw new ErreurImport("Fichier trop volumineux (1 Mo maximum).");
	}
	const resultat = analyserCsv(await lireFichierTexte(fichier));

	// Les colonnes importees deviennent des « pays » temporaires, avec leur couleur,
	// pour que trouverPays() fonctionne dans le graphique, le tableau et les exports.
	PAYS_IMPORTES.length = 0;
	resultat.noms.forEach((nom, i) => {
		PAYS_IMPORTES.push({ iso3: nom, nom, couleur: COULEURS_IMPORT[i % COULEURS_IMPORT.length], importe: true });
	});
	return resultat;
}

/* Fichier d'exemple : montre le format attendu, et se reimporte tel quel. */
document.getElementById("exemple-csv")?.addEventListener("click", () => {
	// valeurs fictives : seul le format compte
	const contenu = "Année;Série fictive A;Série fictive B\n"
		+ "2019;56,1;41,2\n2020;64,3;35,8\n2021;58,9;\n2022;66,4;30,8\n2023;70,2;33,4\n";
	telecharger(new Blob(["\ufeff" + contenu], { type: "text/csv;charset=utf-8" }), "exemple-import.csv");
});
