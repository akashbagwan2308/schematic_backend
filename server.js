const express = require('express');
const cors = require('cors');
const fs = require('fs');
const { exec } = require('child_process');
const path = require('path');
const crypto = require('crypto');

const app = express();

// Allow requests from your frontend domain (update this later to your specific frontend URL for security)
app.use(cors()); 
app.use(express.json());

app.post('/api/synthesize', (req, res) => {
    const verilogCode = req.body.code;

    if (!verilogCode) {
        return res.status(400).json({ error: "No Verilog code provided" });
    }

    // Generate a unique ID for this specific compilation request
    const uniqueId = crypto.randomBytes(8).toString('hex');
    const vFile = path.join(__dirname, `temp_${uniqueId}.v`);
    const jsonFile = path.join(__dirname, `temp_${uniqueId}.json`);

    try {
        // 1. Write Verilog code to a temporary file
        fs.writeFileSync(vFile, verilogCode);

        // 2. Build the Yosys command
        const yosysCommand = `yosys -p "read_verilog ${vFile}; prep; write_json ${jsonFile}"`;

        // 3. Execute Yosys (with a 10-second timeout to prevent server hanging)
        exec(yosysCommand, { timeout: 10000 }, (error, stdout, stderr) => {
            
            // Immediately clean up the Verilog file
            if (fs.existsSync(vFile)) fs.unlinkSync(vFile);

            if (error) {
                console.error(`[${uniqueId}] Yosys Error:`, stderr || error.message);
                // Also clean up JSON if it somehow generated but threw an error
                if (fs.existsSync(jsonFile)) fs.unlinkSync(jsonFile);
                return res.status(500).json({ error: "Compilation failed", details: stderr || error.message });
            }

            // 4. Read the generated JSON and send it back
            if (fs.existsSync(jsonFile)) {
                const netlistData = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
                res.json({ status: "success", netlist: netlistData });
                
                // Clean up the JSON file
                fs.unlinkSync(jsonFile);
            } else {
                res.status(500).json({ error: "Yosys failed to generate JSON netlist." });
            }
        });
    } catch (err) {
        // Fallback cleanup in case file writing fails
        if (fs.existsSync(vFile)) fs.unlinkSync(vFile);
        if (fs.existsSync(jsonFile)) fs.unlinkSync(jsonFile);
        res.status(500).json({ error: "Server error during synthesis prep." });
    }
});

// Render dynamically assigns a PORT, default to 3000 for local testing
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`LogicSilicon Yosys API running on port ${PORT}`);
});