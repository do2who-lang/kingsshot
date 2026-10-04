import './style.css';
import { Game } from './game/Game.js';

const canvas = document.getElementById('scene');
const game = new Game(canvas);
game.run();

// Handy for tinkering in the devtools console.
window.game = game;
