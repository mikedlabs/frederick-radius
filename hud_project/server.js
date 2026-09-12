const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Client, Server: OscServer } = require('node-osc');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files from the current directory
app.use(express.static(__dirname));

// The Python Brain listens on 9000
const oscClient = new Client('127.0.0.1', 9000);

// We can also listen for OSC from the Brain to update the HUD if we wanted to
// const oscServer = new OscServer(3001, '0.0.0.0', () => {
//     console.log('HUD OSC Server listening on 3001');
// });

io.on('connection', (socket) => {
    console.log('📱 A user connected to the Web HUD');

    // Receive commands from the Web UI and forward them to the Python Brain via OSC
    socket.on('osc_send', (data) => {
        console.log(`[HUD -> BRAIN] ${data.address} : ${data.args || ''}`);
        oscClient.send(data.address, data.args || []);
    });

    socket.on('disconnect', () => {
        console.log('📱 User disconnected from the Web HUD');
    });
});

const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 Web HUD & OSC Bridge is running on http://0.0.0.0:${PORT}`);
    console.log(`You can open this IP address on your iPad to control the rig!`);
});
