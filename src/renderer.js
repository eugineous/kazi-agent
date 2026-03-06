const chatContainer = document.getElementById('chatContainer');
const commandInput = document.getElementById('commandInput');
const sendBtn = document.getElementById('sendBtn');
const tokenCount = document.getElementById('tokenCount');

let tokens = parseInt(localStorage.getItem('kaziTokens') || '0');
updateTokenDisplay();

function addMessage(text, type) {
  const msg = document.createElement('div');
  msg.className = `message ${type}`;
  msg.textContent = text;
  chatContainer.appendChild(msg);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

function updateTokenDisplay() {
  tokenCount.textContent = `Tokens: ${tokens.toLocaleString()} / 10,000`;
}

function sendCommand() {
  const command = commandInput.value.trim();
  if (!command) return;
  
  addMessage(command, 'user');
  addMessage('Working on it...', 'status');
  
  window.kazi.sendCommand(command);
  commandInput.value = '';
}

sendBtn.addEventListener('click', sendCommand);
commandInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendCommand();
});

window.kazi.onResponse((response) => {
  // Remove "Working on it..." status
  const statusMsgs = chatContainer.querySelectorAll('.message.status');
  statusMsgs.forEach(m => m.remove());
  
  addMessage(response, 'agent');
  
  // Increment token count
  tokens++;
  localStorage.setItem('kaziTokens', tokens.toString());
  updateTokenDisplay();
});
