# Bolt: your personal assistant

Bolt is a personal assistant with a **3D animated avatar**. It answers using Claude (`claude-opus-5-5`) and speaks its replies out loud. While it talks, the avatar's lips match the words. It also blinks, moves its head naturally, and changes expression while thinking, listening or talking.

What Bolt can do:
- **Chat and answer questions**, with spoken replies.
- **Remember things about you** between chats. Say "remember that my sister's birthday is May 3".
- **Keep a to-do list with reminders.** Say "remind me to call mom tomorrow at 6pm". Bolt shows an alert and says the reminder out loud when it's due.
- **Search the web** for current info like news, weather and opening hours.
- **Gmail and Google Drive:** read and summarize email, write reply drafts, and find and read your files (see below).

## Run it

1. Double-click **`start.command`**. A Terminal window opens and Bolt opens in your browser at http://localhost:8765. Keep that Terminal window open while you use Bolt.
2. Paste your Claude API key into Settings (⚙︎) and click **Save**.
3. Type a message. Bolt answers and talks.

Why the launcher: browsers won't load 3D models from a double-clicked HTML file, so Bolt needs a tiny local web server. `start.command` runs one with the Python built into macOS.

Reminders only fire while the page is open.

## Get a Claude API key

1. Go to **console.anthropic.com** and sign up or log in.
2. Add some credit under **Billing**, since the API is pay-as-you-go.
3. Go to **API Keys** → **Create Key** and copy the key (it starts with `sk-ant-`).
4. Paste it into Bolt's Settings.

Your key, memories and to-dos are stored only in your own browser. None of them goes into this repo.

## Connect Gmail & Drive

With Google connected, Bolt can:
- **Gmail:** search and read your email, summarize your inbox, and save reply drafts. It **cannot send**; you send drafts yourself from Gmail.
- **Drive** (read only): search your files and read Google Docs, Sheets, Slides and text files.

Google needs a free, one-time setup so your copy of Bolt has its own "Client ID". It takes about 10 minutes:

1. Go to **console.cloud.google.com** and sign in with your Gmail account.
2. Create a project: click the project picker at the top → **New project** → name it `Bolt` → **Create**, then select it.
3. Turn on the APIs: in the search bar, find **Gmail API** → **Enable**. Then find **Google Drive API** → **Enable**.
4. Set up the login screen: search for **Google Auth Platform** → **Get started**.
   - App name: `Bolt`. Support email: your email.
   - Audience: **External**.
   - Contact email: your email. Agree to the policy, then click **Create**.
5. Allow yourself to log in: in Google Auth Platform → **Audience** → **Test users** → **Add users** → add your Gmail address → **Save**.
6. Create the Client ID: Google Auth Platform → **Clients** → **Create client**.
   - Application type: **Web application**.
   - Under **Authorized JavaScript origins**, click **Add URI** and enter `http://localhost:8765`.
   - Click **Create** and copy the **Client ID** (it ends in `.apps.googleusercontent.com`).
7. In Bolt: ⚙︎ Settings → paste the Client ID → **Connect Google**, then pick your account.
   - Google warns **"Google hasn't verified this app"**. That's expected, because it's your own app. Click **Continue**.
   - Tick all the permission boxes and click **Continue**.

Google's permission screen says Bolt can "send email". That's because Google bundles drafts and sending into one permission. Bolt has no send tool, so it can only save drafts.

The Google login lasts about an hour. When it runs out, Bolt asks you to click **Connect Google** again. The login is kept only in the open page, never saved to disk.

## How the avatar works

- `avatar.js` renders the model with [three.js](https://threejs.org/), loaded from a CDN.
- **Lip-sync:** each spoken word is turned into mouth shapes ("visemes") by `vendor/lipsync-en.mjs`. The timing comes from the browser's speech engine as each word is spoken.
- **Expressions:** moods (idle, thinking, listening, speaking) are made from the model's ARKit face blend shapes (`MOODS` in `avatar.js`).

To use a different avatar, replace `assets/avatar.glb` with any Ready Player Me–compatible GLB that has ARKit and Oculus viseme blend shapes. Avaturn T2 and MPFB avatars also work.

## Customize

- **Name:** `NAME` at the top of `app.js`.
- **Personality:** the text in `buildSystem()` in `app.js`.
- **Voice:** pick one in Settings.
- **Expressions and head motion:** `MOODS` and `POSES` in `avatar.js`.

## Talking with your voice

The 🎤 button works in Chrome once a microphone is connected (AirPods, a headset or a USB mic).

## Files

| File | What it does |
|---|---|
| `start.command` | Double-click to start Bolt |
| `index.html` | Page layout: avatar, chat, to-do list, settings |
| `style.css` | Colors and layout |
| `app.js` | Claude API streaming, tools (memory, to-dos, web search), reminders, speech |
| `avatar.js` | 3D avatar: rendering, lip-sync, blinking, moods |
| `google.js` | Gmail and Google Drive access (Google sign-in in the browser) |
| `assets/avatar.glb` | The 3D avatar model |
| `vendor/lipsync-en.mjs` | English word to mouth-shape converter |

## Credits and licenses

- Avatar model `assets/avatar.glb` ("brunette") was made with Ready Player Me and comes from [TalkingHead](https://github.com/met4citizen/TalkingHead) v1.8.0. It is licensed [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/), so personal, non-commercial use only.
- `vendor/lipsync-en.mjs` is from [TalkingHead](https://github.com/met4citizen/TalkingHead) v1.8.0 by Mika Suominen, MIT License.
- [three.js](https://threejs.org/), MIT License.
