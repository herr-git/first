# Project: Crypto and tokenized fund dashboard (demo)

## Purpose
- A private demo to show capability. Not a real product.
- Audience: me, and people I choose to show it to.

## Hard rules
- Version 1 (the dashboard): read-only. No buying, selling, logins or real money.
- Static site: plain files that run in a browser. No server, no database.
- Free data sources only. No paid keys, no card details.
- Never put secret keys or passwords in the code.
- Do not add features I did not ask for.

## Hard rules (Version 2: paper trading)
- Paper trading only. Pretend money, pretend orders. Nothing is ever sent to a real broker, exchange or bank.
- Every screen with trading must say: "Paper trading. Pretend money. No real orders."
- Static site: plain files in a browser. No server, no database, no logins.
- Save the paper account in the visitor's browser only. Do not collect personal data.
- Free data sources only. No keys or secrets in the code.
- Trades use the latest price shown on the page, and the screen must show when that price was last updated.
- If the price is older than a set limit, block the trade and say why.
- Only buy what cash allows. Only sell what is owned. No borrowing.
- Never use wording that urges action ("invest now", "best", "top pick") or gives advice.
- No links to real brokers or exchanges for buying.
- Do not add features I did not ask for.

## Version 2 decisions (agreed)
- Start with 100,000 pretend US dollars. Tokens and US-listed funds can be traded. Tokenized funds are view only.
- No fees, no short selling, no borrowing.
- Orders are entered as a dollar amount; fractions of a token or fund share are allowed.
- Paper trading is its own page. The pretend portfolio page stays as it is.
- Too-old limit for prices: 45 minutes (set in data/settings.json).
- US funds can also be traded when the market is closed, at the last closing price.
- A held token that drops out of the top 20 keeps its last known price, marked "price not updated"; selling it is paused until it is back.
- A "Start over" (reset) button with a confirm step.
- Work on branch version-2-paper-trading; copy to main only when slices 2a to 2e are finished.

## Data rules
- Show on every screen: where the data came from and when it was last updated.
- Anything that is sample or made-up data must be labelled "Sample data" on screen.
- If a free source cannot supply a field (for example bid/ask), say so on screen. Do not invent numbers.
- If a data source fails, show a clear message, not a blank page.

## Page content rules
- Footer on every page: "Demo only. Not investment advice. No trading happens here."
- Plain language on screen. No jargon without a short explanation.
- Must be readable on a phone.

## How to work with me
- Explain things in plain language. I am a product person, not a developer.
- Explain any technical term in a few words the first time you use it.
- Work in small steps. After each step, tell me what changed and how to see it.
- Before you start a new step, tell me your plan in 3 to 5 bullets and wait for my yes.
- If you are guessing, say GUESS and how confident you are (low, medium, high).
- If something I ask is a bad idea, say so and suggest a better option.
- Do not use em dashes in any text you write.

## Files in this folder
- backlog.txt: the user stories from my planning
- build-proposal.txt: the suggested build and data sources
- regulation-notes.txt: regulation guardrails
- These three are private: they are listed in .gitignore and must never be published. In a new session, ask me to paste them if they are missing.

## Done means
- I can open the site on my computer and see it working.
- I can say where each number comes from.
