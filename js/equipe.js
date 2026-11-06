// equipe.js : page « Nous contacter » : theme clair/sombre, photos des membres, envoi du message.
// Volontairement independant de main.js, qui pilote le formulaire du tableau de bord.

const CLE_THEME = "bm_theme"; // meme cle que main.js : le theme choisi suit d'une page a l'autre

function themeInitial() {
	let theme = null;
	try { theme = localStorage.getItem(CLE_THEME); } catch { /* ignore */ }
	if (theme === "clair" || theme === "sombre") return theme;
	return window.matchMedia("(prefers-color-scheme: dark)").matches ? "sombre" : "clair";
}

function brancherTheme() {
	document.getElementById("bascule-theme").addEventListener("click", () => {
		const actuel = document.documentElement.getAttribute("data-theme");
		const suivant = actuel === "sombre" ? "clair" : "sombre";
		document.documentElement.setAttribute("data-theme", suivant);
		try { localStorage.setItem(CLE_THEME, suivant); } catch { /* ignore */ }
	});
}

/* ===================== Section equipe ===================== */

/**
 * Tant qu'une photo n'est pas fournie (fichier absent dans images/), on affiche
 * un rond avec les initiales au lieu d'une image cassee.
 * L'image peut avoir echoue AVANT l'execution de ce script : on teste donc aussi
 * son etat courant, en plus d'ecouter l'evenement « error ».
 */
function preparerPhotosEquipe() {
	for (const img of document.querySelectorAll(".membre__photo")) {
		const remplacer = () => {
			const rond = document.createElement("div");
			rond.className = "membre__initiales";
			rond.textContent = img.dataset.initiales || "?";
			rond.setAttribute("role", "img");
			rond.setAttribute("aria-label", img.alt);
			img.replaceWith(rond);
		};
		if (img.complete && img.naturalWidth === 0) remplacer();
		else img.addEventListener("error", remplacer, { once: true });
	}
}

/* ===================== Suggestions ===================== */

/** Envoie le formulaire a POST /api/suggestions ; sans serveur, propose l'e-mail. */
function brancherSuggestions() {
	const form = document.getElementById("form-suggestion");
	const retour = document.getElementById("retour-suggestion");
	// Compteur de caracteres : previent avant d'atteindre la limite de 2000.
	const compteur = document.getElementById("compteur-message");
	const majCompteur = () => {
		const n = form.message.value.length;
		compteur.textContent = `${n} / 2000`;
		compteur.classList.toggle("suggestions__compteur--proche", n > 1800);
	};
	form.message.addEventListener("input", majCompteur);
	form.addEventListener("reset", () => setTimeout(majCompteur));
	form.addEventListener("submit", async (e) => {
		e.preventDefault();
		const donnees = Object.fromEntries(new FormData(form));
		if (donnees.message.trim().length < 5) {
			retour.textContent = "Écrivez au moins quelques mots.";
			form.message.focus();
			return;
		}
		const bouton = form.querySelector("button");
		bouton.disabled = true;
		delete form.dataset.etat;
		try {
			const r = await fetch("/api/suggestions", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(donnees),
			});
			// 404 / 405 : pas de serveur Python derriere le site (hebergement statique, ex. GitHub Pages).
			if (r.status === 404 || r.status === 405) throw new TypeError("pas de serveur");
			if (!r.ok) throw new Error(r.status);
			form.reset();
			form.dataset.etat = "envoye";
			retour.textContent = "Merci, votre message est bien arrivé. Nous vous répondrons si vous avez laissé votre e-mail.";
		} catch (erreur) {
			if (erreur instanceof TypeError) {
				// Sans serveur, le message n'est pas perdu : la messagerie s'ouvre avec le texte deja ecrit.
				ouvrirMessagerie(donnees);
				form.dataset.etat = "envoye";
				retour.textContent = "Cette version du site n'enregistre pas les messages : votre messagerie s'ouvre avec le message prêt à envoyer.";
			} else {
				form.dataset.etat = "erreur";
				retour.textContent = "Envoi impossible pour le moment. Écrivez-nous par e-mail, avec les adresses en haut de la page.";
			}
		} finally {
			bouton.disabled = false;
		}
	});
}

/** Prepare un e-mail aux deux membres avec le contenu du formulaire (nom et e-mail en signature). */
function ouvrirMessagerie({ nom, email, message }) {
	const destinataires = [...document.querySelectorAll(".contact__adresse")].map(a => a.href.replace(/^mailto:/, ""));
	const signature = [nom, email].filter(Boolean).join(" · ");
	const corps = message + (signature ? `\n\n${signature}` : "");
	location.href = `mailto:${destinataires.join(",")}?subject=${encodeURIComponent("Message depuis Horizon Ouest")}`
		+ `&body=${encodeURIComponent(corps)}`;
}

document.documentElement.setAttribute("data-theme", themeInitial());
document.addEventListener("DOMContentLoaded", () => {
	brancherTheme();
	preparerPhotosEquipe();
	brancherSuggestions();
});
