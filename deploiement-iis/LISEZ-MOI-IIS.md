# Déployer Horizon Ouest sur IIS

Résultat : le site sur `http://localhost:8080/`, servi par **IIS**, avec le serveur Python
(messages, espace administrateur, calculs) branché derrière IIS par un **proxy inverse**.

```
Navigateur ──► IIS (port 8080)
                 ├── pages, css, js, images ......... servis directement par IIS
                 └── /api/…, /docs ──(proxy inverse)──► FastAPI (127.0.0.1:8001)
                                                          └── backend/suggestions.jsonl
```

Le serveur Python n'écoute que sur `127.0.0.1` : on ne peut le joindre qu'en passant par IIS.
Le dossier `backend/` (code, messages, mot de passe) n'est jamais servi par IIS.

## Ce qu'il faut installer une seule fois (droits administrateur)

IIS est déjà installé sur l'ordinateur. Il manque trois éléments, tous gratuits.

1. **URL Rewrite** (Microsoft) : <https://www.iis.net/downloads/microsoft/url-rewrite>
   Télécharger la version « x64 » en français ou en anglais, puis l'installer.
2. **Application Request Routing (ARR) 3.0** (Microsoft) : <https://www.iis.net/downloads/microsoft/application-request-routing>
   L'installer **après** URL Rewrite.
3. **Python pour tous les utilisateurs** : <https://www.python.org/downloads/windows/>
   Dans l'installateur, choisir « Customize installation », puis cocher
   **« Install Python for all users »** (Python s'installe alors dans `C:\Program Files\Python3xx`).
   Le Python du Microsoft Store ne convient pas : un service Windows ne peut pas l'utiliser.
   Si Python a été installé « pour ce compte seulement » (dossier `AppData\Local\Programs\Python`),
   cela fonctionne aussi : le script le trouve tout seul.

## Installer le site

1. Ouvrir le menu Démarrer, taper **PowerShell**, clic droit, **« Exécuter en tant qu'administrateur »**.
2. Aller dans ce dossier :
   ```
   cd "C:\Users\Hp\Downloads\Projet_Neymar\Projet_Neymar\dashboard-ci\deploiement-iis"
   ```
3. Lancer :
   ```
   powershell -ExecutionPolicy Bypass -File .\installer-iis.ps1
   ```

Le script vérifie les prérequis, copie le site dans `C:\inetpub\horizon-ouest`, installe
FastAPI, crée le site IIS « Horizon Ouest » (port 8080), active le proxy d'ARR et lance le
serveur Python. Ce serveur redémarre tout seul à chaque démarrage de Windows (tâche planifiée
« Horizon Ouest - serveur Python »). À la fin, le script affiche trois contrôles : la page
d'accueil, l'API derrière le proxy et la protection du dossier `backend`.

## Utiliser

| Quoi | Adresse |
|---|---|
| Le site | <http://localhost:8080/> |
| Messages reçus (administrateur) | <http://localhost:8080/admin.html> |
| Documentation de l'API | <http://localhost:8080/docs> |

Mot de passe administrateur : fichier `C:\inetpub\horizon-ouest\backend\mot_de_passe_admin.txt`,
créé à la première tentative de connexion (l'ouvrir avec le Bloc-notes lancé en administrateur).
On peut y écrire son propre mot de passe.

Depuis un autre ordinateur du même réseau : `http://<adresse IP de ce PC>:8080/`, à condition
d'autoriser le port 8080 dans le pare-feu Windows.

## Mettre à jour après une modification du site

Relancer simplement `installer-iis.ps1` (en administrateur). Les messages reçus et le mot de
passe administrateur sont conservés.

## Désinstaller

```
powershell -ExecutionPolicy Bypass -File .\desinstaller-iis.ps1
```
Retire le site, le pool et la tâche planifiée. Le dossier `C:\inetpub\horizon-ouest` est
conservé, car il contient les messages reçus.

## Dépannage

- **« le port 8080 est déjà utilisé »** : relancer avec un autre port,
  `.\installer-iis.ps1 -PortSite 8090`.
- **Le site s'affiche mais « API Python : pas de réponse »** : ouvrir le Planificateur de tâches,
  tâche « Horizon Ouest - serveur Python », onglet Historique ; ou tester à la main
  `python -m uvicorn backend.main:app --port 8001` dans `C:\inetpub\horizon-ouest`.
- **Erreur 502.3 sur /api** : le serveur Python ne tourne pas (voir le point précédent).
- **Erreur 500.19 au chargement** : URL Rewrite n'est pas installé (étape 1).
- **Les calculs se font « dans le navigateur »** : normal tant que l'API ne répond pas ; le site
  reste utilisable.
