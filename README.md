# Bolt: your robot buddy

Bolt is a friendly animated robot you can chat with. It answers using Claude (`claude-opus-5-5`) and speaks its replies out loud, and its mouth moves while it talks. Once you connect a microphone, you can talk to it too.

No install and no build step. It's just three files you open in a browser.

## Run it

1. Open `index.html` in **Google Chrome**: double-click it, or drag it into a Chrome window.
2. Paste your Claude API key into the Settings window (⚙︎) and click **Save**.
3. Type a message and Bolt talks back.

## Get a Claude API key

1. Go to **console.anthropic.com** and sign up or log in.
2. Add a little credit under **Billing**, since the API is pay-as-you-go.
3. Open **API Keys** → **Create Key**, and copy the key (it starts with `sk-ant-`).
4. Paste it into Bolt's Settings.

The key is stored only in your own browser (localStorage). Don't share it or commit it to GitHub.

## Talking with your voice

The 🎤 button appears in browsers that support speech recognition, such as Chrome. It needs a microphone, like AirPods, a headset or a USB mic. Click 🎤, speak, and Bolt sends what you said when you stop.

## Customize Bolt

- **Personality**: edit the `SYSTEM` text at the top of `app.js`.
- **Voice**: pick one in Settings. Pitch and speed are set in `speak()` in `app.js`.
- **Looks**: the robot is drawn with SVG in `index.html`, and its colors and animations are in `style.css`.

## Files

| File | What it does |
|---|---|
| `index.html` | Page layout and the robot drawing |
| `style.css` | Colors and the animations (blink, talk, think, listen) |
| `app.js` | Chat, Claude API streaming, speech in and out |
