# Configuration Google Drive Sync

Suivez ces étapes pour activer la synchronisation Google Drive dans Mylex.

## 1. Créer un projet Google Cloud

1. Allez sur [console.cloud.google.com](https://console.cloud.google.com)
2. Cliquez sur **"Nouveau projet"**
3. Nommez-le `Mylex` et cliquez **Créer**

## 2. Activer l'API Google Drive

1. Dans le menu gauche : **APIs & Services → Bibliothèque**
2. Recherchez **"Google Drive API"**
3. Cliquez dessus puis **Activer**

## 3. Configurer l'écran de consentement OAuth

1. **APIs & Services → Écran de consentement OAuth**
2. Choisissez **Externe** → Créer
3. Remplissez :
   - Nom de l'application : `Mylex`
   - Email d'assistance : votre email
   - Email du développeur : votre email
4. Cliquez **Enregistrer et continuer** (les autres étapes peuvent être passées)
5. Sur la page **"Utilisateurs tests"**, cliquez **+ Add users** et ajoutez votre adresse Gmail

## 4. Créer les identifiants OAuth

1. **APIs & Services → Identifiants → + Créer des identifiants → ID client OAuth**
2. Type d'application : **Application Web**
3. Nom : `Mylex Local`
4. **Origines JavaScript autorisées** — ajoutez :
   ```
   http://localhost:3000
   ```
5. **URI de redirection autorisés** — ajoutez :
   ```
   http://localhost:3000
   ```
6. Cliquez **Créer**
7. Copiez le **Client ID** (format : `xxxx.apps.googleusercontent.com`)

## 5. Configurer Mylex

1. À la racine du projet, copiez le fichier d'exemple :
   ```bash
   cp .env.local.example .env.local
   ```
2. Ouvrez `.env.local` et remplacez la valeur :
   ```
   NEXT_PUBLIC_GOOGLE_CLIENT_ID=VOTRE_CLIENT_ID_ICI.apps.googleusercontent.com
   ```
3. Redémarrez le serveur :
   ```bash
   npm run dev
   ```

## 6. Connecter Drive dans Mylex

1. Allez dans **Paramètres → Synchronisation**
2. Cliquez **Connecter Google Drive**
3. Une fenêtre Google s'ouvre → connectez-vous avec votre compte
4. Autorisez l'accès (scope limité : l'app ne voit que ses propres fichiers)

✅ La synchronisation est active. Vos données sont sauvegardées automatiquement 3 secondes après chaque modification.

## Notes

- Le fichier de sauvegarde `mylex-backup.json` est stocké dans l'espace **AppData** de Drive (privé, invisible dans "Mon Drive")
- Sur un nouvel appareil : répétez l'étape 5 et 6 — vos données seront restaurées automatiquement
- Le statut de sync est visible dans **Paramètres → Synchronisation**
