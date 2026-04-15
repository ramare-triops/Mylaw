# Configuration Google Drive Sync — Mylaw

Suivez ces étapes pour activer la synchronisation Google Drive dans Mylaw.

## 1. Créer un projet Google Cloud

1. Allez sur [console.cloud.google.com](https://console.cloud.google.com)
2. Cliquez sur **"Nouveau projet"**
3. Nommez-le `Mylaw` et cliquez **Créer**

## 2. Activer l'API Google Drive

1. Dans le menu gauche : **APIs & Services → Bibliothèque**
2. Recherchez **"Google Drive API"**
3. Cliquez dessus puis **Activer**

## 3. Configurer l'écran de consentement OAuth

1. **APIs & Services → Écran de consentement OAuth**
2. Choisissez **Externe** → Créer
3. Remplissez :
   - Nom de l'application : `Mylaw`
   - Email d'assistance : votre email
   - Email du développeur : votre email
4. Cliquez **Enregistrer et continuer**
5. Sur la page **"Utilisateurs tests"**, ajoutez votre adresse Gmail

## 4. Créer les identifiants OAuth

1. **APIs & Services → Identifiants → + Créer des identifiants → ID client OAuth**
2. Type d'application : **Application Web**
3. Nom : `Mylaw Local`
4. **Origines JavaScript autorisées** :
   ```
   http://localhost:3000
   ```
5. **URI de redirection autorisés** :
   ```
   http://localhost:3000
   ```
6. Cliquez **Créer** et copiez le **Client ID**

## 5. Configurer Mylaw

```bash
cp .env.local.example .env.local
# Le Client ID est déjà renseigné dans .env.local.example
npm run dev
```

## 6. Connecter Drive dans Mylaw

1. **Paramètres → Synchronisation**
2. Cliquez **Connecter Google Drive**
3. Autorisez l'accès dans la fenêtre Google

✅ La synchronisation est active. Vos données sont sauvegardées automatiquement 3 secondes après chaque modification.

## Notes

- Le fichier `mylaw-backup.json` est stocké dans l'espace **AppData** privé de Drive
- Sur un nouvel appareil : `cp .env.local.example .env.local && npm run dev`, puis reconnectez Drive — vos données sont restaurées automatiquement
- Statut visible dans **Paramètres → Synchronisation**
