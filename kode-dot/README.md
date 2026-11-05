# Kode Dot: how this is organised

Two places, two jobs:

| Where | Job | What you click |
|---|---|---|
| **claude.ai → Projects → "Kode Dot"** | Thinking: ideas, specs, copy, launch plans | Open the project, pick the app's chat or start a new one |
| **claude.ai/code** (this) | Building: code, fixes, deploys | Pick the app's repo, start a session |

Both read the same files in this folder, so Claude always knows the portfolio, your standards and where each app stands.

## One-off setup (10 minutes)

1. On claude.ai, go to **Projects → Create project**. Name it `Kode Dot`.
2. **Set project instructions**: paste everything in `PROJECT-INSTRUCTIONS.md`.
3. **Add to project knowledge**: upload `APPS.md`, `NEW-APP-BRIEF.md` and every file in `apps/`.
4. Start one chat per app and name it after the app (e.g. "InjectaTrace"). That's your click-in list.

## Day to day

- **Carry on with an app**: open the Kode Dot project, then open that app's chat.
- **New app idea**: new chat in the project, then type `New app:` and describe it in plain English. Claude asks the gaps from `NEW-APP-BRIEF.md` and writes the brief.
- **Time to build**: in claude.ai/code pick the app's repo and say "build from the brief". Each repo carries a `CLAUDE.md`, so the session starts with context.
- **After any real change**: ask Claude to "update the register". Then re-upload `APPS.md` and that app's brief to the project knowledge so both sides stay in sync.

## House rules

- **One app = one repo = one chat.** Name all three the same.
- **Status lives in `APPS.md`.** Chats aren't the record. The register is.
