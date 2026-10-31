# TradeWise — PRD

## Original problem
Build /app/memory/product/requirements.md: TradeWise, an action-first, AI-powered day-trading companion for a teenage son. It has five tabs (Today | Analyse | Follow | My Trades | Learn), no login, and never executes orders. Phase 1 and Phase 2 were built together.

## User choices
- Free delayed Yahoo Finance data, no key
- GPT 5.5 via the Emergent key
- YouTube RSS feeds for TraderTV Live, SMB Capital and Bear Bull Traders, plus manual setup entry and Telegram/Discord paste-import (no token)
- **Default market ASX**, US one tap away, both sessions shown in Sydney time
- Open-window countdown and first-hour index move on Today

## Architecture
- Backend: FastAPI with these modules: `server.py` (routes and models), `market.py` (Yahoo data, sessions, holidays, indicators), `feeds.py` (RSS, paste parser), `ai_assess.py` (GPT 5.5 JSON assessment)
- MongoDB collections: sources, setups, trades, assessments
- Frontend: React with pages Today, Analyse, Follow, Trades, Learn. Uses shadcn, recharts, dark-first with teal accents, Outfit/Plus Jakarta/JetBrains Mono fonts.

## Implemented (2026-10-31)
- **Today:** market status, index and spark chart, delayed badge, holidays, Sydney session strip, open-window countdown, first-hour move, verified setups (max 3, with an honest empty state), stocks worth reviewing (from setups and Yahoo trending, with caveats), positions, trades needing review, quick actions
- **Analyse:**
  - Check-my-buy with AI assessment: the 4 headings, scenarios with invalidation, P&L under scenarios, levels, news, uncertainties, and Why toggles
  - Assessments are saved automatically, and the saved view compares them with the current price
  - "What would have happened" uses intraday or daily data with no look-ahead and includes fees and slippage
- **Follow:** source follow toggles, add a source, live YouTube feeds, log a setup (from the feed, manually or from a paste-import), Setup Freshness Engine (5 labels), Evidence Scorecard (stats only after 5 complete records), Copy to Practice Journal, outcome tracking
- **My Trades:** actual, practice and hypothetical trades in separate groups; open trades get unrealised P&L at the delayed price; realised P&L only from a recorded exit; flags (stop/target hit, moved since assessment); auto-refresh every 2 minutes
- **Learn:** optional accordion topics

## Round 2 (2026-10-31)
- ASX watchlist (per market) with "rises to" / "falls to" alert levels; the watchlist is shown first in "Stocks worth reviewing"
- Price alerts: background check every 2 min on watchlist levels and open actual/practice trades' stop/target; header bell, toasts, optional browser notifications; no duplicate alerts
- Calendar on Today: ForexFactory weekly economic events (AUD, plus high-impact USD/CNY flagged as indirect for ASX; USD for US) and Yahoo earnings/dividend dates for watchlist + open trades; also fed into AI assessments
- Live channels: public Telegram channels via t.me/s (no token), polled every 2 min; explicit-ticker messages are auto-imported as setups with links. Discord and private Telegram are coded but SWITCHED OFF (user chose no tokens)
- App guide in Learn (#guide), linked from Today

## Backlog
- P1: per-position first-hour movement; ASX company announcement dates (needs a paid/keyed source)
- P2: Discord/private Telegram if tokens are ever provided; shadcn date-time pickers; journal CSV export
