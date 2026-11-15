# Kalakaari Corner (Firebase + GitHub Pages)

Website on GitHub Pages, data in Firebase Realtime Database, sign-in with email and Google,
live classes through Daily (the Daily API key stays inside a Firebase Cloud Function).

## Before you start
Install these once: Node.js 20 (nodejs.org), Git (git-scm.com), and make a free GitHub account.
You also need a Google account (for Firebase) and your Daily API key (dashboard.daily.co > Developers).

## Part 1 - Make the Firebase project
1. Go to console.firebase.google.com and click **Create a project**. Name it (for example `kalakari-corner`).
2. Left menu **Build > Authentication > Get started**.
3. Open the **Sign-in method** tab. Switch on **Email/Password** and save. Switch on **Google**, choose a support email, and save.
4. Left menu **Build > Realtime Database > Create Database**. Keep the default location. Choose **Start in locked mode**.
5. In the database **Data** tab, click the **+** next to the database name and add:
   - Name: `config`
   - Then click **+** next to `config` and add Name: `teacherEmail`, Value: Priyanka's email **in lowercase** (for example `priyanka@gmail.com`).
6. Click the gear icon > **Project settings > General**. Under **Your apps**, click the **</>** (Web) icon, give it a nickname, and click Register.
7. Copy the `firebaseConfig` values it shows. Open `src/firebase.ts` in this folder and paste them in (apiKey, authDomain, databaseURL, projectId, appId).
   If `databaseURL` is missing, copy it from the top of the Realtime Database page.
8. Open `.firebaserc` and replace `PASTE_YOUR_PROJECT_ID` with your project id.

## Part 2 - Deploy the rules and video functions
Open a terminal inside this folder, then run these one at a time:
1. `npm install -g firebase-tools`
2. `firebase login`
3. `firebase deploy --only database` (this installs the security rules)
4. `cd functions` then `npm install` then `cd ..`
5. In the Firebase console, click **Upgrade** (bottom left) and choose the pay-as-you-go **Blaze** plan. Cloud Functions need it.
6. `firebase functions:secrets:set DAILY_API_KEY` and paste your Daily API key when asked.
7. `firebase deploy --only functions`

## Part 3 - Test on your computer
1. `npm install`
2. `npm run dev`
3. Open the address it prints (usually http://localhost:5173).
4. In Firebase **Authentication > Settings > Authorized domains**, `localhost` is already allowed.

## Part 4 - Put the website on GitHub Pages
1. On github.com click **New repository**. Name it, keep it Public, and create it.
2. In the terminal in this folder run:
   - `git init`
   - `git add .`
   - `git commit -m "first version"`
   - `git branch -M main`
   - `git remote add origin https://github.com/YOURNAME/YOURREPO.git`
   - `git push -u origin main`
3. On GitHub open the repo **Settings > Pages**. Under **Build and deployment > Source**, choose **GitHub Actions**.
4. Open the repo **Actions** tab and wait for "Deploy to GitHub Pages" to finish (about 1-2 minutes).
5. Your site is at `https://YOURNAME.github.io/YOURREPO/`.
6. Back in Firebase **Authentication > Settings > Authorized domains**, click **Add domain** and add `YOURNAME.github.io`. Google sign-in will not work until you do this.

## Part 5 - First use
1. Open the site and sign in with **Google** using Priyanka's email (the one saved in `config/teacherEmail`).
2. The teacher tools (schedule a class, add recordings, add demo videos) appear for her account only.
3. Students create an account with email or Google.
4. To start a class: schedule it, then press **Start class**. It opens in a new window.

## Class links and recordings
- **Class link:** in **My classes**, every class has **Copy class link** and **Share on WhatsApp**. Students open the link, sign in, and land in that exact class. They can join once Priyanka starts it.
- **Recordings are automatic:** when Priyanka starts a class, Daily records it. A few minutes after the class ends it appears in **Recordings > From live classes**, with **Watch**, **Download**, and **WhatsApp** buttons.
- **Daily plan:** Daily only allows automatic cloud recording on its paid plans, so check your Daily plan if no recordings appear.
- **After updating files:** run `firebase deploy --only database` and `firebase deploy --only functions` again whenever `database.rules.json` or `functions/index.js` changes.

## Updating the site later
Change files, then run `git add .`, `git commit -m "update"`, `git push`. GitHub rebuilds the site by itself.

## Good to know
- Recordings and demo videos are links (YouTube, Vimeo, or direct https .mp4 links). There are no file uploads.
- Replace `public/hero.svg` with your own picture if you like (same file name, or edit `HERO_ART` in `src/pages/Home.tsx`).
- If a Google sign-in popup is blocked, allow popups for the site.
- If something fails, open the browser console (F12) or the terminal and copy the exact error message.
