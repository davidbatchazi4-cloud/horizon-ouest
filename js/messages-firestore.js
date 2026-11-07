// messages-firestore.js : envoi et lecture des messages dans Firestore (Firebase), depuis le navigateur.
// Utilise par « Nous contacter » (envoi) et par l'espace administrateur (lecture, apres connexion).
// Fonctionne meme sur un hebergement sans serveur (GitHub Pages) : la base est chez Google.

const MessagesFirestore = (() => {
	const COLLECTION = "messages";
	const actif = typeof FIREBASE_CONFIG === "object" && FIREBASE_CONFIG !== null && typeof firebase !== "undefined";
	let pret = false;

	function initialiser() {
		if (!actif) throw new Error("Firestore n'est pas configuré.");
		if (!pret) { firebase.initializeApp(FIREBASE_CONFIG); pret = true; }
		return firebase.firestore().collection(COLLECTION);
	}

	/** Enregistre un message. Les regles Firestore verifient les memes limites que le formulaire. */
	async function envoyer({ nom = "", email = "", message }) {
		await initialiser().add({
			nom: nom.trim().slice(0, 80),
			email: email.trim().slice(0, 120),
			message: message.trim().slice(0, 2000),
			lu: false,
			date: firebase.firestore.FieldValue.serverTimestamp(), // heure du serveur Google, pas du visiteur
		});
	}

	async function connexion(email, motDePasse) {
		initialiser();
		await firebase.auth().signInWithEmailAndPassword(email, motDePasse);
	}

	function deconnexion() {
		initialiser();
		return firebase.auth().signOut();
	}

	/** Appelle rappel(utilisateur ou null) a chaque changement de connexion (y compris au chargement). */
	function surConnexion(rappel) {
		initialiser();
		firebase.auth().onAuthStateChanged(rappel);
	}

	/** Messages du plus recent au plus ancien, au format de l'espace administrateur. */
	async function lister() {
		const instantane = await initialiser().orderBy("date", "desc").get();
		return instantane.docs.map((doc) => {
			const d = doc.data();
			return { id: doc.id, nom: d.nom, email: d.email, message: d.message, lu: d.lu === true,
				date: d.date ? d.date.toDate().toISOString() : "" };
		});
	}

	const marquer = (id, lu) => initialiser().doc(id).update({ lu });
	const supprimer = (id) => initialiser().doc(id).delete();

	/** Message d'erreur Firebase en francais. */
	function expliquer(erreur) {
		const code = erreur && erreur.code ? erreur.code : "";
		if (/invalid-credential|wrong-password|user-not-found|invalid-email/.test(code)) return "E-mail ou mot de passe incorrect.";
		if (code.includes("too-many-requests")) return "Trop d'essais : réessayez dans quelques minutes.";
		if (code.includes("permission-denied")) return "Accès refusé : ce compte n'est pas administrateur.";
		if (code.includes("unavailable") || code.includes("network")) return "Connexion à Firebase impossible : vérifiez Internet.";
		if (code.includes("unauthorized-domain")) return "Ce site n'est pas autorisé dans Firebase (Authentication, domaines autorisés).";
		return "Erreur Firebase" + (code ? ` (${code})` : "") + ".";
	}

	return { actif, envoyer, connexion, deconnexion, surConnexion, lister, marquer, supprimer, expliquer };
})();
