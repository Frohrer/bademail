const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
const parseUrl = require('parse-url');
const { JSDOM } = require('jsdom');
const { createWorker } = require('tesseract.js');
const { followLink, followLinks } = require('./funx.js')
const { processMaxTokens, processEmail} = require('./gpt-helper.js')
const { logger } = require('./logger.js')

async function remove_before_forwarded(text) {
    // Find the index of the "Begin forwarded message:" string
    const lower_text = text.toLowerCase();
    const index = lower_text.lastIndexOf("forwarded message");
    // Remove everything before the "Begin forwarded message:" string
    if (index !== -1) {
      text = text.substring(index);
    }
  
    // Return the modified text
    return text;
  }

async function remove_consecutive_line_breaks(text) {
    let lines = text.split('\n');
    let nonEmptyLines = [];
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim() !== '') {
            nonEmptyLines.push(lines[i]);
        }
    }
    return nonEmptyLines.join('\n');
}

async function extract_email_fields(text) {
    // Initialize an object to store the extracted fields
    const fields = {};
  
    // Split the text into lines
    const lines = text.split('\n');
  
    // Extract the fields from the lines
    for (let line of lines) {
      // Extract the field name and value
      const field_names = ['from', 'to', 'reply-to', 'subject', 'date'];
      for (let field_name of field_names) {
        if (line.toLowerCase().startsWith(field_name + ':')) {
          const field_value = line.substring(field_name.length + 1).trim();
          fields[field_name] = field_value;
        }
      }
    }
  
    // Return the extracted fields as an object
    return fields;
  }

async function removeNonStandardChars(text) {
    return text.replace(/[^\w\s\n\r.,:;"'!?@]+/g, '');
}

function removeTabAndNewline(text) {
  return text.replace(/\\t|\\n/g, '');
}
  
function chunkSubstr(str, size) {
  const numChunks = Math.ceil(str.length / size)
  const chunks = new Array(numChunks)

  for (let i = 0, o = 0; i < numChunks; ++i, o += size) {
    chunks[i] = str.substr(o, size)
  }

  return chunks
}

async function ocr_html_images(html, output_directory) {
  try {
    // Create the output directory if it doesn't exist
    if (!fs.existsSync(output_directory)) {
        fs.mkdirSync(output_directory, { recursive: true });
    }

    // Parse the HTML using Cheerio
    const $ = cheerio.load(html);

    // Find all the image tags in the HTML
    const image_tags = $('img');

    let ocr_text = '';

    const worker = await createWorker();
    await worker.loadLanguage('eng');
    await worker.initialize('eng');

    // Loop through the image tags and OCR each image
    for (let i = 0; i < image_tags.length; i++) {
        const image_tag = image_tags[i];

        // Get the image URL from the image tag
        let image_url = $(image_tag).attr('src');

        // Download the image using Axios
        if (image_url && !image_url.startsWith('http')) {
            image_url = 'http:' + image_url;
        }

        try {
            let response = await axios.get(image_url, { responseType: 'arraybuffer' });
            if (response.status !== 200) {
                logger.error(`Error downloading image at ${image_url}: status code ${response.status}`);
                continue;
            }
            // Save the image to a file
            const image_path = path.join(output_directory, `image_${i}.jpg`);
            fs.writeFileSync(image_path, response.data);

            // Load the image using Tesseract.js
            const { data } = await worker.recognize(response.data);
            // Print the OCR'd text
            ocr_text+=data.text+'\n'
            fs.unlinkSync(image_path)
        } catch (error) {
          logger.error(error)
            continue;
        }
    }
    await worker.terminate();
    return ocr_text;
  } catch (error) {
    logger.error(error)
    return ''
  }
}

async function extract_text_from_html(html) {
    // Create a new Cheerio object to parse the HTML
    const $ = cheerio.load(html);

    // Replace <br> tags with newline characters
    $('br').replaceWith('\n');
    // Replace <p> tags with double newline characters
    $('p').each(function() {
        let $p = $(this);
        let text = $p.text();
        $p.html('\n\n' + text + '\n\n');
    });
      
    
    // Replace the align attribute with a newline character
    $('[align]').each(function() {
        let $p = $(this);
        let text = $p.text();
        $p.html('\n\n' + text + '\n\n');
    });
    // Extract all the text from the modified HTML document
    let text = $.text();

    // Return the extracted text
    return text;
}

async function remove_consecutive_line_breaks(text) {
    let lines = text.split('\n');
    let nonEmptyLines = [];
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim() !== '') {
            nonEmptyLines.push(lines[i]);
        }
    }
    return nonEmptyLines.join('\n');
}

function extract_urls_from_html(html) {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const urls = [];
  const imgUrls = [];

  function traverse(node) {
    if (node.nodeType === dom.window.Node.ELEMENT_NODE) {
      if (node.tagName === 'A' && node.hasAttribute('href')) {
        if (!node.getAttribute('href').startsWith('mailto:')) {
          urls.push(node.getAttribute('href'));
        }
      }

      if (node.tagName === 'IMG' && node.hasAttribute('src')) {
        imgUrls.push(node.getAttribute('src'));
      }

      // Add other tag checks and attributes containing URLs as needed

      // Traverse child nodes
      for (const child of node.childNodes) {
        traverse(child);
      }
    }
  }

  traverse(doc.documentElement);

  return { urls, imgUrls };
}

function index_of_coincidence(text) {
  try {
    const frequencies = {};
  let total = 0;
  for (const char of text) {
    if (char in frequencies) {
      frequencies[char]++;
    } else {
      frequencies[char] = 1;
    }
    total++;
  }

  let ic = 0;
  for (const count of Object.values(frequencies)) {
    ic += count * (count - 1);
  }

  return ic / (total * (total - 1));
  } catch (error) {
    return 0
  } 
}

function extract_query_params(url) {
  const parsedUrl = parseUrl(url);
  return Object.entries(parsedUrl.query).map(([key, value]) => ({ key, value }));
}

function censor_url(url, ic_threshold) {
  try {
    const queryParams = extract_query_params(url);

  if (queryParams.length > 0) {
    const censoredParams = queryParams.map(param => {
      const ic_key = index_of_coincidence(param.key);
      const ic_value = index_of_coincidence(param.value);

      let censoredKey = param.key;
      let censoredValue = param.value;

      if (ic_key < ic_threshold) {
        censoredKey = '';
      }

      if (ic_value < ic_threshold) {
        censoredValue = '';
      }

      return `${censoredKey}=${censoredValue}`;
    });

    const baseUrl = url.split('?')[0];
    return `${baseUrl}?${censoredParams.join('&')}`;
  }

  return url;
  } catch (error) {
    logger.error(error)
    return url
  }
  
}

function censor_urls(urlObject, ic_threshold = 0.1) {
  const censoredUrls = urlObject.urls.map(url => censor_url(url, ic_threshold));
  const censoredImgUrls = urlObject.imgUrls.map(url => censor_url(url, ic_threshold));

  return {
    urls: censoredUrls,
    imgUrls: censoredImgUrls
  };
}

async function bingWebSearchMessageFields(search_object) {
  let search_results = {
    "from":"",
    "subject":"",
  }
  let from_search = await bingWebSearch(search_object["from"])
  let subject_search = await bingWebSearch(search_object["subject"])
  search_results["from"] = from_search
  search_results["subject"] = subject_search
  return search_results
}

async function bingWebSearchMultipleQueries(queries) {
  const searchResults = await Promise.all(
    queries.map(query => bingWebSearch(query))
  );
  const all_pages = searchResults.map(result => JSON.parse(result)).flat();
  return JSON.stringify(all_pages);
}

async function bingWebSearch(query, retries = 3) {
  const retry = async () => {
    try {
      const result = await bingWebSearch(query, retries - 1);
      return result;
    } catch (error) {
      throw error;
    }
  };

  try {
    const response = await axios.get(
      `https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(query)}&count=2&responseFilter=Webpages&safeSearch=Off`,
      {
        headers: { 'Ocp-Apim-Subscription-Key': process.env.AZURE_SUBSCRIPTION_KEY },
      }
    );
    if (response.status == 429) {
      if (retries > 0) {
        logger.error('Rate limit exceeded. Retrying in 1 second...');
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return retry();
      } else {
        throw new Error('Rate limit exceeded. No more retries.');
      }
    }

    const body = response.data;
    if (body.webPages && body.webPages.value) {
      let pages = body.webPages.value;
      let all_pages = [];
      for (let i = 0; i < pages.length; i++) {
        let page = pages[i];
        all_pages.push({ 'snippet': page.snippet, 'url': page.url });
      }
      return JSON.stringify(all_pages);
    } else {
      return JSON.stringify([]);
    }
  } catch (error) {
    logger.error('Error:', error.message);
    throw error;
  }
}

async function handle_message(message,settings) {
  // Process the email message
  const html = message;
  let text = await extract_text_from_html(html);
  let links = extract_urls_from_html(html);
  // links = censor_urls(links);
  let ocr_text = ''
  let search = ''
  if (settings.ocr === true) {
    try {
      ocr_text = await ocr_html_images(html, 'images');
    } catch (error) {
      logger.info(error)
    }
  }
  if (settings.follow_links === true) {
    links.urls = links.urls.slice(0,8)
    links.urls = await followLinks(links.urls)
    search = await bingWebSearchMultipleQueries(links.urls)
  }
  text = await remove_consecutive_line_breaks(text);
  text = await remove_before_forwarded(text);
  text = await removeNonStandardChars(text);
  text = await remove_consecutive_line_breaks(text);
  let message_fields = await extract_email_fields(text);
  let message_field_search = await bingWebSearchMessageFields(message_fields)
  text = await removeTabAndNewline(text);
  textobj = await processMaxTokens(text,4000,'extractTextGPT')
  text = textobj.message
  let imageprompt = `The email contained no images with text.`
  if (ocr_text.length > 0) {
    imageprompt = `The email also contained images with this text:\n${ocr_text}`
  }
  if (text.length + imageprompt.length >= 20000){
    imageprompt = imageprompt.substring(0,1000)
    search = search.substring(0,5000)
    text = text.substring(0,20000)
    logger.info(`Text longer than allowed, actually ${text.length} which is over 20000`)
  }
  let result = await processEmail(message_fields, message_field_search, text, imageprompt, search);
  result.message = JSON.parse(result.message)
  result.cost += textobj.cost
  return result
}

module.exports = {
  handle_message
}