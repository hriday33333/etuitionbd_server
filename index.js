const express = require('express');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const cors = require('cors');
const app = express();
require('dotenv').config();
const port = process.env.PORT || 3000;
const stripe = require('stripe')(process.env.STRIPE_SECRET);
const crypto = require('crypto');

const admin = require('firebase-admin');

// const serviceAccount = require('./etuitionbd-7ef5f-firebase-adminsdk-fbsvc-b4a2ccf811.json');
// const serviceAccount = require("./firebase-admin-key.json");

const decoded = Buffer.from(process.env.FB_SERVICE_KEY, 'base64').toString(
  'utf8'
);
const serviceAccount = JSON.parse(decoded);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

function generateTrackingId() {
  const prefix = 'PRCL';
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const random = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `${prefix}-${date}-${random}`;
}

// middlewere
app.use(cors());
app.use(express.json());

const verifyFBToken = async (req, res, next) => {
  const token = req.headers.authorization;

  if (!token) {
    return res.send.status(401).send({ message: 'unauthorized access' });
  }

  try {
    const idToken = token.split(' ')[1];
    const decoded = await admin.auth().verifyIdToken(idToken);
    console.log('decoded in the token', decoded);
    req.decoded_email = decoded.email;
    next();
  } catch (err) {
    return res.status(401).send({ message: 'unauthorized access' });
  }
};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.gisrno5.mongodb.net/?appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const db = client.db('e_tuition-db');
    const userCollections = db.collection('userInfo');
    const studentCollections = db.collection('studentInfo');
    const tuitorCollections = db.collection('tutorApplications');
    const paymentCollection = db.collection('payment');

    // middle more with database access
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded_email;
      const query = { email };
      const user = await userCollections.findOne(query);

      if (!user || user.role !== 'admin') {
        return res.status(403).send({ message: 'forbidden access' });
      }

      next();
    };

    // user  api

    app.get('/userInfo', verifyFBToken, async (req, res) => {
      const cursor = userCollections.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get('/userInfo/profile/:email', async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const user = await userCollections.findOne(query);
      res.send(user);
    });

    app.get('/userInfo/:email/role', async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const user = await userCollections.findOne(query);
      res.send({ role: user?.role || 'user' });
    });

    app.post('/userInfo', async (req, res) => {
      const user = req.body;
      user.role = 'user';
      user.createdAt = new Date();
      const email = user.email;
      const userExists = await userCollections.findOne({ email });
      if (userExists) {
        return res.send({ message: 'users exists' });
      }

      const result = await userCollections.insertOne(user);
      res.send(result);
    });
    app.patch(
      '/userInfo/:id/role',
      verifyFBToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const roleInfo = req.body;
        const query = { _id: new ObjectId(id) };
        const updatedDoc = {
          $set: {
            role: roleInfo.role,
          },
        };
        const result = await userCollections.updateOne(query, updatedDoc);
        res.send(result);
      }
    );

    // studentInfo  API
    app.get('/studentInfo', async (req, res) => {
      const query = {};

      const { email, deliveryStatus } = req.query;
      if (email) {
        query.email = email;
      }

      if (deliveryStatus) {
        query.deliveryStatus = deliveryStatus;
      }

      const options = {
        sort: {
          createdAt: -1,
        },
      };

      const cursor = studentCollections.find(query, options);
      const result = await cursor.toArray();
      res.send(result);
    });

    // GET assigned students for logged-in tutor
    app.get('/studentInfo/tutor', async (req, res) => {
      try {
        const { tutorEmail, deliveryStatus } = req.query;
        if (!tutorEmail)
          return res.status(400).send({ message: 'tutorEmail is required' });

        const query = {
          tutorEmail: tutorEmail,
        };

        if (deliveryStatus) query.deliveryStatus = deliveryStatus;

        const students = await studentCollections.find(query).toArray();
        console.log('Query:', query);
        console.log('DB Result:', students);

        res.send(students);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: 'Server Error' });
      }
    });

    app.get('/studentInfo/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await studentCollections.findOne(query);
      res.send(result);
    });
    app.post('/studentInfo', async (req, res) => {
      const student = req.body;
      student.createdAt = new Date();
      const result = await studentCollections.insertOne(student);
      res.send(result);
    });
    app.delete('/studentInfo/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await studentCollections.deleteOne(query);
      res.send(result);
    });

    app.patch('/studentInfo/:id', async (req, res) => {
      const { tutorId, tutorName, tutorEmail } = req.body;
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };

      const updatedDoc = {
        $set: {
          deliveryStatus: 'tuitor_applied',
          tutorId: tutorId,
          tutorName: tutorName,
          tutorEmail: tutorEmail,
        },
      };
      const reault = await studentCollections.updateOne(query, updatedDoc);

      const tuitorQuery = { _id: new ObjectId(tutorId) };
      const tuitorUpdatedDoc = {
        $set: {
          workStatus: 'ongoing',
        },
      };
      const tuitorRuselt = await tuitorCollections.updateOne(
        tuitorQuery,
        tuitorUpdatedDoc
      );
      res.send(tuitorRuselt);
    });

    // // new payment  api
    // app.post('/payment-checkout-session', async (req, res) => {
    //   const paymentInfo = req.body;
    //   const amount = parseInt(paymentInfo.budget) * 100;
    //   const session = await stripe.checkout.sessions.create({
    //     line_items: [
    //       {
    //         price_data: {
    //           currency: 'USD',
    //           unit_amount: amount,
    //           product_data: {
    //             name: `pleace pay for:${paymentInfo.studentName}`,
    //           },
    //         },
    //         quantity: 1,
    //       },
    //     ],
    //     mode: 'payment',
    //     metadata: {
    //       studentId: paymentInfo.studentId,
    //     },
    //     customer_email: paymentInfo.senderEmail,
    //     success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?success=true`,
    //     cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancelled`,
    //   });
    // });

    // payment related api   old
    app.post('/create-checkout-session', async (req, res) => {
      const paymentInfo = req.body;
      const amount = parseInt(paymentInfo.budget) * 100;
      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            price_data: {
              currency: 'USD',
              unit_amount: amount,
              product_data: {
                name: paymentInfo.studentName,
              },
            },

            quantity: 1,
          },
        ],
        customer_email: paymentInfo.senderEmail,
        mode: 'payment',
        metadata: {
          studentId: paymentInfo.studentId,
          studentName: paymentInfo.studentName,
        },
        success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancelled`,
      });
      console.log(session);
      res.send({ url: session.url });
    });
    app.patch('/payment-success', async (req, res) => {
      const sessionId = req.query.session_id;
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      // console.log('session retrieve', session);

      const transsactionId = session.payment_intent;
      const query = { transsactionId: transsactionId };
      const paymentExist = await paymentCollection.findOne(query);
      if (paymentExist) {
        return res.send({
          message: 'already exists',
          transsactionId,
          trackingId: paymentExist.trackingId,
        });
      }

      const trackingId = generateTrackingId();
      if (session.payment_status === 'paid') {
        const id = session.metadata.studentId;
        const query = { _id: new ObjectId(id) };
        const update = {
          $set: {
            paymentStatus: 'paid',
            deliveryStatus: 'pending',
            trackingId: trackingId,
          },
        };
        const result = await studentCollections.updateOne(query, update);

        const payment = {
          amount: session.amount_total / 100,
          currency: session.currency,
          customerEmail: session.customer_email,
          studentId: session.metadata.studentId,
          studentName: session.metadata.studentName,
          transsactionId: session.payment_intent,
          paymentStatus: session.payment_status,
          paidAt: new Date(),
          trackingId: trackingId,
        };

        if (session.payment_status === 'paid') {
          const resultPayment = await paymentCollection.insertOne(payment);
          res.send({
            success: true,
            trackingId: trackingId,
            transsactionId: session.payment_intent,
            modifystudent: result,
            paymentInfo: resultPayment,
          });
        }
      }

      res.send({ success: false });
    });
    app.get('/payment', verifyFBToken, async (req, res) => {
      const email = req.query.email;
      const query = {};

      // console.log('headers', req.headers);

      if (email) {
        query.customerEmail = email;

        if (email !== req.decoded_email) {
          return res.status(403).send({ message: 'forbidden access' });
        }
      }
      const cursor = paymentCollection.find(query).sort({ paidAt: -1 });
      const result = await cursor.toArray();
      res.send(result);
    });

    // tutorApplications api

    // GET all tutor applications (admin)
    app.get(
      '/tutorApplications',
      verifyFBToken,
      verifyAdmin,
      async (req, res) => {
        const result = await tuitorCollections
          .find()
          .sort({ createdAt: -1 })
          .toArray();
        res.send(result);
      }
    );

    app.post('/tutorApplications', async (req, res) => {
      const tuitor = req.body;
      tuitor.status = 'pending';
      tuitor.createdAt = new Date();
      const result = await tuitorCollections.insertOne(tuitor);
      res.send(result);
    });

    app.patch(
      '/tutorApplications/:id',
      verifyFBToken,
      verifyAdmin,
      async (req, res) => {
        const status = req.body.status;
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const updatedDoc = {
          $set: {
            status: status,
            workStatus: 'available',
          },
        };
        const result = await tuitorCollections.updateOne(query, updatedDoc);
        if (status === 'approved') {
          const email = req.body.email;
          userQuery = { email };
          const updateUser = {
            $set: {
              role: 'tuitor',
            },
          };
          const userResult = await userCollections.updateOne(
            userQuery,
            updateUser
          );
        }
        res.send(result);
      }
    );

    // Delete tutor application
    app.delete(
      '/tutorApplications/:id',
      verifyFBToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const id = req.params.id;
          const result = await tuitorCollections.deleteOne({
            _id: new ObjectId(id),
          });
          if (result.deletedCount) {
            return res.send({
              success: true,
              message: 'Tutor application deleted',
            });
          }
          res.status(404).send({ success: false, message: 'Tutor not found' });
        } catch (err) {
          console.error(err);
          res.status(500).send({ success: false, message: 'Server error' });
        }
      }
    );

    // Get single tutor application
    app.get(
      '/tutorApplications/:id',
      verifyFBToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const id = req.params.id;
          const tutor = await tuitorCollections.findOne({
            _id: new ObjectId(id),
          });
          if (!tutor)
            return res
              .status(404)
              .send({ success: false, message: 'Tutor not found' });
          res.send({ success: true, tutor });
        } catch (err) {
          console.error(err);
          res.status(500).send({ success: false, message: 'Server error' });
        }
      }
    );

    app.get('/tutorApplications', async (req, res) => {
      const { status, district, workStatus } = req.query;
      const query = {};
      if (status) {
        query.status = status;
      }
      if (district) {
        query.district = district;
      }
      if (workStatus) {
        query.workStatus = workStatus;
      }

      const cursor = tuitorCollections.find(query);

      const result = await cursor.toArray();
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    // await client.db('admin').command({ ping: 1 });
    // console.log(
    //   'Pinged your deployment. You successfully connected to MongoDB!'
    // );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('etuitionbd!');
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
