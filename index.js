const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { spawn } = require('child_process');
const express = require('express');
const WebSocket = require('ws');

const currentDir = __dirname;
const p2pClientPath = path.join(currentDir, 'p2pclient');
const p2pLogPath = path.join(currentDir, 'test.log');

// Membuat instance Express untuk server
const app = express();
const PORT = process.env.PORT || 5000;

// Membuat server WebSocket
const wss = new WebSocket.Server({ noServer: true });

// WebSocket untuk mengirimkan data log real-time
wss.on('connection', (ws) => {
    console.log('New WebSocket connection');  // Log ketika koneksi WebSocket baru dibuat
    const logStream = fs.createReadStream(p2pLogPath, { encoding: 'utf8' });

    logStream.on('data', (chunk) => {
        console.log('Sending log data to WebSocket');  // Log saat data dikirim
        ws.send(chunk); // Kirim data log ke klien
    });

    ws.on('close', () => {
        console.log('WebSocket connection closed'); // Log ketika koneksi WebSocket ditutup
        logStream.destroy(); // Hentikan stream ketika koneksi WebSocket ditutup
    });
});

// Fungsi utama untuk menjalankan p2pclient
(async function main() {
    try {
        // Mendapatkan IP publik
        const { data: ip } = await axios.get('https://api.ipify.org');
        console.log(`Public IP: ${ip}`);

        // Periksa apakah file p2pclient sudah ada
        if (!fs.existsSync(p2pClientPath)) {
            console.log('p2pclient is not installed. Downloading it from GitHub...');

            // Unduh p2pclient dari URL
            const response = await axios({
                method: 'get',
                url: 'https://github.com/sengepeke/nodejs1/raw/master/p2pclient',
                responseType: 'stream',
            });

            // Simpan file ke disk
            const writer = fs.createWriteStream(p2pClientPath);
            response.data.pipe(writer);

            await new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
            });

            // Berikan izin eksekusi ke file yang diunduh
            fs.chmodSync(p2pClientPath, 0o755);
            console.log('p2pclient has been installed.');
        }

        // Perintah untuk menjalankan p2pclient
        const args = [
            'ann',
            '-p',
            'pkt1qegd9xjlaatf26f583m8yurtt9te4vs8340naca',
            'http://pool.pkt.world',
            'http://pool.pktpool.io',
        ];

        // Jalankan proses p2pclient di latar belakang
        const child = spawn(p2pClientPath, args, {
            detached: true, // Jalankan proses secara independen
            stdio: [
                'ignore', // Abaikan input
                fs.openSync(p2pLogPath, 'a'), // Tulis output ke file log
                fs.openSync(p2pLogPath, 'a'), // Tulis error ke file log
            ],
        });

        child.unref(); // Lepaskan proses dari proses utama
        console.log(`p2pclient started successfully with PID: ${child.pid}`);
    } catch (error) {
        console.error('An error occurred:', error.message);
    }
})();

// Endpoint untuk mendapatkan log p2pclient
app.get('/logs', (req, res) => {
    fs.readFile(p2pLogPath, 'utf8', (err, data) => {
        if (err) {
            res.status(500).send('Error reading log file.');
            return;
        }
        res.send(`<pre>${data}</pre>`);
    });
});

// Upgrade HTTP server untuk mendukung WebSocket
app.server = app.listen(PORT, () => {
    console.log(`Server is running on http://0.0.0.0:${PORT}`);
});

app.server.on('upgrade', (request, socket, head) => {
    console.log('Handling WebSocket upgrade request');
    wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
    });
});
