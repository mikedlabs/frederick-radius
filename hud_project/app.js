// HUD Logic and Live OSC Data via WebSockets
const socket = io();

function updateClock() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { hour12: false });
    document.getElementById('clock').textContent = timeStr;
}

setInterval(updateClock, 1000);
updateClock();

// Live Show Control Trigger sent to the Node.js Bridge -> Python Brain
function triggerOSC(path) {
    console.log(`Sending OSC Message to ${path}`);
    
    // We emit to socket.io. The server.js forwards it to python via node-osc
    socket.emit('osc_send', { address: path, args: [1] });
    
    // Log it in the MIDI/OSC panel
    const logContainer = document.getElementById('midi-log');
    const entry = document.createElement('p');
    entry.className = 'log-entry';
    entry.style.color = '#00f2fe';
    entry.textContent = `[HUD TX] ${path}`;
    
    logContainer.appendChild(entry);
    logContainer.scrollTop = logContainer.scrollHeight;
}

// Simulated Incoming MIDI data from the Raspberry Pi (for demo purposes)
setInterval(() => {
    if(Math.random() > 0.7) {
        const logContainer = document.getElementById('midi-log');
        const entry = document.createElement('p');
        entry.className = 'log-entry';
        
        const cc = Math.floor(Math.random() * 127);
        const val = Math.floor(Math.random() * 127);
        entry.textContent = `[PI RX] MIDI CC: ${cc} VAL: ${val} (from 192.168.0.168)`;
        
        logContainer.appendChild(entry);
        
        if (logContainer.children.length > 20) {
            logContainer.removeChild(logContainer.firstChild);
        }
        logContainer.scrollTop = logContainer.scrollHeight;
    }
}, 2000);
