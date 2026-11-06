// carrousel.js : photos des monuments des 16 pays en fond de l'en-tete (page d'accueil).
// Photos (1600 px) dans images/monuments/<code ISO3>.jpg (ou <ISO3>-<n>.jpg pour les suivantes) ; une photo absente est retiree.

// Photos : Wikimedia Commons, reechantillonnees a 1600 px ; credit affiche sous chaque photo.
const MONUMENTS = [
	{ iso3: "CIV", monument: "Basilique Notre-Dame-de-la-Paix, Yamoussoukro", credit: "Jcaseru, CC BY-SA 4.0" },
	{ iso3: "BEN", monument: "Porte du Non-Retour, Ouidah", credit: "Francisco Anzola, CC BY 2.0" },
	{ iso3: "BFA", monument: "Grande mosquée de Bobo-Dioulasso", credit: "qiv, CC BY-SA 2.0" },
	{ iso3: "CPV", monument: "Rua da Banana, Cidade Velha", credit: "Xandu, domaine public" },
	{ iso3: "GMB", monument: "Arch 22, Banjul", credit: "Atamari, CC BY-SA 3.0" },
	{ iso3: "GHA", monument: "Château de Cape Coast", credit: "Rjruiziii, CC BY-SA 3.0" },
	{ iso3: "GIN", monument: "Mosquée Fayçal, Conakry", credit: "Ourysow92, CC BY-SA 4.0" },
	{ iso3: "GNB", monument: "Fort de Cacheu", credit: "Jcornelius, CC BY-SA 4.0" },
	{ iso3: "LBR", monument: "Executive Mansion, Monrovia", credit: "Wikimedia Commons, domaine public" },
	{ iso3: "MLI", monument: "Grande mosquée de Djenné", credit: "Andy Gilham, CC BY-SA 3.0" },
	{ iso3: "MRT", monument: "Mosquée de Chinguetti", credit: "Mohamed Natti, CC BY-SA 4.0" },
	{ iso3: "NER", monument: "Grande mosquée d'Agadez", credit: "Vincent van Zeijst, CC BY-SA 4.0" },
	{ iso3: "NGA", monument: "Théâtre national, Lagos", credit: "Godiva Omoruyi, CC BY-SA 4.0" },
	{ iso3: "SEN", monument: "Monument de la Renaissance africaine, Dakar", credit: "Jeff Attaway, CC BY 2.0" },
	{ iso3: "SLE", monument: "Cotton Tree, Freetown", credit: "Christian Trede, CC BY-SA 2.0 DE" },
	{ iso3: "TGO", monument: "Monument de l'Indépendance, Lomé", credit: "twohundred 2010, CC BY-SA 2.0" },
	// Photos supplementaires : plusieurs par pays, fichier <ISO3>-<n>.jpg ; apres le premier tour des 16 pays.
	{ iso3: "BEN", fichier: "BEN-2", monument: "Statue de l'Amazone, Cotonou", cadrage: "center 12%", credit: "Alfrednadjere, CC BY-SA 4.0" },
	{ iso3: "SEN", fichier: "SEN-2", monument: "Île de Gorée", credit: "Focale Emotions, CC BY-SA 4.0" },
	{ iso3: "CIV", fichier: "CIV-2", monument: "Cathédrale Saint-Paul, Abidjan", credit: "Edison McCullen, CC BY 4.0" },
	{ iso3: "GHA", fichier: "GHA-2", monument: "Mausolée Kwame Nkrumah, Accra", credit: "Simon Ontoyin, CC BY-SA 3.0" },
	{ iso3: "NGA", fichier: "NGA-2", monument: "Zuma Rock", credit: "Hui Linbo, CC BY-SA 4.0" },
	{ iso3: "MLI", fichier: "MLI-2", monument: "Tombeau des Askia, Gao", credit: "David Sessoms, CC BY-SA 2.0" },
	{ iso3: "BFA", fichier: "BFA-2", monument: "Mémorial aux héros nationaux, Ouagadougou", credit: "The black photographer, CC0" },
	{ iso3: "TGO", fichier: "TGO-2", monument: "Palais de Lomé", credit: "Nero2022, CC BY-SA 4.0" },
	{ iso3: "MRT", fichier: "MRT-2", monument: "Ksar de Ouadane", credit: "Clemens Schmillen, CC BY-SA 4.0" },
	{ iso3: "GIN", fichier: "GIN-2", monument: "Monument du 22 novembre 1970, Conakry", credit: "Aboubacarkhoraa, CC BY 4.0" },
	{ iso3: "GMB", fichier: "GMB-3", monument: "Cercles mégalithiques de Wassu", credit: "Ikiwaner, CC BY-SA 3.0" },
	{ iso3: "GNB", fichier: "GNB-2", monument: "Mémorial du massacre de Pidjiguiti, Bissau", credit: "Jcornelius, CC BY-SA 4.0" },
	{ iso3: "CPV", fichier: "CPV-2", monument: "Forteresse royale de São Filipe, Cidade Velha", credit: "GualdimG, CC BY-SA 4.0" },
	{ iso3: "BEN", fichier: "BEN-3", monument: "Palais royaux d'Abomey", credit: "Karalyn Monteil, CC BY-SA 3.0 IGO" },
	{ iso3: "SEN", fichier: "SEN-3", monument: "Grande mosquée de Touba", credit: "John Crane, CC BY 2.0" },
	{ iso3: "CIV", fichier: "CIV-3", monument: "Mosquée de Kong", credit: "Ivoire8, CC BY-SA 3.0" },
	{ iso3: "NGA", fichier: "NGA-3", monument: "Mosquée nationale d'Abuja", credit: "Mark Fischer, CC BY-SA 2.0" },
	{ iso3: "MLI", fichier: "MLI-3", monument: "Mosquée Djingareyber, Tombouctou", credit: "upyernoz, CC BY 2.0" },
	{ iso3: "BFA", fichier: "BFA-3", monument: "Ruines de Loropéni", credit: "Rik Schuiling / TropCrop-TCS, CC BY-SA 4.0" },
	{ iso3: "TGO", fichier: "TGO-3", monument: "Takienta du Koutammakou", credit: "Erik Kristensen, CC BY 2.0" },
	{ iso3: "MRT", fichier: "MRT-3", monument: "Mosquée de Oualata", credit: "Kurt Dundy, CC BY 3.0" },
];

const DUREE_DIAPO = 4000; // ms

// En-tete « hero » (modele du projet du Port) : la photo de fond change en fondu,
// des points permettent de choisir un monument ; pause au survol.
(function lancerCarrousel() {
	const zone = document.getElementById("carrousel");
	if (!zone) return;
	const legende = document.getElementById("carrousel-legende");
	const commandes = document.getElementById("carrousel-commandes");
	const zonePoints = document.getElementById("carrousel-points");
	const nomPays = (iso3) => PAYS.find((p) => p.iso3 === iso3)?.nom ?? iso3;

	const diapos = MONUMENTS.map((m) => {
		const img = document.createElement("img");
		img.className = "carrousel__image";
		img.alt = "";
		img.src = `images/monuments/${m.fichier ?? m.iso3}.jpg`;
		if (m.cadrage) img.style.objectPosition = m.cadrage; // photo en hauteur : garder le haut du sujet
		const point = document.createElement("button");
		point.type = "button";
		point.className = "hero__point";
		point.setAttribute("aria-label", `${m.monument}, ${nomPays(m.iso3)}`);
		return { ...m, img, point, ok: true };
	});
	let actuelle = 0;
	let minuteur = null;
	const reduit = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	let enPause = reduit;

	function montrer(i) {
		const valides = diapos.filter((d) => d.ok);
		if (!valides.length) return;
		actuelle = (i + valides.length) % valides.length;
		const d = valides[actuelle];
		const n = valides.length;
		valides.forEach((x, i) => {
			x.img.classList.toggle("actif", x === d);
			x.point.setAttribute("aria-current", x === d ? "true" : "false");
			// 3 points visibles : precedent, actuel, suivant (en boucle)
			const apres = (i - actuelle + n) % n;
			const ecart = apres === n - 1 ? -1 : apres; // -1 precedent, 0 actuel, 1 suivant
			x.point.hidden = ecart > 1 || ecart < -1;
			x.point.style.order = ecart; // garde precedent | actuel | suivant meme au bout de la liste
		});
		legende.textContent = `${d.monument} · ${nomPays(d.iso3)} · Photo : ${d.credit}`;
	}

	function relancer() {
		clearInterval(minuteur);
		if (!enPause) minuteur = setInterval(() => montrer(actuelle + 1), DUREE_DIAPO);
	}

	diapos.forEach((d) => {
		zone.append(d.img);
		zonePoints.append(d.point);
		d.img.addEventListener("error", () => { d.ok = false; d.img.remove(); d.point.remove(); montrer(actuelle); }, { once: true });
		d.point.addEventListener("click", () => { montrer(diapos.filter((x) => x.ok).indexOf(d)); relancer(); });
	});
	// pas de bouton pause : le defilement s'arrete au survol ou quand le focus est dans la bande
	const bande = zone.parentElement;
	const pause = (v) => () => { if (!reduit) { enPause = v; relancer(); } };
	bande.addEventListener("mouseenter", pause(true));
	bande.addEventListener("mouseleave", pause(false));
	bande.addEventListener("focusin", pause(true));
	bande.addEventListener("focusout", pause(false));
	commandes.hidden = false;
	montrer(0);
	relancer();

	// Credits (licences CC BY / CC BY-SA : l'auteur doit etre cite)
	const liste = document.getElementById("credits-photos");
	for (const m of MONUMENTS) {
		const li = document.createElement("li");
		li.textContent = `${m.monument} (${nomPays(m.iso3)}) : ${m.credit}, via Wikimedia Commons`;
		liste?.append(li);
	}
})();
