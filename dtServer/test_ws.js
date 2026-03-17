const WebSocket = require('ws');

const url = 'ws://localhost:3000';
console.log(`Connecting to ${url}...`);

const ws = new WebSocket(url);

ws.on('open', function open() {
  console.log('Connected!');
  ws.send(JSON.stringify({ event: 'REQUEST_STATE', data: {} }));
});

ws.on('message', function message(data) {
  console.log('Received message:', data.toString());
  ws.close();
});

ws.on('error', function error(err) {
  console.error('Connection error:', err.message);
});

ws.on('close', function close() {
  console.log('Disconnected');
});

setTimeout(() => {
  if (ws.readyState !== WebSocket.OPEN) {
    console.log('Timeout: Could not connect');
    ws.terminate();
  }
}, 5000);
