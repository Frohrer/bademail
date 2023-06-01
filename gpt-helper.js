const { Tiktoken } = require("tiktoken/lite");
const cl100k_base = require("tiktoken/encoders/cl100k_base.json");
const { Configuration, OpenAIApi } = require('openai');
const { logger } = require('./logger.js')

const configuration = new Configuration({
	organization: process.env.OPENAI_ORG,
	apiKey: process.env.OPENAI_KEY, 
});

const openai = new OpenAIApi(configuration);

gpts = {
    '3':'gpt-3.5-turbo',
    '4':'gpt-4'
}

async function processEmail(message, message_field_search, text, imageprompt, search) {
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    let retryCount = 0; // Add a retry counter variable
    async function tryProcessEmail() {
        let messages = [
            {
                role: 'system',
                content: `There is an email FROM: ${message['from']} <${message['from']}>, TO: ${message['to']} <${message['to']}> 
                with the subject line ${message['subject']}.
                It contains the following text:\n${text}`,
            },
            {
                role: 'system',
                content: `The following search results came up for the FROM and SUBJECT text: from: ${message_field_search['from']} subject: ${message_field_search['subject']}`,
            },
            {
                role: 'system',
                content: imageprompt,
            },
            {
                role: 'system',
                content: `URLs in the email were searched and this search compiled here as JSON string. Take search results into account for evaluating this email: ${search}`,
            },
            {
                role: 'system',
                content: 
                `Do not take into account links and attachments. 
                Answer these questions and return a json object with your answer formatted as these keys:
                explanation:Does this email sound like a phishing email (Elaborate why but do not offer recommendations)?
                is_phishing_boolean:Does this email sound like a phishing email (boolean answer), true if it is phishing, false if it is not
                entity:The entity (company,organization) sending the email (string answer)
                type:The type of message (string answer)
                recommendations:What can I do to confirm legitimacy of this email?`,
            },
        ]
        try {
            const gptCompletion = await openai.createChatCompletion({
                model: gpts['4'],
                messages: messages
            });
            let cost = (gptCompletion.data.usage.prompt_tokens / 1000) * 0.03 + (gptCompletion.data.usage.completion_tokens / 1000) * 0.06;
            if (gptCompletion.data.choices[0].message.content) {
                return {message: gptCompletion.data.choices[0].message.content, cost};
            } else {
                throw Error('Something wrong:' + gptCompletion.data.choices[0].message.content);
            }
        } catch (error) {
            logger.error(error);
            if (error.response && error.response.status === 429) {
                logger.error('Received a 429 status code, retrying in 3 seconds...');
            } else {
                logger.error('An error occurred, retrying in 3 seconds...');
            }
            if (retryCount < 5) { // Check if retry limit is reached
                retryCount++; // Increment the retry counter
                await delay(5000); // Wait for 5 seconds before retrying
                return tryProcessEmail(); // Retry the function on any error
            } else {
                return false
            }
            return tryProcessEmail(); // Retry the function on any error
        }
    }
    return await tryProcessEmail(); // Call the inner function to start the process
}

async function extractTextGPT(text) {
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    let retryCount = 0; // Add a retry counter variable
  
    async function tryextractTextGPT() {
        let messages = [
        {
            role: 'user',
            content: `Extract all text from this verbatim and ignore nonsensical tokens:\n${text}`,
        },
        ]
        try {
            const gptCompletion = await openai.createChatCompletion({
                model: gpts['3'],
                messages: messages
            });
            let cost = (gptCompletion.data.usage.prompt_tokens / 1000) * 0.002 + (gptCompletion.data.usage.completion_tokens / 1000) * 0.002;
            if (gptCompletion.data.choices[0].message.content) {
                return {message: gptCompletion.data.choices[0].message.content, cost};
            } else {
                throw Error('Sumting wong:' + gptCompletion.data.choices[0].message.content);
            }
        } catch (error) {
            logger.error(error);
            if (error.response && error.response.status === 429) {
                logger.error('Received a 429 status code, retrying in 5 seconds...');
            } else {
                logger.error('An error occurred, retrying in 5 seconds...');
            }
            if (retryCount < 5) { // Check if retry limit is reached
                retryCount++; // Increment the retry counter
                await delay(5000); // Wait for 3 seconds before retrying
                return tryextractTextGPT(); // Retry the function on any error
            } else {
                return false
            }
        }
    }
    return await tryextractTextGPT(); // Call the inner function to start the process
  }

async function processMaxTokens(text,tokens,GPTfunc) {
    const maxTokens = tokens;

    const availFunctions = {
        extractTextGPT,
        processEmail
    }
    // Initialize the Tiktoken encoding
    const encoding = new Tiktoken(
        cl100k_base.bpe_ranks,
        cl100k_base.special_tokens,
        cl100k_base.pat_str
    );

    // Split the text into words
    const words = text.split(' ');

    // Initialize an empty array to hold text chunks
    let textChunks = [];

    // Initialize a new text chunk
    let chunk = '';

    // Iterate over the words
    for (let i = 0; i < words.length; i++) {
        // If adding the next word would exceed the maximum token limit, add the current chunk to the chunks array
        if (encoding.encode(chunk + ' ' + words[i]).length > maxTokens) {
            textChunks.push(chunk);
            chunk = '';
        }

        // Add the next word to the chunk
        chunk += ' ' + words[i];

        // If this is the last word, add the final chunk to the chunks array
        if (i === words.length - 1) {
            textChunks.push(chunk);
        }
    }

    // Free the encoding after use
    encoding.free();

    // Now, process each text chunk
    let cost = 0
    for (let i = 0; i < textChunks.length; i++) {
        const response = await availFunctions[GPTfunc](textChunks[i]);
        
        // Replace the original text chunk if the response is not "False"
        if (response !== "False") {
            textChunks[i] = response.message;
            cost += response.cost;
        }
    }

    return {message: textChunks.join(''), cost};
}


module.exports = {
    processMaxTokens,
    processEmail
}