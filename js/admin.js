// admin.js : espace administrateur (admin.html) : lire, marquer lus et supprimer les messages.
// Tout passe par l'API du serveur Python, protegee par mot de passe. Le mot de passe saisi reste
// en memoire de l'onglet (sessionStorage) : il disparait a la fermeture de l'onglet.

const CLE_SESSION_ADMIN = "ho_admin";
const elAdmin = {
	connexion:   document.getElementById("admin-connexion"),
	mdp:         document.getElementById("admin-mdp"),
	erreur:      document.getElementById("admin-erreur"),
	messages:    document.getElementById("admin-messages"),
	liste:       document.getElementById("admin-liste"),
	vide:        document.getElementById("admin-vide"),
	compte:      document.getElementById("admin-compte"),
	recherche:   document.getElementById("admin-recherche"),
	actualiser:  document.getElementById("admin-actualiser"),
	deconnexion: document.getElementById("admin-deconnexion"),
};
const etatAdmin = { suggestions: [], filtre: "tous" };

const lireSession = () => { try { return sessionStorage.getItem(CLE_SESSION_ADMIN) || ""; } catch { return ""; } };
const ecrireSession = (v) => { try { v ? sessionStorage.setItem(CLE_SESSION_ADMIN, v) : sessionStorage.removeItem(CLE_SESSION_ADMIN); } catch { /* ignore */ } };

class ErreurAdmin extends Error {}

/** Appel a l'API d'administration ; 401 = mot de passe refuse. */
async function appelAdmin(chemin, options = {}) {
	if (!location.protocol.startsWith("http")) {
		throw new ErreurAdmin("Cette page a besoin du serveur : lancez le site avec lancer.bat, puis ouvrez http://127.0.0.1:8000/admin.html.");
	}
	let reponse;
	try {
		reponse = await fetch(chemin, {
			...options,
			headers: { "Content-Type": "application/json", Authorization: `Bearer ${lireSession()}`, ...(options.headers || {}) },
		});
	} catch {
		throw new ErreurAdmin("Le serveur ne répond pas. Vérifiez que lancer.bat est toujours ouvert.");
	}
	if (reponse.status === 401) {
		ecrireSession("");
		afficherConnexion("Mot de passe incorrect.");
		throw new ErreurAdmin("Mot de passe incorrect.");
	}
	if (reponse.status === 404 || reponse.status === 405) {
		throw new ErreurAdmin("Cette version du site n'a pas de serveur (hébergement statique) : l'espace administrateur "
			+ "ne fonctionne qu'avec la version serveur (IIS ou lancer.bat).");
	}
	const corps = await reponse.json().catch(() => null);
	if (!reponse.ok) throw new ErreurAdmin(corps?.detail || `Erreur du serveur (code ${reponse.status}).`);
	return corps;
}

function afficherConnexion(message = "") {
	elAdmin.connexion.hidden = false;
	elAdmin.messages.hidden = true;
	elAdmin.deconnexion.hidden = true;
	elAdmin.erreur.textContent = message;
	elAdmin.mdp.value = "";
	elAdmin.mdp.focus();
}

async function charger() {
	elAdmin.actualiser.disabled = true;
	try {
		const r = await appelAdmin("/api/admin/suggestions");
		etatAdmin.suggestions = r.suggestions;
		elAdmin.connexion.hidden = true;
		elAdmin.messages.hidden = false;
		elAdmin.deconnexion.hidden = false;
		afficherListe();
	} catch (erreur) {
		if (!(erreur instanceof ErreurAdmin)) throw erreur;
		if (elAdmin.messages.hidden) elAdmin.erreur.textContent = erreur.message;
		else elAdmin.compte.textContent = erreur.message;
	} finally {
		elAdmin.actualiser.disabled = false;
	}
}

const dateLisible = (iso) => {
	const d = new Date(iso);
	return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" });
};

function afficherListe() {
	const { suggestions, filtre } = etatAdmin;
	const nonLus = suggestions.filter(s => !s.lu).length;
	elAdmin.compte.innerHTML = `<strong>${suggestions.length}</strong> message${suggestions.length > 1 ? "s" : ""}`
		+ (nonLus ? ` · <span class="admin__non-lus">${nonLus} non lu${nonLus > 1 ? "s" : ""}</span>` : "");

	const terme = elAdmin.recherche.value.trim().toLowerCase();
	const visibles = suggestions.filter(s => (filtre === "tous" || !s.lu)
		&& (!terme || [s.nom, s.email, s.message].some(t => (t || "").toLowerCase().includes(terme))));

	elAdmin.liste.textContent = "";
	elAdmin.vide.hidden = visibles.length > 0;
	elAdmin.vide.textContent = !suggestions.length ? "Aucun message pour l'instant."
		: terme ? "Aucun message ne correspond à la recherche." : "Tous les messages sont lus.";

	visibles.forEach((s, i) => {
		const li = document.createElement("li");
		li.className = "admin__message" + (s.lu ? "" : " admin__message--nouveau");
		li.style.setProperty("--i", Math.min(i, 10));
		li.innerHTML = `
			<div class="admin__message-entete">
				<span class="admin__auteur"></span>
				<span class="admin__date"></span>
			</div>
			<p class="admin__texte"></p>
			<div class="admin__actions">
				<a class="admin__repondre"></a>
				<button type="button" class="admin__lu"></button>
				<button type="button" class="admin__supprimer">Supprimer</button>
			</div>`;
		// textContent partout : un message ne peut pas injecter de HTML dans la page.
		const auteur = li.querySelector(".admin__auteur");
		auteur.textContent = s.nom || "Anonyme";
		if (s.email) {
			const mail = document.createElement("span");
			mail.className = "admin__email";
			mail.textContent = s.email;
			auteur.append(" ", mail);
		}
		li.querySelector(".admin__date").textContent = dateLisible(s.date);
		li.querySelector(".admin__texte").textContent = s.message;

		const repondre = li.querySelector(".admin__repondre");
		if (s.email) {
			repondre.href = `mailto:${encodeURIComponent(s.email)}?subject=${encodeURIComponent("Votre message à Horizon Ouest")}`;
			repondre.textContent = "Répondre par e-mail";
		} else {
			repondre.remove();
		}

		const boutonLu = li.querySelector(".admin__lu");
		boutonLu.textContent = s.lu ? "Marquer non lu" : "Marquer comme lu";
		boutonLu.addEventListener("click", () => changerLu(s, !s.lu));

		// Suppression en deux temps, sans fenetre du navigateur : le bouton demande confirmation.
		const supprimer = li.querySelector(".admin__supprimer");
		let minuterie = null;
		supprimer.addEventListener("click", async () => {
			if (!supprimer.classList.contains("admin__supprimer--confirmer")) {
				supprimer.classList.add("admin__supprimer--confirmer");
				supprimer.textContent = "Confirmer la suppression";
				minuterie = setTimeout(() => {
					supprimer.classList.remove("admin__supprimer--confirmer");
					supprimer.textContent = "Supprimer";
				}, 4000);
				return;
			}
			clearTimeout(minuterie);
			supprimer.disabled = true;
			try {
				await appelAdmin(`/api/admin/suggestions/${encodeURIComponent(s.id)}`, { method: "DELETE" });
				etatAdmin.suggestions = etatAdmin.suggestions.filter(x => x.id !== s.id);
				afficherListe();
			} catch (erreur) {
				if (!(erreur instanceof ErreurAdmin)) throw erreur;
				elAdmin.compte.textContent = erreur.message;
				supprimer.disabled = false;
			}
		});
		elAdmin.liste.appendChild(li);
	});
}

async function changerLu(s, lu) {
	try {
		const maj = await appelAdmin(`/api/admin/suggestions/${encodeURIComponent(s.id)}`, {
			method: "PATCH", body: JSON.stringify({ lu }),
		});
		s.lu = maj.lu;
		afficherListe();
	} catch (erreur) {
		if (!(erreur instanceof ErreurAdmin)) throw erreur;
		elAdmin.compte.textContent = erreur.message;
	}
}

(function demarrer() {
	brancherThemePage();
	elAdmin.connexion.addEventListener("submit", (e) => {
		e.preventDefault();
		const mdp = elAdmin.mdp.value.trim();
		if (!mdp) { elAdmin.erreur.textContent = "Saisissez le mot de passe."; return; }
		elAdmin.erreur.textContent = "";
		ecrireSession(mdp);
		charger();
	});
	elAdmin.deconnexion.addEventListener("click", () => { ecrireSession(""); afficherConnexion(); });
	elAdmin.actualiser.addEventListener("click", charger);
	elAdmin.recherche.addEventListener("input", afficherListe);
	for (const bouton of document.querySelectorAll(".admin__filtre .bascule__option")) {
		bouton.addEventListener("click", () => {
			etatAdmin.filtre = bouton.dataset.filtre;
			for (const b of document.querySelectorAll(".admin__filtre .bascule__option")) {
				b.classList.toggle("actif", b === bouton);
				b.setAttribute("aria-pressed", String(b === bouton));
			}
			afficherListe();
		});
	}
	if (!location.protocol.startsWith("http")) {
		elAdmin.erreur.textContent = "Cette page a besoin du serveur : lancez le site avec lancer.bat, puis ouvrez http://127.0.0.1:8000/admin.html.";
	} else if (lireSession()) {
		charger(); // deja connecte dans cet onglet
	}
})();
