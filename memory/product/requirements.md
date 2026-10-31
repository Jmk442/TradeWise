# Requirements: TradeWise

(Web app, React/FastAPI/Mongo. Phase 1 and Phase 2 prompts below are the user's verbatim spec; build Phase 2 (v1.2) on top of Phase 1 as one build.)

## Core Value
Build **TradeWise**, a modern, action-first, AI-powered day trading companion designed for my teenage son. Preserve the original product concept. Do not turn this into a trading course, educational platform, brokerage or automatic trading bot. My son already has his own trading account. TradeWise helps him see what experienced traders are watching, assess possible or completed trades, understand potential outcomes, and track the results. TradeWise must not execute real-money orders.

## Personas & Roles
Teenage son with an existing trading account; prefers exploring and making decisions over structured teaching. No login for now.

## Features
Five tabs: Today | Analyse | Follow | My Trades | Learn.

TODAY: Today's Market (status, movement, scheduled events, last update); What Traders Are Watching (up to three setups: ticker, trader/group, one-sentence reasoning, key price condition, principal risk, source and timestamp); Stocks Worth Reviewing (why listed, freshness, uncertainty, never "guaranteed opportunity"); My Positions (manual holdings, entry, current price, est. gain/loss, changes since assessment); Quick Actions (Analyse My Buy, Follow Traders, Track My Trades). No lessons on Today. If no verified setup, say so clearly. Never manufacture a daily opportunity. Trades needing review shown.

ANALYSE / CHECK MY BUY: ticker, optional entry price, quantity, buy date/time, stop-loss/target, notes. Auto-retrieve market data. Four headings: What Looks Positive, What Could Go Wrong, What Might Happen Next, What to Check Before Deciding. Also potential gain/loss under scenarios, important price levels, relevant news, uncertainty/missing info, simple bottom-line summary. Bullish/neutral/bearish scenarios with time horizon, assumptions, supporting evidence, price ranges where justified, invalidation conditions, uncertainty. No invented probabilities or scores. Expandable "Why?". Save assessment and later compare with actual outcomes. Max three basic interactions.

FOLLOW: Initially TraderTV Live (https://tradertv.live/), SMB Capital (https://www.youtube.com/@smbcapital), Bear Bull Traders (https://bearbulltraders.com/). Candidate sources, not verified profitable traders. User selects which to follow. Show genuine published setups with original links and timestamps; ticker, source, what reported, entry/exit if explicit, strategy, risks. "Copy to Practice Journal" records a simulated position. Manual entry of setups supported. Never fabricate trades, performance or paid access. Setup Freshness Engine: each setup records source, published timestamp, reported entry, conditions, latest price and timestamp, and status label (Source verified / Awaiting current market data / Original conditions no longer observed / Setup requires review / Historical example only) – not buy/sell instructions. Trader Evidence Scorecard: quality/timeliness, documented entries/exits, attribution, losing trades visible, number of evaluable setups; stats only when records are complete; no ranking by self-reported profit/popularity.

MY TRADES: quick manual recording of real (actual) and simulated trades: stock and exchange, entry price/time, quantity, status, latest price, unrealised/realised P&L, exit details, original AI assessment, changes since. Actual, simulated, hypothetical visibly separate. Never assume execution unless recorded. Realised needs actual exit. Automatic follow-up as prices update.

LEARN: separate optional page: day trading concepts, terminology, understanding risk, following experienced traders, reading charts, why setups succeed/fail, evaluating past decisions. No onboarding, pop-ups, quizzes, reminders. Optional small "Why?"/"Explain More" on other screens.

WHAT WOULD HAVE HAPPENED (inside existing tabs): historical ticker, price, date/time; real historical data incl. intraday where supported; price movement, hypothetical gain/loss, high/low, fees/slippage assumptions, whether target/stop reached, info available at decision time; no look-ahead bias.

FUTURE SCENARIOS: bullish/neutral/bearish, uncertainties, factors that change outlook; stored at creation and compared to later actual prices.

MARKET SELECTION: user selects ASX or US equities; handle currencies, trading hours, holidays, delays, source coverage. Do not present US trader commentary as applicable to ASX without evidence.

## Critical user flow
Open app, see key market info within 10-15 seconds, check a proposed buy, see uncertainties, record a decision, later review result.

## UI/UX Rules
Dark-mode-first, charcoal/navy, teal accents, optional light mode, large touch-friendly controls, clean charts, compact cards, minimal technical language, responsive mobile/tablet/desktop, accessible. No crowded terminals, no compulsory courses, tutorials, pop-ups, quizzes or gamification. Tone: direct, calm, concise, no hype or false certainty.

## Integrations
- Market data: "Free delayed data, no key where possible"; clearly show when prices are delayed/unavailable. Do not assume licensed real-time.
- Live trader feeds: user wants live feeds immediately: pull latest YouTube videos from SMB Capital and public RSS/blog posts from sources where permitted, plus manual setup entry, plus Telegram/Discord channel import (user may have access; set up as optional).
- AI: GPT 5.5 for assessments, grounded in retrieved data (Emergent universal key).
- No login for now. No brokerage or order execution.

## Edge Cases
Invalid ticker/price inputs, stale/incomplete data, API failures and loading states, old/invalidated setups, missing trade records, unsupported AI statements. Never present simulated examples as genuine opportunities; label any demo data prominently.

## Seed Data
None unless prominently labelled demo.
