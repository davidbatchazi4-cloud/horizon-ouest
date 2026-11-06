// export.js : telechargement des donnees affichees : CSV et rapport PDF.
// Toutes les fonctions travaillent sur l'objet `rendu` produit par main.js :
// { annees, series, indicateur, debut, fin, commentaire }

/** Declenche le telechargement d'un Blob sous un nom donne. */
function telecharger(blob, nomFichier) {
	const url = URL.createObjectURL(blob);
	const lien = document.createElement("a");
	lien.href = url;
	lien.download = nomFichier;
	document.body.appendChild(lien);
	lien.click();
	lien.remove();
	URL.revokeObjectURL(url);
}

/* ===================== CSV ===================== */

/**
 * Export CSV : separateur point-virgule et BOM UTF-8, pour qu'Excel en configuration
 * francaise ouvre le fichier directement, sans passer par l'assistant d'import.
 */
function exporterCsv(rendu) {
	const { annees, series, indicateur, debut, fin } = rendu;
	const isos = [...series.keys()];

	const lignes = [["Annee", ...isos.map(i => trouverPays(i).nom)]];
	for (const [i, annee] of annees.entries()) {
		lignes.push([annee, ...isos.map(iso => {
			const v = series.get(iso)[i];
			return v === null ? "" : String(v).replace(".", ","); // virgule decimale
		})]);
	}

	const contenu = "﻿" + lignes.map(l => l.join(";")).join("\r\n");
	telecharger(
		new Blob([contenu], { type: "text/csv;charset=utf-8;" }),
		nomFichierSur(`${indicateur.code}_${debut}-${fin}.csv`)
	);
}

/* ===================== Excel ===================== */

/** Nom de fichier sans caracteres interdits par Windows. */
function nomFichierSur(texte) {
	return texte.replace(/[\\/:*?"<>|]/g, "_");
}

/**
 * Classeur Excel (SheetJS) a trois ou quatre feuilles :
 *  - « Données » : les valeurs, en vrais nombres (pas du texte), une colonne par pays ;
 *  - « Statistiques » : les indicateurs calcules par l'application, par pays ;
 *  - « Ruptures » : les annees signalees, si la detection est active ;
 *  - « Source » : provenance des donnees et methodes de calcul.
 */
function exporterExcel(rendu) {
	if (typeof XLSX === "undefined") {
		throw new ErreurApi(
			"La bibliothèque SheetJS n'a pas pu être chargée depuis le CDN. "
			+ "L'export Excel est indisponible hors ligne."
		);
	}

	const { annees, series, indicateur, debut, fin, ruptures, source } = rendu;
	const isos = [...series.keys()];
	const classeur = XLSX.utils.book_new();

	// ---- Donnees ----
	const donnees = [["Année", ...isos.map(i => trouverPays(i).nom)]];
	annees.forEach((annee, i) => {
		donnees.push([annee, ...isos.map(iso => series.get(iso)[i])]); // null → cellule vide
	});
	const feuilleDonnees = XLSX.utils.aoa_to_sheet(donnees);
	feuilleDonnees["!cols"] = [{ wch: 8 }, ...isos.map(() => ({ wch: 18 }))];
	XLSX.utils.book_append_sheet(classeur, feuilleDonnees, "Données");

	// ---- Statistiques ----
	const enPoints = estSerieEnPoints(indicateur.format);
	const stats = [[
		"Série", "Première année", "Première valeur", "Dernière année", "Dernière valeur",
		enPoints ? "Évolution (différence)" : "Variation (%)", "TCAM (%)", "Moyenne", "Minimum", "Maximum", "Années renseignées",
	]];
	for (const iso of isos) {
		const s = calculerStats(annees, series.get(iso), indicateur.format);
		if (!s) continue;
		stats.push([
			trouverPays(iso).nom, s.anneeDebut, s.vDebut, s.anneeFin, s.vFin,
			s.variation, s.tcam, s.moyenne, s.min, s.max, s.nbPoints,
		]);
	}
	const feuilleStats = XLSX.utils.aoa_to_sheet(stats);
	feuilleStats["!cols"] = stats[0].map(() => ({ wch: 16 }));
	XLSX.utils.book_append_sheet(classeur, feuilleStats, "Statistiques");

	// ---- Ruptures ----
	if (ruptures && ruptures.size > 0) {
		const lignes = [["Série", "Année", "Variation annuelle", "Tendance du moment", "Unité", "Score robuste"]];
		for (const [iso, liste] of ruptures) {
			for (const r of liste) {
				lignes.push([
					trouverPays(iso).nom, r.annee, r.variation, r.tendance,
					r.enTaux ? "% par an" : indicateur.unite,
					Number.isFinite(r.score) ? Number(r.score.toFixed(2)) : null,
				]);
			}
		}
		XLSX.utils.book_append_sheet(classeur, XLSX.utils.aoa_to_sheet(lignes), "Ruptures");
	}

	// ---- Source et methodes ----
	const notes = [
		["Indicateur", `${indicateur.nom} (${indicateur.unite})`],
		["Période", `${debut}-${fin}`],
		["Source", source === "import"
			? "Fichier CSV importé par l'utilisateur"
			: source === "comparatif"
				? `Fichier CSV importé par l'utilisateur, comparé à Banque mondiale, World Development Indicators, code ${indicateur.code}`
				: `Banque mondiale, World Development Indicators, code ${indicateur.code}`],
		enPoints
			? ["Évolution", "dernière valeur − première valeur (série déjà en % ou écart : différence, pas de TCAM)"]
			: ["Variation (%)", "(dernière valeur − première valeur) / |première valeur| × 100"],
		["TCAM (%)", "((dernière / première)^(1 / nombre d'années) − 1) × 100, si les deux valeurs sont positives"],
		["Calculs", rendu.calculePar === "serveur" ? "Serveur FastAPI (Python)" : "Navigateur (JavaScript)"],
		["Généré le", new Date().toLocaleString("fr-FR")],
	];
	const feuilleSource = XLSX.utils.aoa_to_sheet(notes);
	feuilleSource["!cols"] = [{ wch: 16 }, { wch: 90 }];
	XLSX.utils.book_append_sheet(classeur, feuilleSource, "Source");

	XLSX.writeFile(classeur, nomFichierSur(`${indicateur.code}_${debut}-${fin}.xlsx`));
}

/* ===================== Rapport PDF ===================== */
// Mise en page reprise du modele de rapport fourni par l'equipe : page de garde
// (logo, organisme, bandes, encadre du titre), sommaire, sections numerotees
// I., II. et 1., 2., conclusion, annexe ; pied de page sur chaque page.

const PDF = {
	marge: 20,
	largeur: 210,  // A4 portrait, en millimetres
	hauteur: 297,
	basContenu: 270, // au-dela : nouvelle page (le pied commence a 279)
	nuit: [0, 33, 71],
	orange: [247, 127, 0],
	vert: [0, 158, 96],
	jaune: [252, 196, 78],
};

/** Les polices standard de jsPDF ne connaissent que l'encodage WinAnsi. */
function textePdf(texte) {
	return String(texte)
		.replace(/[  ]/g, " ")  // espaces insecables de toLocaleString("fr-FR")
		.replace(/≈/g, "~").replace(/−/g, "-").replace(/ᵉ/g, "e");
}

/**
 * Logo « Horizon Ouest » (meme dessin que images/logo.svg) en (x, y), cote c mm : les 15 pays continentaux
 * (contours de carte-afrique.js), la Cote d'Ivoire en orange, poses sur un arc dore, sur fond bleu nuit.
 * Memes reglages que le script qui a genere logo.svg (largeur 420/512, cote sud a y = 372, arc 64-448).
 */
function dessinerLogoPdf(doc, x, y, c) {
	const k = c / 512;
	const X = (v) => x + v * k, Y = (v) => y + v * k;
	doc.setFillColor(0, 33, 71);
	doc.roundedRect(x, y, c, c, 112 * k, 112 * k, "F");

	// Horizon : courbe quadratique du SVG convertie en courbe de Bezier cubique (seul type connu de jsPDF).
	const [p0, q, p2] = [[64, 420], [256, 356], [448, 420]];
	const c1 = p0.map((v, i) => v + (2 / 3) * (q[i] - v)), c2 = p2.map((v, i) => v + (2 / 3) * (q[i] - v));
	doc.setDrawColor(252, 196, 78);
	doc.setLineWidth(30 * k);
	doc.setLineCap("round");
	doc.path([{ op: "m", c: [X(p0[0]), Y(p0[1])] }, { op: "c", c: [X(c1[0]), Y(c1[1]), X(c2[0]), Y(c2[1]), X(p2[0]), Y(p2[1])] }]);
	doc.stroke();
	doc.setLineCap("butt");

	if (typeof CARTE_AFRIQUE === "undefined") return; // sans contours : fond et horizon seulement
	const pays = CARTE_AFRIQUE.pays.filter(p => p.iso3 !== "CPV");
	const points = (d) => [...d.matchAll(/([ML])([^MLZ]*)/g)].map(([, , a]) => a.split(/[ ,]+/).filter(Boolean).map(Number));
	const tous = pays.flatMap(p => points(p.d));
	const xmin = Math.min(...tous.map(p => p[0])), xmax = Math.max(...tous.map(p => p[0]));
	const ymin = Math.min(...tous.map(p => p[1])), ymax = Math.max(...tous.map(p => p[1]));
	const e = 420 / (xmax - xmin);
	const ox = 46 - xmin * e, oy = 372 - (ymax - ymin) * e - ymin * e;
	const ops = (d) => {
		const liste = [];
		for (const [, cmd, args] of d.matchAll(/([MLZ])([^MLZ]*)/g)) {
			if (cmd === "Z") { liste.push({ op: "h", c: [] }); continue; }
			const [a, b] = args.split(/[ ,]+/).filter(Boolean).map(Number);
			liste.push({ op: cmd === "M" ? "m" : "l", c: [X(a * e + ox), Y(b * e + oy)] });
		}
		return liste;
	};
	doc.setDrawColor(0, 33, 71);
	doc.setLineWidth(3 * k);
	for (const p of pays) {
		doc.setFillColor(...(p.iso3 === "CIV" ? [247, 127, 0] : [230, 237, 245]));
		doc.path(ops(p.d));
		doc.fillStroke();
	}
	doc.setDrawColor(...PDF.nuit);
}

/**
 * Carte des 16 pays, telle qu'affichee dans l'application (meme annee, meme echelle de couleurs,
 * en version claire), dessinee en vectoriel a partir des contours de carte-afrique.js.
 * A gauche la carte, a droite le classement. Renvoie la hauteur occupee (mm), ou 0 sans carte.
 */
function dessinerCartePdf(doc, x, y, largeur) {
	if (typeof etatCarte === "undefined" || !etatCarte.donnees || !etatCarte.valeurs) return 0;
	const { indicateur, min, max } = etatCarte.donnees;
	const valeurs = etatCarte.valeurs;
	const MIN = [227, 236, 246], MAX = [11, 58, 110]; // --carte-min / --carte-max du theme clair
	const couleur = (v) => {
		const t = max > min ? (v - min) / (max - min) : 0.5;
		return MIN.map((a, i) => Math.round(a + (MAX[i] - a) * t));
	};
	const fonce = ([r, g, b]) => (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.55;

	const largeurCarte = largeur * 0.64;
	const k = largeurCarte / CARTE_AFRIQUE.largeur;
	const hauteurCarte = CARTE_AFRIQUE.hauteur * k;
	const X = (v) => x + v * k, Y = (v) => y + v * k;

	// « M x,y L x,y ... Z » -> operations de trace jsPDF (coordonnees deja en mm)
	const operations = (d) => {
		const ops = [];
		for (const [, cmd, args] of d.matchAll(/([MLZ])([^MLZ]*)/g)) {
			if (cmd === "Z") { ops.push({ op: "h", c: [] }); continue; }
			const [a, b] = args.split(/[ ,]+/).filter(Boolean).map(Number);
			ops.push({ op: cmd === "M" ? "m" : "l", c: [X(a), Y(b)] });
		}
		return ops;
	};

	// Comme dans l'application, la carte est rognee a son cadre (les pays voisins le depassent).
	doc.saveGraphicsState();
	doc.rect(x, y, largeurCarte, hauteurCarte, null);
	doc.clip();
	doc.discardPath();
	doc.setFillColor(243, 247, 251); // ocean
	doc.rect(x, y, largeurCarte, hauteurCarte, "F");
	doc.setLineWidth(0.15);
	doc.setDrawColor(255, 255, 255);
	doc.setFillColor(222, 228, 235); // pays voisins
	doc.path(operations(CARTE_AFRIQUE.voisins));
	doc.fillStroke();
	for (const p of CARTE_AFRIQUE.pays) {
		const v = valeurs.get(p.iso3);
		doc.setFillColor(...(v === null || v === undefined ? [246, 246, 246] : couleur(v)));
		doc.path(operations(p.d));
		doc.fillStroke();
	}
	doc.restoreGraphicsState();
	// Encadre du Cap-Vert
	const e = CARTE_AFRIQUE.encadre;
	doc.setDrawColor(164, 182, 202);
	doc.setLineWidth(0.2);
	doc.rect(X(e.x), Y(e.y), e.l * k, e.h * k, "S");
	doc.setFont("helvetica", "normal");
	doc.setFontSize(5.5);
	doc.setTextColor(87, 114, 145);
	doc.text("Cap-Vert", X(e.x + e.l / 2), Y(e.y + e.h + 9), { align: "center" });
	// Valeurs ecrites sur les grands pays
	doc.setFont("helvetica", "bold");
	doc.setFontSize(6.5);
	for (const p of CARTE_AFRIQUE.pays) {
		const v = valeurs.get(p.iso3);
		if (!p.etiquette || v === null || v === undefined) continue;
		doc.setTextColor(...(fonce(couleur(v)) ? [255, 255, 255] : [0, 33, 71]));
		doc.text(textePdf(formaterCourt(v)), X(p.etiquette[0]), Y(p.etiquette[1]) + 1, { align: "center" });
	}

	// Legende : degrade de min a max
	const yLegende = y + hauteurCarte + 4;
	const pas = 24, lPas = (largeurCarte * 0.6) / pas;
	for (let i = 0; i < pas; i++) {
		doc.setFillColor(...couleur(min + (max - min) * (i / (pas - 1))));
		doc.rect(x + largeurCarte * 0.2 + i * lPas, yLegende, lPas + 0.05, 2.6, "F");
	}
	doc.setFont("helvetica", "normal");
	doc.setFontSize(7);
	doc.setTextColor(87, 114, 145);
	doc.text(textePdf(formaterValeur(min, indicateur.format)), x + largeurCarte * 0.2 - 1.5, yLegende + 2.2, { align: "right" });
	doc.text(textePdf(formaterValeur(max, indicateur.format)), x + largeurCarte * 0.8 + 1.5, yLegende + 2.2);

	// Classement, dans le meme ordre que l'application (valeur decroissante, pays sans donnee a la fin)
	const tries = [...valeurs].sort(([isoA, a], [isoB, b]) =>
		(a === null) - (b === null) || b - a || NOM_CARTE[isoA].localeCompare(NOM_CARTE[isoB], "fr"));
	const xC = x + largeurCarte + 6, lC = largeur - largeurCarte - 6;
	const hLigne = Math.min(4.6, (hauteurCarte + 6) / tries.length);
	let rang = 0, yl = y + 2;
	doc.setFontSize(7.5);
	for (const [iso3, v] of tries) {
		if (iso3 === "CIV") { // la Cote d'Ivoire ressort, comme dans l'application
			doc.setFillColor(253, 240, 220);
			doc.rect(xC - 1, yl - 3.1, lC + 1, hLigne, "F");
		}
		doc.setFont("helvetica", iso3 === "CIV" ? "bold" : "normal");
		doc.setTextColor(87, 114, 145);
		doc.text(v === null ? "" : String(++rang), xC + 3, yl, { align: "right" });
		doc.setTextColor(0, 33, 71);
		doc.text(textePdf(NOM_CARTE[iso3]), xC + 5, yl);
		doc.text(textePdf(v === null ? "n.d." : formaterValeur(v, indicateur.format)), xC + lC, yl, { align: "right" });
		yl += hLigne;
	}
	return Math.max(hauteurCarte + 9, yl - y);
}

function pageDeGarde(doc, rendu, pays) {
	const { indicateur, debut, fin } = rendu;
	const centre = PDF.largeur / 2;
	const aujourdhui = new Date().toLocaleDateString("fr-FR");

	doc.setDrawColor(...PDF.nuit);
	doc.setLineWidth(0.4);
	doc.rect(10, 10, PDF.largeur - 20, 264); // s'arrete au-dessus du pied de page

	dessinerLogoPdf(doc, centre - 18, 34, 36);

	doc.setTextColor(...PDF.nuit);
	doc.setFont("times", "bold");
	doc.setFontSize(24);
	doc.text("HORIZON OUEST", centre, 86, { align: "center" });
	doc.setFont("times", "italic");
	doc.setFontSize(12);
	doc.text("Le développement humain en Afrique de l'Ouest, année après année", centre, 94, { align: "center" });
	doc.setFont("times", "normal");
	doc.setFontSize(11);
	doc.text("École nationale supérieure de statistique et d'économie appliquée (ENSEA), Abidjan", centre, 108, { align: "center" });
	doc.setFontSize(10);
	doc.text("Projet de développement web · AS3 · 2026-2027", centre, 115, { align: "center" });

	const bande = (y) => { doc.setFillColor(...PDF.nuit); doc.rect(25, y, PDF.largeur - 50, 2.2, "F"); };
	bande(135);
	doc.setFont("times", "bold");
	doc.setFontSize(18);
	doc.text(`RAPPORT D'ANALYSE N° ${aujourdhui}`, centre, 150, { align: "center" });
	bande(158);

	// Encadre arrondi du titre, comme dans le modele.
	doc.setLineWidth(0.5);
	doc.roundedRect(25, 170, PDF.largeur - 50, 50, 6, 6);
	doc.setFontSize(17);
	const titre = doc.splitTextToSize(textePdf(indicateur.nom), PDF.largeur - 70);
	doc.text(titre, centre, 186, { align: "center" });
	doc.setFont("times", "normal");
	doc.setFontSize(11);
	const sousTitre = doc.splitTextToSize(textePdf(`${indicateur.unite} · ${debut}-${fin} · ${pays.join(", ")}`), PDF.largeur - 70);
	doc.text(sousTitre, centre, 186 + titre.length * 7 + 2, { align: "center" });
	bande(232);
}

function piedsDePage(doc, source) {
	const total = doc.getNumberOfPages();
	for (let i = 1; i <= total; i++) {
		doc.setPage(i);
		doc.setDrawColor(...PDF.nuit);
		doc.setLineWidth(0.3);
		doc.line(PDF.marge, 279, PDF.largeur - PDF.marge, 279);
		doc.setFont("helvetica", "bold");
		doc.setFontSize(7.5);
		doc.setTextColor(...PDF.nuit);
		doc.text("Horizon Ouest, le développement humain en Afrique de l'Ouest · ENSEA Abidjan", PDF.largeur / 2, 284, { align: "center" });
		doc.setFont("helvetica", "normal");
		doc.text(source === "import"
			? "Source : fichier CSV importé par l'utilisateur"
			: source === "comparatif"
				? "Sources : fichier CSV importé par l'utilisateur et Banque mondiale, World Development Indicators"
				: "Source des données : Banque mondiale, World Development Indicators (api.worldbank.org)",
			PDF.largeur / 2, 288, { align: "center" });
		if (i > 1) doc.text(`${i} / ${total}`, PDF.largeur - PDF.marge, 288, { align: "right" });
	}
}

/**
 * Rapport PDF genere dans le navigateur. Plan court (4 a 6 pages) :
 * garde, sommaire et introduction, I. evolution, II. comparaison, conclusion, annexe.
 */
function exporterPdf(rendu) {
	if (typeof window.jspdf === "undefined") {
		throw new ErreurApi(
			"La bibliothèque jsPDF n'a pas pu être chargée depuis le CDN. "
			+ "Le rapport PDF est indisponible hors ligne."
		);
	}

	const { annees, series, indicateur, debut, fin, commentaire, previsions, ruptures, source, calculePar } = rendu;
	const { jsPDF } = window.jspdf;
	const doc = new jsPDF({ unit: "mm", format: "a4" });
	const isos = [...series.keys()];
	const nomsPays = isos.map(i => trouverPays(i).nom);
	const largeurUtile = PDF.largeur - 2 * PDF.marge;
	const sommaire = []; // { titre, niveau, page }
	let y = 0;

	pageDeGarde(doc, rendu, nomsPays);

	// ---- Outils de mise en page ----
	const nouvellePage = () => { doc.addPage(); y = 25; };
	const besoin = (h) => { if (y + h > PDF.basContenu) nouvellePage(); };

	// `suite` : hauteur du contenu qui doit tenir sous le titre (pas de titre orphelin en bas de page).
	function titre(texte, niveau = 1, suite = 25) {
		besoin((niveau === 1 ? 22 : 14) + suite);
		y += niveau === 1 ? 6 : 3;
		doc.setFont("times", "bold");
		doc.setFontSize(niveau === 1 ? 14 : 12);
		doc.setTextColor(...PDF.nuit);
		doc.text(texte, PDF.marge + (niveau === 1 ? 0 : 4), y);
		if (niveau === 1) {
			doc.setFillColor(...PDF.orange);
			doc.rect(PDF.marge, y + 2, 18, 0.9, "F");
		}
		sommaire.push({ titre: texte, niveau, page: doc.getNumberOfPages() });
		y += niveau === 1 ? 9 : 7;
	}

	function paragraphe(texte) {
		doc.setFont("times", "normal");
		doc.setFontSize(11);
		doc.setTextColor(30);
		for (const ligne of doc.splitTextToSize(textePdf(texte), largeurUtile)) {
			besoin(6);
			doc.text(ligne, PDF.marge, y);
			y += 5.4;
		}
		y += 3;
	}

	/** Tableau simple : en-tete bleu nuit, lignes fines, saut de page avec en-tete repete. */
	function tableau(colonnes, lignes, largeurs) {
		const xs = [];
		largeurs.reduce((x, l) => (xs.push(x), x + l), PDF.marge);
		const entete = () => {
			doc.setFillColor(...PDF.nuit);
			doc.rect(PDF.marge, y, largeurUtile, 7, "F");
			doc.setFont("helvetica", "bold");
			doc.setFontSize(8);
			doc.setTextColor(255);
			colonnes.forEach((c, i) => doc.text(textePdf(c), xs[i] + 2, y + 4.8, { maxWidth: largeurs[i] - 3 }));
			y += 7;
			doc.setFont("helvetica", "normal");
		};
		besoin(7 + 6 * Math.min(lignes.length, 3));
		entete();
		for (const ligne of lignes) {
			if (y + 5.5 > PDF.basContenu) { nouvellePage(); entete(); }
			doc.setFontSize(8);
			doc.setTextColor(40);
			ligne.forEach((cell, i) => doc.text(textePdf(cell), xs[i] + 2, y + 4, { maxWidth: largeurs[i] - 3 }));
			y += 5.5;
			doc.setDrawColor(225);
			doc.setLineWidth(0.2);
			doc.line(PDF.marge, y, PDF.largeur - PDF.marge, y);
		}
		y += 5;
	}

	// ---- Page 2 : sommaire (rempli a la fin) puis introduction ----
	nouvellePage();
	const pageSommaire = doc.getNumberOfPages();
	const yIntro = 120; // place reservee au sommaire
	y = yIntro;

	titre("INTRODUCTION");
	paragraphe(
		`Ce rapport présente l'indicateur « ${indicateur.nom} » (${indicateur.unite}) de ${debut} à ${fin}, `
		+ `pour : ${nomsPays.join(", ")}. `
		+ (source === "import"
			? "Les données proviennent d'un fichier importé par l'utilisateur. "
			: source === "comparatif"
			? "Les séries importées par l'utilisateur sont comparées à celles des World Development Indicators de la Banque mondiale. "
			: "Les données sont celles des World Development Indicators de la Banque mondiale, importées telles quelles. ")
		+ `Les statistiques, la prévision et la détection de ruptures ont été calculées par ${calculePar === "serveur" ? "le serveur Python (FastAPI)" : "le navigateur (JavaScript)"} d'Horizon Ouest.`
	);

	// ---- I. Evolution ----
	const image = imageGraphique();
	const h = largeurUtile * 0.5;
	titre("I. ÉVOLUTION DE L'INDICATEUR", 1, 14 + (image ? h + 8 : 0));
	titre("1. Graphique", 2, image ? h + 8 : 0);
	if (image) {
		besoin(h + 8);
		doc.addImage(image, "PNG", PDF.marge, y, largeurUtile, h);
		y += h + 3;
		doc.setFont("times", "italic");
		doc.setFontSize(9);
		doc.setTextColor(90);
		doc.text(textePdf(`Figure 1 : ${indicateur.nom}, ${debut}-${fin}`), PDF.largeur / 2, y + 2, { align: "center" });
		y += 9;
	}
	if (commentaire) {
		titre("2. Lecture", 2);
		paragraphe(commentaire);
	}

	// ---- II. Comparaison ----
	titre("II. COMPARAISON ENTRE PAYS");
	titre("1. Chiffres clés", 2);
	const stats = new Map(isos.map(i => [i, calculerStats(annees, series.get(i), indicateur.format)]));
	tableau(
		["Pays", "Début", "Dernière valeur", "Évolution", "TCAM", "Moyenne"],
		isos.map(i => {
			const s = stats.get(i);
			if (!s) return [trouverPays(i).nom, "n.d.", "n.d.", "n.d.", "n.d.", "n.d."];
			return [
				trouverPays(i).nom,
				`${formaterValeur(s.vDebut, indicateur.format)} (${s.anneeDebut})`,
				`${formaterValeur(s.vFin, indicateur.format)} (${s.anneeFin})`,
				formaterVariation(s, indicateur.format),
				s.tcam === null ? "n.d." : (s.tcam >= 0 ? "+" : "") + s.tcam.toFixed(2).replace(".", ",") + " %",
				formaterValeur(s.moyenne, indicateur.format),
			];
		}),
		[34, 32, 34, 24, 20, 26]
	);

	let numero = 2;
	// Carte : seulement pour les donnees de la Banque mondiale, si elle est affichee dans l'application.
	if (source === "api" && typeof etatCarte !== "undefined" && etatCarte.donnees && etatCarte.annee) {
		const hCarte = 80;
		titre(`${numero++}. Carte de l'Afrique de l'Ouest en ${etatCarte.annee}`, 2, hCarte + 12);
		besoin(hCarte + 12);
		y += dessinerCartePdf(doc, PDF.marge, y, largeurUtile) + 2;
		doc.setFont("times", "italic");
		doc.setFontSize(9);
		doc.setTextColor(90);
		doc.text(textePdf(`Figure 2 : ${etatCarte.donnees.indicateur.nom} en ${etatCarte.annee}, 16 pays d'Afrique de l'Ouest`),
			PDF.largeur / 2, y + 2, { align: "center" });
		y += 8;
		paragraphe("Couleur plus foncée = valeur plus élevée. L'échelle couvre toute la période et les 16 pays, comme dans l'application. "
			+ "Un pays gris clair n'a pas de donnée cette année-là.");
	}
	if (previsions && previsions.size) {
		titre(`${numero++}. Prévision à 5 ans`, 2);
		const lignes = [];
		for (const [iso, p] of previsions) {
			lignes.push([trouverPays(iso).nom, `${formaterValeur(p.valeurs[p.valeurs.length - 1], indicateur.format)} en ${p.annees[p.annees.length - 1]}`, p.methode]);
		}
		tableau(["Pays", "Valeur prévue", "Méthode"], lignes, [34, 40, 96]);
		paragraphe("La prévision prolonge la tendance passée ; elle ne tient pas compte des politiques ou des chocs à venir.");
	}
	if (ruptures && ruptures.size) {
		titre(`${numero++}. Ruptures détectées`, 2);
		const lignes = [];
		for (const [iso, liste] of ruptures) {
			for (const r of liste) {
				const signe = r.variation >= 0 ? "+" : "";
				const unite = r.enTaux ? " %" : (indicateur.format.replace(/^\+/, "") === "pourcent" ? " pt" : "");
				lignes.push([trouverPays(iso).nom, String(r.annee), signe + r.variation.toFixed(1).replace(".", ",") + unite,
					r.score > 0 ? "hausse inhabituelle" : "baisse inhabituelle"]);
			}
		}
		tableau(["Pays", "Année", "Variation", "Sens"], lignes, [44, 26, 40, 60]);
		paragraphe("Une rupture est une variation annuelle plus de 3 fois supérieure à l'écart habituel autour de la tendance locale. Elle signale souvent une crise, une campagne ou un changement de méthode statistique.");
	}

	// ---- Conclusion : constats tires des chiffres, sans interpretation causale ----
	titre("CONCLUSION");
	const valides = isos.filter(i => stats.get(i));
	if (valides.length > 1) {
		const parFin = [...valides].sort((a, b) => stats.get(b).vFin - stats.get(a).vFin);
		const premier = parFin[0], dernier = parFin[parFin.length - 1];
		paragraphe(
			`À la dernière année disponible, la valeur la plus élevée revient à : ${trouverPays(premier).nom} `
			+ `(${formaterValeur(stats.get(premier).vFin, indicateur.format)}) ; la plus faible à : ${trouverPays(dernier).nom} `
			+ `(${formaterValeur(stats.get(dernier).vFin, indicateur.format)}). Selon l'indicateur, une valeur élevée peut être `
			+ "un progrès (accès à l'eau, scolarisation) ou un recul (mortalité) : la lecture doit en tenir compte."
		);
	}
	paragraphe(commentaire || "Les données disponibles sont trop peu nombreuses pour dégager une tendance.");

	// ---- Annexe ----
	nouvellePage();
	titre("ANNEXE : DONNÉES DÉTAILLÉES");
	const largeurAnnee = 18;
	const largeurPays = (largeurUtile - largeurAnnee) / isos.length;
	tableau(
		["Année", ...nomsPays],
		annees.map((a, k) => [String(a), ...isos.map(i => formaterValeur(series.get(i)[k], indicateur.format))]).reverse(),
		[largeurAnnee, ...isos.map(() => largeurPays)]
	);
	paragraphe("n.d. = donnée non disponible.");

	// ---- Sommaire (page 2), maintenant que les numeros de page sont connus ----
	doc.setPage(pageSommaire);
	doc.setFont("times", "bold");
	doc.setFontSize(18);
	doc.setTextColor(...PDF.nuit);
	doc.text("Sommaire", PDF.marge, 32);
	let ys = 44;
	for (const e of sommaire) {
		const x = PDF.marge + (e.niveau === 1 ? 0 : 6);
		const xPage = PDF.largeur - PDF.marge;
		doc.setFont("times", e.niveau === 1 ? "bold" : "normal");
		doc.setFontSize(e.niveau === 1 ? 11 : 10.5);
		doc.setTextColor(30);
		doc.text(e.titre, x, ys);
		doc.text(String(e.page), xPage, ys, { align: "right" });
		const debutPoints = x + doc.getTextWidth(e.titre) + 2;
		doc.setTextColor(150);
		doc.text(".".repeat(Math.max(0, Math.floor((xPage - 6 - debutPoints) / doc.getTextWidth(".")))), debutPoints, ys);
		ys += e.niveau === 1 ? 7.5 : 6.5;
	}
	console.assert(ys < yIntro, "Sommaire trop long pour la place réservée");

	piedsDePage(doc, source);
	doc.save(nomFichierSur(`Horizon-Ouest_rapport_${indicateur.code}_${debut}-${fin}.pdf`));
}
