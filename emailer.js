const { RateLimiterMemory } = require('rate-limiter-flexible');
require('dotenv').config();
const SMTPServer = require("smtp-server").SMTPServer;
const { updateOrCreateVisitor, insertEmail, updateEmail, getFailedEmails } = require('./db.js');
const simpleParser = require('mailparser').simpleParser;
const { sendEmail, sendErrorEmail, forwardEmail } = require('./responder.js');
const { handle_message } = require('./analysis.js')
const { logger } = require('./logger.js')
const { loadSettings } = require('./settings/settings.js')

const settings = loadSettings()

const rateLimiter = new RateLimiterMemory({
    keyPrefix: 'email_limiter',
    points: settings.limit_points, // Maximum 3 requests
    duration: settings.limit_duration, // Per 12 hours
});

function processRequest(email) {
    return new Promise((resolve, reject) => {
        if (settings.allowlist.includes(email)) {
            resolve();
        } else {
            rateLimiter.consume(email)
            .then(() => {
                logger.info('Request accepted:', email);
                resolve();
            })
            .catch((error) => {
                logger.info('Request rejected (rate limit exceeded):', email);
                reject(error);
            });
        }
    });
}


function infoParser(envelope,data){
    return new Promise((resolve,reject) => {
        let info = {
            first_to:'',
            envelope_to:[],
            domains_to:[],
            real_to_addresses:[],
            envelope_from:'',
            envelope_cc:[],
            from:'',
            fromDomain:'',
            fromText:'',
            fromFake:'',
            sendBackTo:'',
            subject:'',
            references:'',
            messageId:'',
            inReplyTo:'',
            score:0,
        }
        if (data.inReplyTo) {
            info.inReplyTo = data.inReplyTo
        }
        if (data.messageId) {
            info.messageId = data.messageId
        }
        if (data.references && data.references.length > 0) {
            info.references = data.references
        } else if (data.messageId) {
            info.references = data.messageId
        }
        if (envelope.mailFrom) {
            info.envelope_from = envelope.mailFrom.address
        }
        if (data.to && data.to.value && data.to.value.length > 0) {
            let receivedUndefinedTarget = false;
            for (let i = 0; i < data.to.value.length; i++) {
                if (data.to.value[i].address) { // If the to address is undefined then sender might have specified the address in the smtp envelope
                    let emailSplit = data.to.value[i].address.split('@')
                    let domain = emailSplit[emailSplit.length-1]
                    info.domains_to.push(domain)
                    info.envelope_to.push(data.to.value[i].address)
                } else { // check smtp session envelope instead
                    receivedUndefinedTarget = true
                }
            }
            if (receivedUndefinedTarget === true) {
                if (envelope.rcptTo && envelope.rcptTo.length > 0) {
                    for (let i = 0; i < envelope.rcptTo.length; i++) {
                        if (envelope.rcptTo[i].address && envelope.rcptTo[i].address.includes('@')) {
                            let emailSplit = envelope.rcptTo[i].address.split('@')
                            let domain = emailSplit[emailSplit.length-1]
                            info.domains_to.push(domain)
                            info.envelope_to.push(envelope.rcptTo[i].address)
                        }
                    }
                }
            }
        }
        info.first_to = info.envelope_to[0]
        if (data.from && data.from.value && data.from.value[0].address && data.from.value[0].name) {
            info.fromFake = data.from.value[0].address
        }
        if (data.cc) {
            for (let i = 0; i < data.cc.value.length; i++) {
                info.envelope_cc.push(data.cc.value[i].address)
            }
        }
        if (data.envelopeFrom) {
            info.envelope_from.push(data.envelopeFrom.address)
            info.from = data.envelopeFrom.address
            // info.fromText = writeFromText(data.envelopeFrom.name,data.envelopeFrom.address)
        } else if (data.from && data.from.value) {
            info.from = data.from.value[0].address
        }
        if (info.fromFake) {
            info.sendBackTo = info.fromFake
        } else {
            info.sendBackTo = info.from
        }
        if (info.fromFake != '') {
            let emailSplit = info.fromFake.split('@')
            let domain = emailSplit[emailSplit.length-1]
            info.fromDomain = domain
        } else if (info.from != '') {
            let emailSplit = info.from.split('@')
            let domain = emailSplit[emailSplit.length-1]
            info.fromDomain = domain
        }
        if (data.subject) {
            info.subject = data.subject
        }
        if (data.dkim && data.dkim == 'pass') {
            info.valid_dkim = true
        }
        if (data.spf && data.spf == 'pass') {
            info.valid_spf = true
        }
        logger.info(info)
        resolve(info)
    })
}

function spamScore(fullmessage,parsed,session) {
	return new Promise ((resolve,reject) => {
		let security = {
			dkim:false,
			spf:false,
			hostnameMatch:false,
		}
		let basicscore = 0
		if (parsed.headers.has('dkim-signature')) {
			basicscore += 20
			security['dkim'] = true
		}
		if (parsed.headers.has('received')) {
			basicscore += 10
		}
		if (parsed.headers.has('references')) {
			basicscore += 10
		}
		if (parsed.headers.has('received-spf')) {
			basicscore += 10
			security['spf'] = true
		}
		if (session.clientHostname == session.hostNameAppearsAs) {
			basicscore += 20
			security['hostnameMatch'] = true
		}
		if (session.secure) {
			basicscore += 5
		}
    resolve({basicscore,security})
  })
}

const smtpServerNodemailer = new SMTPServer({
	secure: false,
	disabledCommands: ['STARTTLS'],
	allowInsecureAuth: true,
	authMethods:[],
	name:'*',
	banner:`${settings.domain} at your service`,
	authOptional:true,
	size: 104857600, //100 MB in bytes
	onAuth(auth, session, callback) {
		return callback(new Error("This is a mail relay, authentication is not allowed")); // accept no authentication to the server
	},
	onConnect(session, callback) {
		if (session.remoteAddress === "127.0.0.1") {
			return callback(new Error("No connections from localhost allowed"));
		}
		return callback(); // Accept the connection
	},
	onMailFrom(address, session, callback) {
        if (settings.blocklist.includes(address.address) || settings.blocklist.includes(session.remoteAddress)) {
			return callback(
				new Error("You are blocked.")
			)
		};
	    callback(); // Accept the address
	},
	onRcptTo(address, session, callback) {
		return callback(); // Accept the address
	},
	onData(stream, session, callback) {
		let err;
		let fullmessage //the cleartext message assembled from the data stream, this is only fed to Spamassassin
		stream.on('data', function (data) {
			fullmessage += data
		})
		simpleParser(stream, {
			skipImageLinks:true,
			skipHtmlToText:false,
			skipTextToHtml:true,
			skipTextLinks:true,
			keepCidLinks:true,
		})
		.then(mail => {
      spamScore(fullmessage,mail,session).then(({basicscore,security}) => {
        if (basicscore < 50) {
          return callback(
              new Error("Email security checks failed.")
            );
        }
        infoParser(session.envelope,mail).then((info) => {
          updateOrCreateVisitor(info.from)
          if (info.first_to === `bot@${settings.domain}` || info.first_to === `reply@${settings.domain}`){
            forwardEmail(info,mail,settings)
            return callback();
          }
          processRequest(info.from)
            .then(() => {
                let emailData = {
                    email:info.from,
                    messageId:info.messageId,
                    header:mail.headers,
                    body:mail.html || mail.text,
                    verdict:{},
                    processed:false,
                }
                insertEmail(emailData).then((id) => {
                    handle_message(mail.html || mail.text, settings).then((response) => {
                        emailData.verdict = response
                        emailData.processed = true
                        updateEmail(id,emailData)
                        sendEmail(response,info,mail,settings)
                    })
                    return callback();
                })
            })
            .catch((error) => {
              sendErrorEmail(info,settings)
              return callback();
            });
        })
      })
		})
		.catch(err => {
			logger.error(err)
		});
		stream.on("end", () => {
			let err;
			if (stream.sizeExceeded) {
				err = new Error("Message exceeds fixed maximum message size");
				err.responseCode = 552;
				return callback(err);
			}
		});
	}
});

if (process.env.MODE === 'cicd') {
    let emailData = {
        email:'test@example.com',
        messageId:'test123-fakeid@example.com',
        header:{},
        body:`---------- Forwarded message ---------
        From: Micheal Bloomberg <mbloomberg@example.com>
        Date: Fri, May 26, 2023 at 8:54 AM
        Subject: HI $10,000,000.00 DONATION FOR YOU!
        To:
        
        -- 
        Hi, my name is Michael Bloomberg; a philanthropist and founder of
        Bloomberg Industries, one of the largest private foundations in the
        world. I believe strongly in 'giving while living I had one idea that
        never changed in my mind, that you should use your wealth to help
        people and I have decided to give out USD $10,000,000.00 Dollars to
        randomly selected individuals worldwide. I want to use my wealth to
        help and support selected individuals who will help peoples around
        them.
        
        On receipt of this email, you should count yourself as the lucky
        individual. Your email address was selected online while searching at
        random. Kindly get back to me at your earliest convenience, so that I
        will know your email address is valid.
        
        Best Regards.
        M Bloomberg`,
        verdict:{},
        processed:false,
    }
    insertEmail(emailData).then((id) => {
        handle_message(emailData.body, settings).then((response) => {
            emailData.verdict = response
            emailData.processed = true
            updateEmail(id,emailData)
            process.exit();
        })
        
    })
}

getFailedEmails().then((emails) => {
    for (let i = 0; i < emails.length; i++) {
        let email = emails[i];
        handle_message(email.body, settings).then((response) => {
            email.verdict = response
            emailData.processed = true
            updateEmail(id,email)
            process.exit();
        })
    }
})

smtpServerNodemailer.listen(settings.smtp_port,'0.0.0.0');
smtpServerNodemailer.on("error", err => {
	logger.error(err)
});
logger.info(`Ready to receive emails on port ${settings.smtp_port}.`);