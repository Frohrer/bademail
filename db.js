const mongoose = require('mongoose');
const encrypt = require('mongoose-encryption');
const DB = mongoose.createConnection(process.env.MONGO_ADMIN_URL)
const { logger } = require('./logger.js')

// Define your encryption key and your signing key
const encKey = process.env.MONGO_ENCRYPTION_KEY;
const sigKey = process.env.MONGO_SIGNING_KEY;

const emailSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        trim: true,
        lowercase: true,
    },
    messageId: String,
    subject: String,
    header: Object,
    body: String,
    verdict: Object,
    processed: Boolean,
},{ timestamps: true })

// Add mongoose-encryption plugin to your schema
emailSchema.plugin(encrypt, { encryptionKey: encKey, signingKey: sigKey, excludeFromEncryption: ['processed'] });

const visitorEmailSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
  },
  visitCount: {
    type: Number,
    default: 1,
  },
  firstVisit: {
    type: Date,
    default: Date.now,
  },
  lastVisit: {
    type: Date,
    default: Date.now,
  },
}, { timestamps: true });

// Add mongoose-encryption plugin to your schema
visitorEmailSchema.plugin(encrypt, { encryptionKey: encKey, signingKey: sigKey });

const VisitorEmail = DB.model('VisitorEmail', visitorEmailSchema);
const EmailStore = DB.model('bademail_verdicts', emailSchema, 'bademail_verdicts');

const updateOrCreateVisitor = async (email) => {
  try {
      let visitor = await VisitorEmail.findOne({ email: email });

      if (visitor) {
          // If the visitor exists, update the visitCount and lastVisit fields
          visitor.visitCount += 1;
          visitor.lastVisit = new Date();
      } else {
          // If the visitor does not exist, create a new document
          visitor = new VisitorEmail({
              email: email,
              visitCount: 1,
              firstVisit: new Date(),
              lastVisit: new Date(),
          });
      }

      // Save the changes
      await visitor.save();

      logger.info('Visitor updated or inserted:', visitor);
  } catch(err) {
      logger.error('Error updating or inserting visitor:', err);
  }
}

const insertEmail = async (emailData) => {
  let email = new EmailStore(emailData);

  return email.save()
  .then(email => {
      logger.info('Email inserted successfully!');
      return email._id;  // return the id of the inserted document
  })
  .catch(err => logger.error('Error inserting email: ', err));
}

const updateEmail = async (id, emailData) => {
  return EmailStore.findByIdAndUpdate(id, emailData, {new: true})
  .then(email => {
      if(!email) {
          logger.info('No email found with this id.');
          return;
      }
      logger.info('Email updated successfully!');
      return email;  // return the updated document
  })
  .catch(err => logger.error('Error updating email: ', err));
}

const deleteEmail = async (id) => {
  return EmailStore.findByIdAndRemove(id)
  .then(email => {
      if(!email) {
          logger.info('No email found with this id.');
          return;
      }
      logger.info('Email deleted successfully!');
      return email;  // return the deleted document
  })
  .catch(err => logger.error('Error deleting email: ', err));
}

const getFailedEmails = async () => {
  return EmailStore.find({'processed': false})
  .then(emails => {
      if(emails.length === 0) {
          logger.info('No unprocessed emails found.');
          return [];
      }
      logger.info(`Found ${emails.length} previously unprocessed emails.`);
      return emails;
  })
  .catch(err => logger.error('Error finding unprocessed emails: ', err));
}

const getAllEmails = async () => {
  return EmailStore.find({})
  .then(emails => {
      return emails;
  })
  .catch(err => logger.error('Error finding emails: ', err));
}

module.exports = {
    updateOrCreateVisitor,
    insertEmail,
    updateEmail,
    getFailedEmails,
    deleteEmail,
    getAllEmails
}