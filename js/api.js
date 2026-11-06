// api.js : acces a l'API de la Banque mondiale, avec cache local.
//
// ATTENTION : l'API repond HTTP 200 meme quand la requete est invalide.
// Le corps vaut alors [{ message: [...] }] au lieu de [meta, observations].
// Tester response.ok ne suffit donc pas : on inspecte la reponse elle-meme.

const BASE_API = "https://api.worldbank.org/v2/country";
const PREFIXE_CACHE = "bm_cache_";
const DUREE_CACHE_MS = 24 * 60 * 60 * 1000; // 24 h
const DELAI_MAX_MS = 15000;     // par tentative ; au-dela, on abandonne la tentative
const NB_TENTATIVES = 2;        // l'API a des ralentissements passagers : on reessaie une fois
const PAUSE_TENTATIVES_MS = 1000;

class ErreurApi extends Error {
	constructor(message, cause) {
		super(message);
		this.name = "ErreurApi";
		this.cause = cause;
	}
}

function cleCache(codesPays, indicateur, debut, fin) {
	return `${PREFIXE_CACHE}${[...codesPays].sort().join("-")}_${indicateur}_${debut}_${fin}`;
}

function lireCache(cle) {
	try {
		const brut = localStorage.getItem(cle);
		if (!brut) return null;
		const { date, donnees } = JSON.parse(brut);
		if (Date.now() - date > DUREE_CACHE_MS) {
			localStorage.removeItem(cle);
			return null;
		}
		return donnees;
	} catch {
		return null; // cache illisible : on refait la requete
	}
}

function ecrireCache(cle, donnees) {
	try {
		localStorage.setItem(cle, JSON.stringify({ date: Date.now(), donnees }));
	} catch {
		// quota depasse : on purge nos propres entrees et on abandonne le cache
		viderCache();
	}
}

function viderCache() {
	for (const cle of Object.keys(localStorage)) {
		if (cle.startsWith(PREFIXE_CACHE)) localStorage.removeItem(cle);
	}
}

function tailleCache() {
	return Object.keys(localStorage).filter(c => c.startsWith(PREFIXE_CACHE)).length;
}

/**
 * Recupere une serie pour un ou plusieurs pays.
 * @returns {Promise<Array>} les observations brutes de l'API (ordre non garanti)
 */
async function chargerIndicateur(codesPays, indicateur, debut, fin) {
	const cle = cleCache(codesPays, indicateur, debut, fin);
	const enCache = lireCache(cle);
	if (enCache) return enCache;

	const url = `${BASE_API}/${codesPays.join(";")}/indicator/${indicateur}`
		+ `?format=json&date=${debut}:${fin}&per_page=20000`;

	// Lenteur, coupure reseau ou erreur 5xx : souvent passager, on reessaie une fois
	// avant d'afficher l'erreur. Une requete refusee (4xx) n'est jamais reessayee.
	let corps;
	for (let tentative = 1; ; tentative++) {
		try {
			corps = await telechargerJson(url);
			break;
		} catch (erreur) {
			if (!erreur.reessayable || tentative >= NB_TENTATIVES) throw erreur;
			console.warn(`API de la Banque mondiale : tentative ${tentative} échouée, nouvel essai.`, erreur);
			await new Promise(r => setTimeout(r, PAUSE_TENTATIVES_MS));
		}
	}

	// Cas d'erreur applicative : [{ message: [{ value: "..." }] }]
	if (!Array.isArray(corps)) {
		throw new ErreurApi("Réponse inattendue de l'API.");
	}
	if (corps[0] && corps[0].message) {
		const detail = corps[0].message[0]?.value || "paramètre refusé par l'API";
		throw new ErreurApi(`Requête refusée : ${detail}`);
	}

	const observations = corps[1];
	if (!Array.isArray(observations) || observations.length === 0) {
		return []; // requete valide, mais aucune observation : cas "aucune donnee"
	}

	ecrireCache(cle, observations);
	return observations;
}

/**
 * Une tentative de telechargement. Les erreurs passageres sont marquees
 * « reessayable » pour que l'appelant puisse recommencer.
 */
async function telechargerJson(url) {
	// Sans delai maximal, une requete qui ne repond jamais laisserait l'interface
	// bloquee indefiniment sur « Chargement… ».
	const controleur = new AbortController();
	const minuterie = setTimeout(() => controleur.abort(), DELAI_MAX_MS);
	const echec = (message, reessayable, cause) =>
		Object.assign(new ErreurApi(message, cause), { reessayable });

	try {
		const reponse = await fetch(url, { signal: controleur.signal });
		if (!reponse.ok) {
			throw echec(`L'API a répondu avec le code HTTP ${reponse.status}.`,
				reponse.status >= 500 || reponse.status === 429);
		}
		try {
			return await reponse.json();
		} catch (erreur) {
			if (erreur.name === "AbortError") throw erreur;
			throw echec("La réponse de l'API n'est pas du JSON exploitable.", true, erreur);
		}
	} catch (erreur) {
		if (erreur instanceof ErreurApi) throw erreur;
		if (erreur.name === "AbortError") {
			throw echec(
				`L'API de la Banque mondiale n'a pas répondu (${NB_TENTATIVES} essais de ${DELAI_MAX_MS / 1000} secondes). `
				+ "Elle connaît parfois des ralentissements : réessayez dans un instant.", true, erreur);
		}
		throw echec("Impossible de joindre l'API. Vérifiez votre connexion Internet.", true, erreur);
	} finally {
		clearTimeout(minuterie);
	}
}

/* ===================== Serveur FastAPI (facultatif) ===================== */
//
// Quand le site est servi par le serveur Python (backend/main.py), les calculs
// sont confies a l'API /api/analyse. Sinon (fichier ouvert directement, ou simple
// serveur de fichiers), tout est calcule dans le navigateur, comme avant.

const DELAI_DETECTION_MS = 1500;
let promesseServeur = null;

class ServeurIndisponible extends Error {
	constructor(cause) {
		super("Le serveur Python ne répond pas.");
		this.name = "ServeurIndisponible";
		this.cause = cause;
	}
}

/** Vrai si le serveur FastAPI repond. Le resultat est memorise. */
function serveurDisponible() {
	if (!promesseServeur) {
		promesseServeur = (async () => {
			if (!location.protocol.startsWith("http")) return false; // fichier ouvert directement
			const controleur = new AbortController();
			const minuterie = setTimeout(() => controleur.abort(), DELAI_DETECTION_MS);
			try {
				const reponse = await fetch("api/sante", { signal: controleur.signal, cache: "no-store" });
				if (!reponse.ok) return false;
				const corps = await reponse.json();
				return corps && corps.statut === "ok";
			} catch {
				return false;
			} finally {
				clearTimeout(minuterie);
			}
		})();
	}
	return promesseServeur;
}

/** Le serveur est tombe en cours de route : on repasse en calcul local. */
function oublierServeur() {
	promesseServeur = Promise.resolve(false);
}

/**
 * Analyse complete calculee par le serveur : series transformees, statistiques,
 * prevision et ruptures.
 * @throws {ErreurApi} erreur expliquee par le serveur (Banque mondiale injoignable, parametre refuse)
 * @throws {ServeurIndisponible} le serveur ne repond plus
 */
async function chargerAnalyse({ indicateur, pays, debut, fin, mode, prevision, ruptures }) {
	const params = new URLSearchParams({
		indicateur, pays: pays.join(","), debut, fin, mode,
		prevision: String(prevision), ruptures: String(ruptures),
	});

	const controleur = new AbortController();
	// Le serveur peut lui-meme attendre la Banque mondiale (avec un second essai).
	const attenteServeur = NB_TENTATIVES * DELAI_MAX_MS + PAUSE_TENTATIVES_MS + 5000;
	const minuterie = setTimeout(() => controleur.abort(), attenteServeur);
	let reponse;
	try {
		reponse = await fetch(`api/analyse?${params}`, { signal: controleur.signal });
	} catch (erreur) {
		throw new ServeurIndisponible(erreur);
	} finally {
		clearTimeout(minuterie);
	}

	let corps = null;
	try { corps = await reponse.json(); } catch { /* corps vide ou illisible */ }
	if (!reponse.ok) {
		const detail = corps && typeof corps.detail === "string" ? corps.detail : `code HTTP ${reponse.status}`;
		throw new ErreurApi(detail);
	}
	if (!corps || !Array.isArray(corps.annees) || typeof corps.series !== "object") {
		throw new ErreurApi("Réponse inattendue du serveur Python.");
	}
	return corps;
}
