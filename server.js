const express = require('express');
const cors = require('cors');
const fs = require('fs');
const { exec } = require('child_process');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken'); // Added JWT

const app = express();
app.use(cors()); 
app.use(express.json());

// 🔴 SECRET KEY: Store this in Render Environment Variables! 
// IMPORTANT: Both servers MUST use the exact same secret string!
const JWT_SECRET = process.env.JWT_SECRET || "logicsilicon_secure_jwt_key_2024";
const GOOGLE_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbzhtk4rISUDJvMb3nLzJq2CBY5cVnm9kAnL_fuW77MLOkoR0-_dS0nKtmCwBjpD3mpAnQ/exec";

// ==========================================
// 1. AUTHENTICATION ENDPOINT
// ==========================================
app.post('/login', async (req, res) => {
    const { email, authString, role } = req.body;

    try {
        const googleResponse = await fetch(GOOGLE_WEB_APP_URL, {
            method: 'POST', 
            headers: {'Content-Type': 'text/plain'}, 
            body: JSON.stringify({ 
                action: 'login', 
                role: role || 'student', 
                email: email, 
                authString: authString 
            })
        });

        const data = await googleResponse.json();

        if (data.status === 'success') {
            const token = jwt.sign(
                { email: email, role: role || 'student' }, 
                JWT_SECRET, 
                { expiresIn: '24h' }
            );

            res.json({ status: 'success', token: token, user: { email, role: role || 'student' } });
        } else {
            res.status(401).json({ status: 'error', message: 'Invalid credentials.' });
        }
    } catch (error) {
        console.error("Auth Error:", error);
        res.status(500).json({ status: 'error', message: 'Internal server error during authentication.' });
    }
});

// ==========================================
// 2. SECURITY MIDDLEWARE
// ==========================================
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Extract token from "Bearer <token>"

    if (!token) return res.status(401).json({ error: "Access Denied: No JWT Token Provided." });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: "Access Denied: Invalid or Expired Token." });
        req.user = user;
        next();
    });
}

// ==========================================
// 3. SECURED SYNTHESIS ENDPOINT
// ==========================================
// Added 'authenticateToken' to block unauthorized requests
app.post('/api/synthesize', authenticateToken, (req, res) => {
    const verilogCode = req.body.code;

    if (!verilogCode) {
        return res.status(400).json({ error: "No Verilog code provided" });
    }

    const uniqueId = crypto.randomBytes(8).toString('hex');
    const vFile = path.join(__dirname, `temp_${uniqueId}.v`);
    const jsonFile = path.join(__dirname, `temp_${uniqueId}.json`);

    try {
        fs.writeFileSync(vFile, verilogCode);

        const yosysCommand = `
		yosys -p "
		read_verilog -sv ${vFile};
		hierarchy -auto-top;
		proc;
		opt;
		write_json ${jsonFile};
		"
	`;

        exec(yosysCommand, { timeout: 10000 }, (error, stdout, stderr) => {
            if (fs.existsSync(vFile)) fs.unlinkSync(vFile);

            if (error) {
                console.error(`[${uniqueId}] Yosys Error:`, stderr || error.message);
                if (fs.existsSync(jsonFile)) fs.unlinkSync(jsonFile);
                return res.status(500).json({ error: "Compilation failed", details: stderr || error.message });
            }

            if (fs.existsSync(jsonFile)) {
                const netlistData = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
                res.json({ status: "success", netlist: netlistData });
                fs.unlinkSync(jsonFile);
            } else {
                res.status(500).json({ error: "Yosys failed to generate JSON netlist." });
            }
        });
    } catch (err) {
        if (fs.existsSync(vFile)) fs.unlinkSync(vFile);
        if (fs.existsSync(jsonFile)) fs.unlinkSync(jsonFile);
        res.status(500).json({ error: "Server error during synthesis prep." });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Secured LogicSilicon Yosys API running on port ${PORT}`);
});