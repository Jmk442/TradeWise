# TradeWise (iOS)

An action-first day-trading research companion for a teenager who already trades through his own broker. It shows market info and followed-trader setups, assesses a proposed or completed buy, and tracks results. It never executes trades.

## Who it's for
A teenage trader in Australia with an existing broker account who wants fast, practical information instead of lessons. Single user, single device, no login.

## Core features and experience
- **Today**: market status and events, up to three documented trader setups (with source, time, price condition, risk, freshness status), stocks worth reviewing, positions needing review. If nothing is verified, it says so.
- **Analyse (Check My Buy)**: enter a ticker, optionally price and quantity. Returns positive factors, negatives, bullish/neutral/bearish scenarios (no invented probabilities), key price levels, news, missing information, and a short bottom line. Expandable "Why?". Includes "What would have happened?" historical replay.
- **Follow**: TraderTV Live, SMB Capital and Bear Bull Traders as candidate sources, selectable. Setups are entered manually with links and timestamps (no unauthorised scraping). Freshness labels, an evidence scorecard, and "Copy to Practice Journal".
- **My Trades**: manual entry of real and simulated trades, kept visibly separate. Shows latest price, estimated gain/loss, and the original assessment compared with what happened. Realised results need exit details.
- **Learn**: separate optional tab. No pop-ups, quizzes or forced lessons.
- Market selector: ASX (default) or US, with matching currency, hours and holidays. US commentary is not presented as applying to ASX shares.

## User flow
Open the app, see the briefing, tap Check My Buy, enter a ticker, read the result, record the trade, and later review the result in My Trades.

## UI/UX feel
Dark navy/charcoal with teal accents, compact cards, large touch targets, clean charts, plain English, optional light mode. Five bottom tabs: Today, Analyse, Follow, My Trades, Learn.

## Implementation phases
1. **MVP (built now)**: all five tabs, ASX/US selection, free delayed market data with delay labels, AI assessments (GPT 5.5) grounded in retrieved data, manual trader setups, trade tracking with automatic price updates, saved scenarios compared with outcomes, historical replay. Anything on demo data is clearly labelled.
2. **Integrations**: permitted trader-content feeds, better data sources, stronger source verification.
3. **Enhancements**: watchlist alerts, better forecast measurement, trader comparisons, settings.

## Assumptions
- iOS-first mobile app (Expo), not web or Vercel.
- Data is stored on the device only, with no accounts. Trades are lost if the app is deleted.
- Free delayed data may have gaps for ASX; the app shows "delayed/unavailable" rather than guessing.
- Trader setups are manual entry only in this phase.
- No real-money execution or brokerage connection. Includes a general-information, not-financial-advice notice.
- Legal review for under-18 use in Australia is left to the family before wider release.
