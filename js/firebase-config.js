// firebase-config.js : configuration du projet Firebase (base Firestore pour les messages).
// Ces valeurs sont PUBLIQUES par conception (Firebase les met dans le site) : la securite repose
// sur les regles de firestore.rules, qui n'autorisent la lecture qu'au compte administrateur.
//
// null = Firestore desactive : le site garde son fonctionnement habituel
// (serveur Python avec IIS ou lancer.bat, sinon ouverture de la messagerie).
const FIREBASE_CONFIG = {
	apiKey: "AIzaSyDYUixHw0YMhAmMrGNtUkrGypwY3S7MlJI",
	authDomain: "horizon-ouest.firebaseapp.com",
	projectId: "horizon-ouest",
	storageBucket: "horizon-ouest.firebasestorage.app",
	messagingSenderId: "852398612383",
	appId: "1:852398612383:web:16ec9f962ba47f4526e7aa",
};
