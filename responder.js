const { good_response, error_response } = require('./email_templates.js');
const nodemailer = require('nodemailer')
const crypto = require('crypto');
const { loadSettings } = require('./settings/settings.js')
const { logger } = require('./logger.js')
const settings = loadSettings()

const directTransporter = nodemailer.createTransport({
    host: settings.smtp_credentials.domain,
    port: settings.smtp_credentials.port,
    secure: true, // use TLS
    auth: {
            user: settings.smtp_credentials.user,
            pass: process.env.SENDGRID_API_KEY
    },
    tls: {
            // do not fail on invalid certs
            rejectUnauthorized: false
    }
});
directTransporter.verify(function(error, success) {
    if (error) {
        logger.error('directTransporter',error);
    } else {
        logger.info(success);
        logger.info("Server is ready to take our messages");
    }
});
const sendEmail = function(response,info,mail){
  let mailOptions = {
      from: `Bademail Bot <bot@${settings.domain}>`,
      replyTo: `Reply <reply@${settings.domain}>`,
      references: info.messageId,
      messageId: `${crypto.randomBytes(16).toString("hex")}@tx.${settings.domain}`,
      to: info.from,
      subject: `Response from Bademail Bot: ${info.subject}`,
      text: `Bademail Bot Response: ${response}`,
      html: good_response(response),
      headers:{
          'X-BADEMAIL-CHECKED':'true'
      }
  };
  try {
      directTransporter.sendMail(mailOptions, function(error, info){
          if (error) {
              logger.error(error);
          } else {
              logger.info('Email sent: ' + info.response + ' ' + clientEmail);
          }
      });
  } catch (e) {
      logger.error(e);
  }
}
const sendErrorEmail = function(info){
  let mailOptions = {
      from: `Bademail Bot <bot@${settings.domain}>`,
      replyTo: `Reply <reply@${settings.domain}>`,
      references: info.messageId,
      messageId: `${crypto.randomBytes(16).toString("hex")}@tx.${settings.domain}`,
      to: info.from,
      subject: `Limit Reached (${info.subject})`,
      text: `Sorry, you've reached the current limit of 3 emails per hour.`,
      html: error_response(limit_string),
      headers:{
          'X-BADEMAIL-CHECKED':'false'
      }
  };
  try {
      directTransporter.sendMail(mailOptions, function(error, info){
          if (error) {
              logger.error(error);
          } else {
              logger.info('Email sent: ' + info.response + ' ' + clientEmail);
          }
      });
  } catch (e) {
      logger.error(e);
  }
}

const forwardEmail = function(info,mail){
  let mailOptions = {
      from: `Bademail Bot <bot@${settings.domain}>`,
      replyTo: `Reply <reply@${settings.domain}>`,
      references: info.messageId,
      messageId: `${crypto.randomBytes(16).toString("hex")}@tx.${settings.domain}`,
      to: 'bademail@fredsemails.com',
      subject: info.subject,
      text: mail.text,
      html: mail.html,
      headers:{
          'X-BADEMAIL-CHECKED':'false',
          'X-BADEMAIL-FROM':info.from
      }
  };
  try {
      directTransporter.sendMail(mailOptions, function(error, info){
          if (error) {
              logger.error(error);
          } else {
              logger.info('Email sent: ' + info.response + ' ' + clientEmail);
          }
      });
  } catch (e) {
      logger.error(e);
  }
}

module.exports = {
    forwardEmail,
    sendEmail,
    sendErrorEmail
}