const axios = require('axios');

async function followLink(url, lastUrl = null) {
    try {
        const response = await axios.get(url, {maxRedirects: 0});
    } catch (error) {
        if (error.response && error.response.status === 302) {
            const redirectUrl = error.response.headers.location;
            return await followLink(redirectUrl, url);
        }
        return lastUrl;
    }
    return url;
}

async function followLinks(urls) {
    const finalUrls = [];
    for (let url of urls) {
        const finalUrl = await followLink(url);
        finalUrls.push(finalUrl);
    }
    return finalUrls;
}

module.exports = {
    followLink,
    followLinks
}