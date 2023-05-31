const mongoose = require('mongoose');
const encrypt = require('mongoose-encryption');
const DB = mongoose.createConnection(process.env.MONGO_ADMIN_URL)
const emailSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        trim: true,
        lowercase: true,
    },
    messageId: String,
    header: Object,
    body: String,
    verdict: Object,
},{ timestamps: true })

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

const VisitorEmail = DB.model('VisitorEmail', visitorEmailSchema);
const EmailStore = DB.model('bademail_verdicts', emailSchema, 'bademail_verdicts');

const updateOrCreateVisitor = async (email) => {
    try {
      const filter = { email: email };
      const update = { 
        $inc: { visitCount: 1 },
        $set: { lastVisit: new Date() },
      };
      const options = { 
        new: true,
        upsert: true, // Make this update into an upsert
        setDefaultsOnInsert: true, // Apply schema defaults if new document is inserted
      };
      
      const visitor = await VisitorEmail.findOneAndUpdate(filter, update, options);
  
      console.log('Visitor updated or inserted:', visitor);
    } catch(err) {
      console.error('Error updating or inserting visitor:', err);
    }
}

const insertEmail = async (emailData) => {
  let email = new EmailStore(emailData);

  return email.save()
  .then(email => {
      console.log('Email inserted successfully!');
      return email._id;  // return the id of the inserted document
  })
  .catch(err => console.error('Error inserting email: ', err));
}

const updateEmail = async (id, emailData) => {
  return EmailStore.findByIdAndUpdate(id, emailData, {new: true})
  .then(email => {
      if(!email) {
          console.log('No email found with this id');
          return;
      }
      console.log('Email updated successfully!');
      return email;  // return the updated document
  })
  .catch(err => console.error('Error updating email: ', err));
}

module.exports = {
    updateOrCreateVisitor,
    insertEmail,
    updateEmail
}