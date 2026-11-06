// pont_js.js : execute les fonctions de js/donnees.js (et le catalogue de js/config.js)
// pour les tests Python. Lit sur l'entree standard une liste d'appels
// [{ "fonction": "calculerStats", "args": [...] }, ...] et ecrit la liste des resultats.
// Les Map sont converties en objets, l'infini en chaine ("inf" / "-inf").

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const racine = path.resolve(__dirname, "..", "..");
const contexte = { console };
vm.createContext(contexte);
for (const fichier of ["js/config.js", "js/donnees.js"]) {
	vm.runInContext(fs.readFileSync(path.join(racine, fichier), "utf8"), contexte, { filename: fichier });
}

// Les fonctions qui attendent des Map recoivent des objets JSON.
const adaptateurs = {
	construireSeries: (observations, codesPays) => {
		const r = contexte.construireSeries(observations, codesPays);
		return { annees: r.annees, series: Object.fromEntries(r.series) };
	},
	transformerSeries: (annees, series, indicateur, mode, reference) => {
		const r = contexte.transformerSeries(annees, new Map(Object.entries(series)), indicateur, mode, reference);
		return { series: Object.fromEntries(r.series), indicateur: r.indicateur };
	},
	catalogue: () => vm.runInContext("({ indicateurs: INDICATEURS, pays: PAYS, min: ANNEE_MIN })", contexte),
};

const appels = JSON.parse(fs.readFileSync(0, "utf8"));
const resultats = appels.map(({ fonction, args }) => {
	const f = adaptateurs[fonction] || contexte[fonction];
	if (typeof f !== "function") throw new Error("Fonction inconnue : " + fonction);
	return f(...args);
});

process.stdout.write(JSON.stringify(resultats, (cle, v) => {
	if (v === Infinity) return "inf";
	if (v === -Infinity) return "-inf";
	return v;
}));
