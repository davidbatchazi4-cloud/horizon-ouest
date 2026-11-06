// menu.js : bouton « trois barres » en haut a gauche du bandeau, qui ouvre un tiroir de navigation.
// Le tiroir est un <dialog> modal : le navigateur gere le focus, la touche Echap et le fond grise.
// Utilise sur les deux pages ; la liste des indicateurs vient de config.js.

(function creerMenu() {
	const bandeau = document.querySelector(".bandeau");
	if (!bandeau) return;
	const surAccueil = Boolean(document.getElementById("tableau-de-bord"));
	const page = surAccueil ? "" : "index.html";

	const bouton = document.createElement("button");
	bouton.type = "button";
	bouton.className = "bouton-menu";
	bouton.setAttribute("aria-label", "Ouvrir le menu");
	bouton.setAttribute("aria-haspopup", "dialog");
	bouton.innerHTML = '<span aria-hidden="true"></span><span aria-hidden="true"></span><span aria-hidden="true"></span>';
	if (surAccueil) {
		bandeau.prepend(bouton);
	} else {
		// Pages secondaires : retour a l'accueil bien visible, a cote du menu.
		const gauche = document.createElement("div");
		gauche.className = "bandeau__gauche";
		const accueil = document.createElement("a");
		accueil.href = "index.html";
		accueil.className = "bouton-accueil bouton-accueil--bandeau";
		accueil.innerHTML = '<svg class="fleche" aria-hidden="true" viewBox="0 0 16 16" width="16" height="16"><path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Accueil</span>';
		gauche.append(bouton, accueil);
		bandeau.prepend(gauche);
	}

	const tiroir = document.createElement("dialog");
	tiroir.className = "tiroir";
	tiroir.setAttribute("aria-label", "Menu");
	tiroir.innerHTML = `
		<div class="tiroir__entete">
			<span class="tiroir__titre">Horizon Ouest</span>
			<button type="button" class="tiroir__fermer" aria-label="Fermer le menu">×</button>
		</div>
		<nav class="tiroir__nav" aria-label="Menu">
			<p class="tiroir__rubrique">Explorer</p>
			<a href="${page || "index.html"}#">Accueil</a>
			<a href="${page}#tableau-de-bord">Comparer les pays</a>
			<a href="pays.html">Fiches pays</a>
			<a href="trajectoires.html">Trajectoires animées</a>
			<p class="tiroir__rubrique">Thèmes</p>
			<div class="tiroir__themes"></div>
			<p class="tiroir__rubrique">Le projet</p>
			<a href="equipe.html">Nous contacter</a>
		</nav>`;
	document.body.appendChild(tiroir);

	// Indicateurs par theme : un lien ouvre directement le graphique (parametre « i » du lien partageable).
	const themes = tiroir.querySelector(".tiroir__themes");
	for (const groupe of INDICATEURS) {
		const details = document.createElement("details");
		const resume = document.createElement("summary");
		resume.textContent = groupe.theme;
		details.appendChild(resume);
		const ensemble = document.createElement("a");
		ensemble.href = `theme.html?t=${slugTheme(groupe.theme)}`;
		ensemble.className = "tiroir__ensemble";
		ensemble.textContent = "Vue d'ensemble du thème";
		details.appendChild(ensemble);
		for (const serie of groupe.series) {
			const a = document.createElement("a");
			a.href = `index.html?i=${encodeURIComponent(serie.code)}`;
			a.textContent = serie.nom;
			details.appendChild(a);
		}
		themes.appendChild(details);
	}

	// Page en cours : meme fichier ; sur l'accueil, meme ancre ; sur les themes, meme theme.
	const marquerCourant = () => {
		const ici = new URLSearchParams(location.search);
		for (const a of tiroir.querySelectorAll("a")) {
			const cible = new URL(a.href, location.href);
			let courant = cible.pathname === location.pathname;
			if (courant && surAccueil) courant = !cible.search && (cible.hash || "#") === (location.hash || "#");
			if (courant && cible.searchParams.has("t")) courant = cible.searchParams.get("t") === (ici.get("t") || slugTheme(INDICATEURS[0].theme));
			if (courant && cible.searchParams.has("i")) courant = false; // liens d'indicateurs : jamais « en cours »
			if (courant) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
		}
	};

	// Clic (ou clavier, ou ecran tactile) : tiroir modal, avec fond grise et focus piege.
	bouton.addEventListener("click", () => {
		if (tiroir.open) tiroir.close(); // deja ouvert au survol : on le reouvre en modal
		marquerCourant();
		tiroir.showModal();
	});
	tiroir.querySelector(".tiroir__fermer").addEventListener("click", () => tiroir.close());
	// Clic sur le fond grise (hors du panneau) : on ferme.
	tiroir.addEventListener("click", (e) => { if (e.target === tiroir) tiroir.close(); });
	// Lien vers une ancre de la meme page : pas de rechargement, il faut fermer soi-meme.
	tiroir.addEventListener("click", (e) => { if (e.target.closest("a")) tiroir.close(); });
	tiroir.addEventListener("close", () => {
		if (tiroir.classList.contains("tiroir--survol")) tiroir.classList.remove("tiroir--survol");
		else bouton.focus(); // apres une ouverture au survol, on ne deplace pas le focus
	});

	// Souris : le tiroir s'ouvre quand on survole le bouton ou le bord gauche de la fenetre,
	// et se referme quand la souris le quitte. Sans modal : la page reste utilisable.
	// Rien sur ecran tactile (pas de survol) : le clic suffit.
	if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
	const bord = document.createElement("div");
	bord.className = "tiroir-bord";
	bord.setAttribute("aria-hidden", "true");
	document.body.appendChild(bord);

	let minuterie = null;
	const plusTard = (action, ms) => { clearTimeout(minuterie); minuterie = setTimeout(action, ms); };
	const ouvrirAuSurvol = () => plusTard(() => {
		if (tiroir.open) return;
		marquerCourant();
		tiroir.classList.add("tiroir--survol");
		const avant = document.activeElement;
		tiroir.show(); // show() donne le focus au tiroir : au survol, on le laisse ou il etait
		if (avant && avant !== document.body) avant.focus({ preventScroll: true });
		else document.activeElement.blur();
	}, 150); // court delai : un simple passage de la souris n'ouvre rien
	const fermerAuSurvol = () => plusTard(() => {
		if (tiroir.classList.contains("tiroir--survol") && !tiroir.matches(":hover")) tiroir.close();
	}, 300);

	for (const zone of [bouton, bord]) {
		zone.addEventListener("mouseenter", ouvrirAuSurvol);
		zone.addEventListener("mouseleave", fermerAuSurvol);
	}
	tiroir.addEventListener("mouseenter", () => clearTimeout(minuterie));
	tiroir.addEventListener("mouseleave", fermerAuSurvol);
})();
