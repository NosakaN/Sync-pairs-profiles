# Sync Pairs Tracker — Profils

Version web du **Sync Pairs Tracker** avec un gestionnaire de profils locaux.

Le dépôt ne contient pas une copie du tracker original. À chaque déploiement, GitHub Actions récupère `pomasters/SyncPairsTracker`, ajoute le gestionnaire de profils, puis publie le résultat sur GitHub Pages.

## Fonctions ajoutées

- plusieurs profils indépendants ;
- création, renommage, duplication et suppression ;
- changement rapide de joueur ;
- export/import d’un profil complet ;
- sauvegarde séparée de la collection, des objets et du backup ;
- conservation des réglages généraux du tracker ;
- affichage adapté à l’iPhone ;
- possibilité d’ajouter le site à l’écran d’accueil.

## GitHub Pages

Dans le dépôt, ouvre :

`Settings` → `Pages` → `Build and deployment` → `Source` → **GitHub Actions**

Ensuite, le workflow **Build and deploy Sync Pairs Tracker** publie le site automatiquement.

Adresse attendue :

`https://nosakan.github.io/Sync-pairs-profiles/`

## iPhone

1. Ouvre le site dans Safari.
2. Appuie sur **Partager**.
3. Choisis **Ajouter à l’écran d’accueil**.
4. Ouvre ensuite l’icône **Sync Pairs**.

Les profils sont sauvegardés localement dans Safari. Ils ne sont pas synchronisés automatiquement avec un autre appareil ; utilise **Export profile** et **Import profile** pour les transférer.

## Mise à jour automatique

Le site est reconstruit à chaque modification de `main` et une fois par jour afin de récupérer les mises à jour du tracker original.
