# Téléchargements officiels TAMTUI

Page publique : https://tamtui.github.io/TAMTUI-TELECHARGEMENTS/

- `index.html` : page de téléchargement (générée par `outils/publier.mjs`).
- `mises-a-jour/<logiciel>.json` : fichiers lus par les logiciels pour leurs mises à jour automatiques (signées).
- `guides/` : guides de l'utilisateur en PDF.
- `fichiers/<logiciel>/` : installateurs de la dernière version (Windows .exe, Mac .dmg, archive Mac de mise à jour).
- Bouton **Actions › Publier** (`.github/workflows/publier.yml`) : publie les dernières versions fabriquées. Il utilise le secret `LECTURE_DEPOTS_PRIVES` (clé d'accès GitHub en lecture seule aux 4 dépôts privés). Ce dépôt étant public, ses minutes de fabrication sont gratuites.

Ce dépôt ne contient **aucun code source** et **aucune clé** : uniquement les installateurs et la documentation publics.
