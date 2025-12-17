const express = require('express');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const cors = require('cors');
const app = express();
require('dotenv').config();
const port = process.env.PORT || 3000;
const stripe = require('stripe')(process.env.STRIPE_SECRET);

// middlewere
app.use(cors());
app.use(express.json());

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
    await client.connect();

    const db = client.db('e_tuition-db');
    const studentCollections = db.collection('studentInfo');

    // studentInfo get API
    app.get('/studentInfo', async (req, res) => {
      const query = {};

      const { email } = req.query;
      if (email) {
        query.email = email;
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

    // studentInfo get id API
    app.get('/studentInfo/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await studentCollections.findOne(query);
      res.send(result);
    });

    // studentInfo  post api
    app.post('/studentInfo', async (req, res) => {
      const student = req.body;
      student.createdAt = new Date();
      const result = await studentCollections.insertOne(student);
      res.send(result);
    });

    // studentInfo  delet api
    app.delete('/studentInfo/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await studentCollections.deleteOne(query);
      res.send(result);
    });

    // // new payment related api
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
        },
        success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancelled`,
      });
      console.log(session);
      res.send({ url: session.url });
    });

    // Send a ping to confirm a successful connection
    await client.db('admin').command({ ping: 1 });
    console.log(
      'Pinged your deployment. You successfully connected to MongoDB!'
    );
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
