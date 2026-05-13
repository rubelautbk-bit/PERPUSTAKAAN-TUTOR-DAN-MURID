// Entry point with Socket.IO support for real-time chat
require('dotenv').config();
const http = require('http');
const { Server } = require('socket.io');
const app = require('./app');
const cron = require('node-cron');

const PORT = process.env.PORT || 3000;
const server = http.createServer(app);
const io = new Server(server);

// Make io accessible in routes
app.set('io', io);

// Socket.IO for chat
io.on('connection', (socket) => {
  socket.on('join-room', (roomId) => {
    socket.join('room-' + roomId);
  });
  socket.on('chat-message', (data) => {
    // data: { roomId, userId, userName, pesan }
    const db = require('./src/db/database');
    const info = db.prepare(
      'INSERT INTO chat_message (room_id, user_id, pesan) VALUES (?,?,?)'
    ).run(data.roomId, data.userId, data.pesan);
    io.to('room-' + data.roomId).emit('new-message', {
      id: info.lastInsertRowid,
      user_id: data.userId,
      name: data.userName,
      pesan: data.pesan,
      created_at: new Date().toISOString(),
    });
  });
});

// Cron: update denda otomatis setiap jam 6 pagi WIB
cron.schedule('0 23 * * *', () => { // 23:00 UTC = 06:00 WIB
  try {
    const { updateDendaOtomatis } = require('./src/utils/denda');
    const { sendBorrowReminders } = require('./src/utils/whatsapp');
    const updated = updateDendaOtomatis();
    console.log(`[CRON] Denda updated: ${updated} peminjaman`);
    sendBorrowReminders().then(n => console.log(`[CRON] WA reminders sent: ${n}`));
  } catch (e) { console.error('[CRON Error]', e); }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n=== E-Library Bimbel Rubela ===`);
  console.log(`Server: http://localhost:${PORT}`);
  console.log(`Demo: admin@rubela.id/admin123 | tutor@rubela.id/tutor123 | murid@rubela.id/murid123\n`);
});
