const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Enable CORS so connections from any network work smoothly
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const activeRooms = new Map();
const TWENTY_HOURS = 20 * 60 * 60 * 1000; 

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Helper function to generate a clean, readable Unique ID
function generateShortId() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No confusing characters like O/0/I/1
    let result = '';
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Feature 2: Create room and get Unique ID
    socket.on('create-room', ({ username }) => {
        const roomId = generateShortId();
        
        activeRooms.set(roomId, {
            createdAt: Date.now(),
            users: [{ socketId: socket.id, username }]
        });

        socket.join(roomId);
        socket.emit('room-created', { roomId, username });

        // Feature 3: Automatically delete room after 20 hours
        setTimeout(() => {
            if (activeRooms.has(roomId)) {
                io.to(roomId).emit('room-expired');
                activeRooms.delete(roomId);
            }
        }, TWENTY_HOURS);
    });

    // Feature 4: Connect to a friend via Unique ID
    socket.on('join-room', ({ roomId, username }) => {
        const cleanedRoomId = roomId.trim().toUpperCase();
        
        if (!activeRooms.has(cleanedRoomId)) {
            return socket.emit('error-msg', 'Chat ID not found or expired.');
        }

        const room = activeRooms.get(cleanedRoomId);
        
        if (room.users.length >= 2) {
            return socket.emit('error-msg', 'This private room is already full.');
        }

        room.users.push({ socketId: socket.id, username });
        socket.join(cleanedRoomId);

        io.to(cleanedRoomId).emit('peer-connected', { 
            msg: `${username} connected to the chat. Room active for 20 hours!`,
            roomId: cleanedRoomId
        });
    });

    // Handle incoming messages
    socket.on('send-message', ({ roomId, message, sender }) => {
        io.to(roomId).emit('receive-message', {
            sender,
            message,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
    });

    // Disconnect handler
    socket.on('disconnect', () => {
        for (let [roomId, room] of activeRooms.entries()) {
            const userIndex = room.users.findIndex(u => u.socketId === socket.id);
            if (userIndex !== -1) {
                const leavingUser = room.users[userIndex].username;
                room.users.splice(userIndex, 1);
                
                io.to(roomId).emit('peer-disconnected', `${leavingUser} left the chat.`);
                
                if (room.users.length === 0) {
                    activeRooms.delete(roomId);
                }
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
