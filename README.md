# Chromium Games | Arcade Hub 🎮

A sleek, modern, and high-performance collection of classic and original browser games. Built with a focus on neon aesthetics, smooth performance, and a unified gaming experience.

![Chromium Games Preview](https://img.shields.io/badge/Chromium_Games-Arcade_Hub-blueviolet?style=for-the-badge&logo=google-chrome&logoColor=white)
![Status](https://img.shields.io/badge/Status-Active_Development-brightgreen?style=for-the-badge)

## 🌟 Overview

Chromium Games is an "Arcade Hub" that brings together a diverse range of games—from classic arcade staples to modern word-based puzzles. The hub features a highly responsive UI with multiple themes (Cyberpunk, Matrix, Retro), a unified search system, and category filtering.

## 🕹️ Game Library

The project is divided into two main categories:

### 🚀 Classic & Arcade Games (`/games`)
Fast-paced action and strategic classics:
- **3D Drive & Highway:** High-speed driving simulations.
- **Flight Sim:** A browser-based flight experience. **Not currently implemented**
- **Classic Arcades:** Asteroids, Snake, Pong, Flappy Bird, Space Invaders.
- **Strategy & Puzzles:** Chess, Checkers, Tic-Tac-Toe, Solitaire, Poker, Blockudoku, Block Puzzler.

### 🧩 Word & Trivia Games (`/wordGames`)
Brain-teasing puzzles and daily challenges:
- **Wordle & Boggle:** The classic word-finding experiences.
- **Loldle & Earthdle:** Niche guessing games (League of Legends and Geography).
- **Box Office & Video Games:** Trivia based on movies and gaming history.
- **TuneTile:** Music-based puzzle integration.
- **Riddler:** Daily logic and word riddles.

## 🎨 Hub Features

- **Multiple Themes:** Switch between default neon, Cyberpunk, Matrix, and Retro modes.
- **Search & Filter:** Quickly find your favorite games by title or category.
- **Persistent Progress:** Saves your favorites and "Last Played" games locally.
- **Responsive Design:** Optimized for both desktop and mobile browsing.
- **Dynamic Previews:** Interactive canvas-based previews on game cards.

## 🛠️ Technical Stack

- **Frontend:** Vanilla HTML5, CSS3 (Modern Flexbox/Grid), JavaScript (ES6+).
- **Backend/Serverless:** 
  - Netlify Functions for API integrations (iTunes Search, Movie Posters).
  - Node.js `server.js` for local development.
- **Styling:** Custom CSS with CSS variables for theming, Font Awesome for iconography, and Google Fonts (Outfit).
- **Data:** JSON-based game data and local storage for state management.
- **Note** Most data is stored in localStorage this will be ported to a proper database later in           development.

## 🚀 Getting Started

### Local Development
1. Clone the repository:
   ```bash
   git clone https://github.com/Ajdin2004/chromeGamesProject.git
   ```
2. Install dependencies (if any):
   ```bash
   npm install
   ```
3. Run the development server:
   ```bash
   npm start
   ```
4. Open your browser at `http://localhost:3000` (or the port specified in `server.js`).

### Deployment
This project is **hosted on Netlify** and is configured for automatic deploys. 

> ⚠️ **Important:** Pushing directly to the `main` branch will trigger an automatic production deploy. To avoid deploying potentially broken or unfinished versions, **do not push directly to `main`**. Instead, work on a separate branch and only merge into `main` once the changes are verified and ready for production.

For manual deploys, you can use the Netlify CLI:
```bash
netlify deploy --prod
```

## 📂 Project Structure

```text
├── games/           # Action, Arcade, and Strategy games
├── wordGames/       # Word-based and Trivia games
├── netlify/         # Serverless functions for external APIs
├── tests/           # Unit tests for game logic (e.g., Poker evaluation)
├── index.html       # The main Arcade Hub entry point
├── style.css        # Core hub styling and themes
├── server.js        # Simple Node.js dev server
└── netlify.toml     # Netlify configuration
```

## 🤝 Contributing

Feel free to fork the project and submit pull requests for new games or hub features. Bug reports and feature suggestions are welcome via GitHub Issues.

