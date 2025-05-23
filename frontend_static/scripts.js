let board = Array(9).fill('');
let currentPlayer = 'X';
let gameMode = null;
let ws = null;
let mySymbol = '';
let opponentSymbol = '';
let wins = 0;
let losses = 0;
let draws = 0;
let hasRematched = false;
let rematchTimerId = null;
let currentTurn = '';
let moveTimerInterval = null;
let moveDeadline = null;
const MOVE_TIMEOUT = 15;
const REMATCH_DURATION = 15;


document.addEventListener('DOMContentLoaded', () => {
  document
    .getElementById('quick-game-btn')
    .addEventListener('click', startQuickGame);
  document
    .getElementById('offline-game-btn')
    .addEventListener('click', startOfflineGame);
  document
    .getElementById('play-again-btn')
    .addEventListener('click', playAgain);
  document
    .getElementById('back-to-main-btn')
    .addEventListener('click', backToMain);
  document
    .getElementById('cancel-search-btn')
    .addEventListener('click', cancelSearch);

  const saved = JSON.parse(localStorage.getItem('savedGame'));
  if (saved && saved.gameMode === 'online') {
    console.log('Restoring saved online game...');
    restoreOnlineGame(saved);
  } else {
    fetch('/api/nickname', { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        document.getElementById('nickname').textContent = `Hello, ${data.nickname}!`;
      });

    loadStats();
    setInterval(loadStats, 60000);
    renderBoard();
  }
});

async function loadStats() {
  try {
    const res = await fetch('/api/stats', { credentials: 'include' });
    if (!res.ok) {
      throw new Error('Failed to fetch stats');
    }
    const data = await res.json();

    const statsDiv = document.getElementById('stats');
    let statsText = '';

    if (data.online > 0) {
      statsText += `Online: ${data.online}`;
    }
    if (data.active_games > 0) {
      if (statsText.length > 0) statsText += ' | ';
      statsText += `Active Games: ${data.active_games}`;
    }

    statsDiv.textContent = statsText || 'No active users or games';
  } catch (err) {
    console.error('Failed to load stats:', err);
  }
}

function renderBoard() {
  const boardDiv = document.getElementById('game-board');

  if (boardDiv.querySelectorAll('.cell').length === 0) {
    for (let idx = 0; idx < 9; idx++) {
      const cellDiv = document.createElement('div');
      cellDiv.classList.add('cell');
      cellDiv.dataset.index = idx;

      cellDiv.addEventListener('click', () => handleCellClick(idx));

      cellDiv.addEventListener('mouseenter', () => {
        if (!board[idx] && !cellDiv.querySelector('.preview')) {
          if (gameMode === 'offline' || (gameMode === 'online' && mySymbol === getCurrentTurn())) {
            const previewSpan = document.createElement('span');
            previewSpan.classList.add('preview', getCurrentTurn() === 'X' ? 'x' : 'o');
            cellDiv.appendChild(previewSpan);
          }
        }
      });


      cellDiv.addEventListener('mouseleave', () => {
        const preview = cellDiv.querySelector('.preview');
        if (preview) preview.remove();
      });

      boardDiv.appendChild(cellDiv);
    }

    const vLine1 = document.createElement('div');
    vLine1.classList.add('vertical-line');
    const vLine2 = document.createElement('div');
    vLine2.classList.add('vertical-line-right');
    const hLine1 = document.createElement('div');
    hLine1.classList.add('horizontal-line');
    const hLine2 = document.createElement('div');
    hLine2.classList.add('horizontal-line-bottom');

    boardDiv.appendChild(vLine1);
    boardDiv.appendChild(vLine2);
    boardDiv.appendChild(hLine1);
    boardDiv.appendChild(hLine2);
  }

  const cells = boardDiv.querySelectorAll('.cell');
  board.forEach((cell, idx) => {
    const cellDiv = cells[idx];

    const preview = cellDiv.querySelector('.preview');
    if (preview) preview.remove();

    if (cell && !cellDiv.querySelector('span:not(.preview)')) {
      const markSpan = document.createElement('span');
      markSpan.classList.add(cell === 'X' ? 'x' : 'o');
      cellDiv.appendChild(markSpan);
      setTimeout(() => {
        cellDiv.classList.add('show');
      }, 10);
    }
  });
}

async function startQuickGame() {
  console.log('Starting Quick Game...');
  gameMode = 'online';

  document.querySelector('header').classList.add('hidden');
  document.getElementById('nickname').classList.add('hidden');
  document.getElementById('stats').classList.add('hidden');
  document.getElementById('menu').classList.add('hidden');
  document.getElementById('cancel-search-btn').classList.remove('hidden');
  hideSideGifs();

  updateStatus('Searching for opponent...');


  try {
    const res = await fetch('/api/nickname', { credentials: 'include' });
    if (!res.ok) {
      throw new Error('Failed to fetch nickname');
    }
    const data = await res.json();
    console.log('Nickname confirmed:', data.nickname);
  } catch (err) {
    console.error('Cannot start game without nickname/session.', err);
    return;
  }

  ws = new WebSocket(`ws://${location.host}/ws`);

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'find_match' }));
  };
  setupWebSocketHandlers();
}

function startOfflineGame() {
  console.log('Starting Offline Game...');
  gameMode = 'offline';

  document.querySelector('header').classList.add('hidden');
  document.getElementById('nickname').classList.add('hidden');
  document.getElementById('stats').classList.add('hidden');
  document.getElementById('menu').classList.add('hidden');
  document.getElementById('game-board').classList.remove('hidden');
  hideSideGifs();

  board = Array(9).fill('');
  currentPlayer = 'X';
  mySymbol = 'X';
  opponentSymbol = 'O';
  showStartScreen();
}

function handleCellClick(idx) {
  if (board[idx]) return;
  if (!document.getElementById('restart-menu').classList.contains('hidden')) return;

  if (gameMode === 'offline') {
    board[idx] = currentPlayer;
    renderBoard();

    const winningPattern = checkWin(currentPlayer);

    if (winningPattern) {
      highlightWinningCells(winningPattern);
      updateStatus(`${currentPlayer} wins!`);
      endGame();
    } else if (board.every(cell => cell)) {
      updateStatus('Draw!');
      endGame();
    } else {
      currentPlayer = currentPlayer === 'X' ? 'O' : 'X';
      updateStatus(`Turn: ${currentPlayer}`);
    }
  }

  if (gameMode === 'online') {
    if (!ws || mySymbol !== currentTurn) return;
    board[idx] = mySymbol;
    renderBoard();

    localStorage.setItem('savedGame', JSON.stringify({
      gameMode,
      mySymbol,
      opponentSymbol,
      board
    }));

    ws.send(JSON.stringify({ type: 'move', cell: idx }));
  }
}

function getCurrentTurn() {
  const xCount = board.filter(c => c === 'X').length;
  const oCount = board.filter(c => c === 'O').length;
  return xCount <= oCount ? 'X' : 'O';
}

function checkWin(symbol) {
  const winPatterns = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ];
  for (const pattern of winPatterns) {
    if (pattern.every(idx => board[idx] === symbol)) {
      return pattern;
    }
  }
  return null;
}

function highlightWinningCells(winningPattern) {
  const cells = document.querySelectorAll('.cell');

  winningPattern.forEach(idx => {
    cells[idx].classList.add('highlight');
  });

  cells.forEach((cell, idx) => {
    if (!winningPattern.includes(idx)) {
      cell.classList.add('dim');
    }
  });

  setTimeout(() => {
    cells.forEach(cell => {
      cell.classList.remove('highlight', 'dim');
    });
  }, 3000);
}

function updateStatus(text) {
  document.getElementById('game-status').textContent = text;
}

function endGame() {
  document.getElementById('restart-menu').classList.remove('hidden');
}

function playAgain() {
  if (gameMode === 'offline') {
    board = Array(9).fill('');
    currentPlayer = 'X';
    mySymbol = 'X';
    opponentSymbol = 'O';

    const boardDiv = document.getElementById('game-board');
    const cells = boardDiv.querySelectorAll('.cell');
    cells.forEach(cell => {
      cell.innerHTML = '';
      cell.classList.remove('show');
    });

    document.getElementById('restart-menu').classList.add('hidden');
    updateStatus('Offline Game started. You are X.');
    renderBoard();
  } else {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'request_rematch' }));
      updateStatus('Waiting for opponent to accept rematch...');
      document.getElementById('restart-menu').classList.add('hidden');
    }
  }
}

function backToMain() {
  hasRematched = false;
  clearInterval(rematchTimerId);
  window.location.href = '/';
  showSideGifs();
}

function cancelSearch() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'cancel_match' }));
    ws.close();
  }
  backToMain();
}

function updateScore() {
  const scoreDiv = document.getElementById('game-score');
  if (!scoreDiv) return;

  scoreDiv.textContent = `Wins: ${wins} | Losses: ${losses} | Draws: ${draws}`;
}

function showRematchDialog() {
  const box = document.getElementById('rematch-box');
  box.classList.remove('hidden');

  const prog = box.querySelector('.timer-progress');
  prog.style.width = '100%';
  prog.classList.remove('blink');

  let remaining = REMATCH_DURATION;
  clearInterval(rematchTimerId);
  rematchTimerId = setInterval(() => {
    remaining--;
    const pct = (remaining / REMATCH_DURATION) * 100;
    prog.style.width = pct + '%';

    if (remaining <= 5) {
      prog.classList.add('blink');
    }
    if (remaining <= 0) {
      clearInterval(rematchTimerId);
      box.classList.add('hidden');
      backToMain();
    }
  }, 1000);

  const acceptBtn = document.getElementById('accept-rematch-btn');
  const declineBtn = document.getElementById('decline-rematch-btn');

  acceptBtn.onclick = () => {
    ws.send(JSON.stringify({ type: 'accept_rematch' }));
    clearInterval(rematchTimerId);
    box.classList.add('hidden');
  };

  declineBtn.onclick = () => {
    ws.send(JSON.stringify({ type: 'decline_rematch' }));
    clearInterval(rematchTimerId);
    box.classList.add('hidden');
  };
}

function startNewGame() {
  board = Array(9).fill('');
  const boardDiv = document.getElementById('game-board');
  const cells = boardDiv.querySelectorAll('.cell');
  cells.forEach(cell => {
    cell.innerHTML = '';
    cell.classList.remove('show');
  });
  document.getElementById('restart-menu').classList.add('hidden');
  updateStatus(mySymbol === 'X' ? "Your turn" : "Opponent's turn");
  renderBoard();
}

function restoreOnlineGame(saved) {
  gameMode = 'online';
  mySymbol = saved.mySymbol;
  opponentSymbol = saved.opponentSymbol;

  document.querySelector('header').classList.add('hidden');
  document.getElementById('nickname').classList.add('hidden');
  document.getElementById('stats').classList.add('hidden');
  document.getElementById('menu').classList.add('hidden');
  document.getElementById('cancel-search-btn').classList.add('hidden');
  document.getElementById('restart-menu').classList.add('hidden');
  document.getElementById('game-board').classList.remove('hidden');

  ws = new WebSocket(`ws://${location.host}/ws`);
  ws.onopen = () => {
    console.log('WebSocket reconnected');
    ws.send(JSON.stringify({ type: 'rejoin_match' }));
  };
  setupWebSocketHandlers();
  const stored = parseInt(localStorage.getItem('moveDeadline'), 10);
  if (stored) {
    const now = Date.now();
    if (stored <= now) {
      handleMoveTimeout();
    }
  }
}

function showStartScreen() {
  document.getElementById('game-status').textContent = '';
  const screen = document.getElementById('game-start-screen');
  const text = document.getElementById('game-start-text');
  const board = document.getElementById('game-board');

  screen.classList.remove('hidden');
  text.classList.remove('hidden');
  board.classList.add('hidden');

  setTimeout(() => {
    screen.classList.add('show');
  }, 100);

  setTimeout(() => {
    text.classList.add('show');
  }, 2000);

  setTimeout(() => {
    text.textContent = "GO!";
  }, 3200);

  setTimeout(() => {
    screen.classList.add('fade-out');
    text.classList.remove('show');
  }, 3800);

  setTimeout(() => {
    screen.classList.remove('show', 'fade-out');
    screen.classList.add('hidden');
    text.classList.add('hidden');
    board.classList.remove('hidden');

    renderBoard();
    updateStatus('Offline Game started. You are X.');
  }, 4300);
}

function setupWebSocketHandlers() {
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    console.log('Received WS message:', msg);
    console.log('TYPE RECEIVED:', msg.type);

    switch (msg.type) {

      case 'game_state': {
        board = msg.board;
        renderBoard();
        currentTurn = msg.turn;

        if (msg.isFinished) {
          updateStatus(msg.winner ? `${msg.winner} wins!` : 'Draw!');
          endGame();
          localStorage.removeItem('savedGame');
          stopMoveTimer();
        } else {
          updateStatus(
            currentTurn === mySymbol
              ? "Your turn"
              : "Opponent's turn"
          );
          if (currentTurn === mySymbol) {
            const stored = parseInt(localStorage.getItem('moveDeadline'), 10);
            const now = Date.now();
            if (stored && stored > now) {
              startMoveTimer((stored - now) / 1000);
            } else {
              if (stored && stored <= now) {
                handleMoveTimeout();
              } else {
                startMoveTimer();
              }
            }
          } else {
            stopMoveTimer();
          }
        }
        break;
      }

      case 'match_found': {
        mySymbol = msg.symbol;
        opponentSymbol = mySymbol === 'X' ? 'O' : 'X';
        currentTurn = 'X';

        document.getElementById('cancel-search-btn').classList.add('hidden');
        showStartScreen();

        setTimeout(() => {
          document.getElementById('game-board').classList.remove('hidden');
          board = Array(9).fill('');
          renderBoard();
          updateStatus(`Matched! You are '${mySymbol}'`);
          localStorage.setItem('savedGame', JSON.stringify({
            gameMode: 'online',
            mySymbol,
            opponentSymbol,
            board
          }));
          if (currentTurn === mySymbol) startMoveTimer();
        }, 4300);
        break;
      }
      case 'move_made': {
        board[msg.cell] = msg.by;
        renderBoard();

        currentTurn = msg.by === 'X' ? 'O' : 'X';

        localStorage.setItem('savedGame', JSON.stringify({
          gameMode,
          mySymbol,
          opponentSymbol,
          board
        }));

        updateStatus(
          currentTurn === mySymbol
            ? "Your turn"
            : "Opponent's turn"
        );

        if (currentTurn === mySymbol) {
          const stored = parseInt(localStorage.getItem('moveDeadline'), 10);
          const now = Date.now();
          if (stored && stored > now) {
            startMoveTimer((stored - now) / 1000);
          } else {
            if (stored && stored <= now) {
              handleMoveTimeout();
            } else {
              startMoveTimer();
            }
          }
        } else {
          stopMoveTimer();
        }
        break;
      }

      case 'game_over': {
        updateStatus(
          msg.result === 'draw'
            ? "Draw!"
            : `${msg.result} wins!`
        );
        if (msg.result === 'draw') draws++;
        else if (msg.result === mySymbol) wins++;
        else losses++;
        updateScore();
        endGame();

        setTimeout(() => {
          if (msg.result !== 'draw' && msg.winningPattern) {
            highlightWinningCells(msg.winningPattern);
          }
        }, 200);

        localStorage.removeItem('savedGame');
        stopMoveTimer();
        break;
      }
      case 'opponent_left': {
        updateStatus("Opponent disconnected!");
        endGame();
        stopMoveTimer();
        break;
      }
      case 'rematch_requested':
        showRematchDialog();
        break;
      case 'rematch':
        hasRematched = true;
        mySymbol = msg.symbol;
        opponentSymbol = msg.opponent;
        currentTurn = 'X';
        startNewGame();
        if (currentTurn === mySymbol) startMoveTimer();
        break;
      case 'rematch_declined':
        if (!hasRematched) {
          updateStatus('Opponent declined rematch.');
          setTimeout(backToMain, 3000);
        }
        break;

      case 'error':
        if (msg.message === 'no active game') {
          localStorage.removeItem('savedGame');
          backToMain();
        } else {
          console.error('Server error:', msg.message);
        }
        break;

      default:
        console.warn('Unhandled message type:', msg.type);
    }
  };

  ws.onclose = () => {
    console.log('WebSocket closed');
    stopMoveTimer();
    if (gameMode === 'online') {
      updateStatus('Disconnected from server');
    }
  };
}

function startMoveTimer(seconds = MOVE_TIMEOUT) {
  const bar  = document.getElementById('move-timer');
  const prog = document.getElementById('move-timer-progress');
  const now  = Date.now();
  moveDeadline = now + seconds*1000;
  localStorage.setItem('moveDeadline', moveDeadline);

  bar.classList.remove('hidden');
  prog.classList.remove('blink-slow','blink-med','blink-fast');

  clearInterval(moveTimerInterval);
  moveTimerInterval = setInterval(() => {
    const remainingMs = moveDeadline - Date.now();
    if (remainingMs <= 0) {
      clearInterval(moveTimerInterval);
      bar.classList.add('hidden');
      prog.classList.remove('blink-slow','blink-med','blink-fast');
      localStorage.removeItem('moveDeadline');
      handleMoveTimeout();
    } else {
      const pct = (remainingMs / (MOVE_TIMEOUT*1000)) * 100;
      prog.style.width = `${pct}%`;

      prog.classList.remove('blink-slow','blink-med','blink-fast');
      if (remainingMs <= 1000) {
        prog.classList.add('blink-fast');
      } else if (remainingMs <= 3000) {
        prog.classList.add('blink-med');
      } else if (remainingMs <= 5000) {
        prog.classList.add('blink-slow');
      }
    }
  }, 100);
}

function stopMoveTimer() {
  clearInterval(moveTimerInterval);
  document.getElementById('move-timer').classList.add('hidden');
  localStorage.removeItem('moveDeadline');
}

function handleMoveTimeout() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'forfeit' }));
  }
  updateStatus('Time up! You lose.');
  endGame();
  localStorage.removeItem('savedGame');
}

function hideSideGifs() {
  document.querySelectorAll('.side-gif').forEach(img => img.classList.add('hidden'));
}

function showSideGifs() {
  document.querySelectorAll('.side-gif').forEach(img => img.classList.remove('hidden'));
}
