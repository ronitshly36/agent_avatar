# Bolt: your personal assistant

Bolt is a personal assistant with a talking face. It answers using Claude (`claude-opus-5-5`), speaks its replies out loud, blinks, and moves its mouth while it talks.

What Bolt can do:
- **Chat and answer questions**, with spoken replies.
- **Remember things about you** between chats. Say "remember that my sister's birthday is May 3".
- **Keep a to-do list with reminders.** Say "remind me to call mom tomorrow at 6pm". At that time Bolt shows an alert and says the reminder out loud.
- **Search the web** for current info like news, weather and opening hours.

No install and no build step. You open one HTML file in a browser.

## Run it

1. Open `index.html` in **Google Chrome**.
2. Paste your Claude API key into Settings (⚙︎) and click **Save**.
3. Type a message. Bolt answers and talks.

Reminders only fire while the page is open, so keep the tab open in the background.

## Get a Claude API key

1. Go to **console.anthropic.com** and sign up or log in.
2. Add some credit under **Billing**, since the API is pay-as-you-go.
3. Go to **API Keys** → **Create Key** and copy the key (it starts with `sk-ant-`).
4. Paste it into Bolt's Settings.

Your key, memories and to-dos are stored only in your own browser (localStorage). None of them goes into this repo.

## The face

`assets/face.jpg` is an AI-generated person who doesn't exist (StyleGAN2, from thispersondoesnotexist.com). The animation is simple:
- **Blinking:** skin-colored eyelids drawn over the eyes (`.lid` in `style.css`).
- **Talking:** a copy of the photo, masked to the mouth area, stretched while speaking (`.mouth` in `style.css`, `animateMouth()` in `app.js`).

To use a different face, replace `assets/face.jpg` with a square, front-facing photo. Then adjust the eyelid positions and color (`--lid`, `.lid-l`, `.lid-r`) and the mouth position (`.mouth`) in `style.css`.

## Customize

- **Name:** `NAME` at the top of `app.js`.
- **Personality:** the text in `buildSystem()` in `app.js`.
- **Voice:** pick one in Settings.

## Talking with your voice

The 🎤 button works in Chrome once a microphone is connected (AirPods, a headset or a USB mic).

## Files

| File | What it does |
|---|---|
| `index.html` | Page layout: face, chat, to-do list, settings |
| `style.css` | Colors, face overlays, animations |
| `app.js` | Claude API streaming, tools (memory, to-dos, web search), reminders, speech |
| `assets/face.jpg` | The face photo |
