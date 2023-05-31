const fs = require('fs');
const { logger } = require('../logger.js')
const path = require('path');

function loadSettings() {
    try {
        // Initialize empty settings
        let settings = {
            allowlist: [],
            blocklist: [],
        };

        // Check if settings file exists
        const settingsPath = path.resolve('./settings/settings.json');
        if (fs.existsSync(settingsPath)) {
            // Read the settings file
            const data = fs.readFileSync(settingsPath, 'utf8');

            // Parse the JSON data
            settings = JSON.parse(data);
        }

        // Check if allowlist file exists
        const allowlistPath = path.resolve('./settings/allowlist.txt');
        if (fs.existsSync(allowlistPath)) {
            // Read the allowlist file
            const allowlistData = fs.readFileSync(allowlistPath, 'utf8');

            // Check if file is not empty
            if (allowlistData.trim()) {
                const allowlist = allowlistData.replaceAll('\r','').split('\n');
                settings.allowlist = allowlist;
            }
        }

        // Check if blocklist file exists
        const blocklistPath = path.resolve('./settings/blocklist.txt');
        if (fs.existsSync(blocklistPath)) {
            // Read the blocklist file
            const blocklistData = fs.readFileSync(blocklistPath, 'utf8');

            // Check if file is not empty
            if (blocklistData.trim()) {
                const blocklist = blocklistData.replaceAll('\r','').split('\n');
                settings.blocklist = blocklist;
            }
        }

        // Return the updated settings
        return settings;
    } catch (err) {
        logger.error(`Error reading or parsing file: ${err}`);
        return null;
    }
}

module.exports = {
    loadSettings
}
