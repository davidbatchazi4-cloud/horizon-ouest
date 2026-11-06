// favoris.js : vues enregistrees par l'utilisateur (indicateur, periode, pays, options).
// Stockees dans localStorage : elles restent propres a ce navigateur.

const CLE_FAVORIS = "bm_favoris";
const MAX_FAVORIS = 20;

function lireFavoris() {
	try {
		const liste = JSON.parse(localStorage.getItem(CLE_FAVORIS));
		return Array.isArray(liste) ? liste : [];
	} catch {
		return [];
	}
}

function ecrireFavoris(liste) {
	try {
		localStorage.setItem(CLE_FAVORIS, JSON.stringify(liste));
		return true;
	} catch {
		return false;
	}
}

/** Nom lisible genere a partir du choix : « Espérance de vie · 2000-2024 · CIV, GHA ». */
function nommerFavori(choix) {
	const indicateur = trouverIndicateur(choix.indicateur);
	let nom = `${indicateur ? indicateur.nom : choix.indicateur} · ${choix.debut}-${choix.fin} · ${choix.pays.join(", ")}`;
	if (choix.mode && choix.mode !== "brut") nom += ` · ${choix.mode === "base100" ? "base 100" : "écart SSF"}`;
	return nom;
}

/**
 * Ajoute un favori. Refuse les doublons exacts et limite la liste a MAX_FAVORIS.
 * @returns {{ok: boolean, message: string}}
 */
function ajouterFavori(choix) {
	const liste = lireFavoris();
	const signature = JSON.stringify(choix);
	if (liste.some(f => JSON.stringify(f.choix) === signature)) {
		return { ok: false, message: "Cette vue est déjà dans vos favoris." };
	}
	if (liste.length >= MAX_FAVORIS) {
		return { ok: false, message: `Maximum ${MAX_FAVORIS} favoris : supprimez-en un d'abord.` };
	}
	liste.push({ id: Date.now().toString(36), nom: nommerFavori(choix), choix });
	return ecrireFavoris(liste)
		? { ok: true, message: "Vue ajoutée aux favoris." }
		: { ok: false, message: "Enregistrement impossible (stockage du navigateur indisponible)." };
}

function supprimerFavori(id) {
	ecrireFavoris(lireFavoris().filter(f => f.id !== id));
}
