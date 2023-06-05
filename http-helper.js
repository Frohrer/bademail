const axios = require('axios');
const { logger } = require('./logger.js')

async function followLink(url, lastUrl = null) {
    try {
        let response = await axios.get(url, {maxRedirects: 0, timeout: 5000});
    } catch (error) {
        if (error.response && error.response.status === 302) {
            let redirectUrl = error.response.headers.location;
            return await followLink(redirectUrl, url);
        } else {
            logger.error(`Unexpected Axios error when trying to follow a link: ${error} for ${url}`)
            return url
        }
        return lastUrl;
    }
    return url;
}

async function followLinks(urls) {
    let finalUrls = [];
    for (let url of urls) {
        let finalUrl = await followLink(url);
        finalUrls.push(finalUrl);
    }
    return finalUrls;
}

module.exports = {
    followLink,
    followLinks
}