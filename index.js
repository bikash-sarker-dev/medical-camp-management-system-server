require("dotenv").config();
const express = require("express");
const cors = require("cors");
var jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const app = express();
const stripe = require("stripe")(process.env.STRIPE_PAYMENT_KEY);

const port = process.env.PORT;

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.yvlp9.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

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

    // collection create
    const campCollection = client.db("medicalCamp").collection("camps");
    const feedbackCollection = client.db("medicalCamp").collection("feedbacks");
    const joinCampCollection = client.db("medicalCamp").collection("joinCamps");
    const userCollection = client.db("medicalCamp").collection("users");
    const profileCollection = client.db("medicalCamp").collection("profiles");
    const paymentCollection = client.db("medicalCamp").collection("payments");

    // jwt relate working

    app.post("/jwt-login", async (req, res) => {
      const tokenMail = req.body;

      const token = jwt.sign(tokenMail, process.env.JWT_SECRET_KEY, {
        expiresIn: "1h",
      });
      res.send({ token });
    });

    // middleware
    const verifyToken = (req, res, next) => {
      if (!req.headers.authorization) {
        return res.status(401).send({ message: " unauthorized access" });
      }

      const token = req.headers.authorization.split(" ")[1];
      jwt.verify(token, process.env.JWT_SECRET_KEY, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "unauthorized access" });
        }
        req.decoded = decoded;
        next();
      });
    };

    const organizerVerify = async (req, res, next) => {
      const tokenEmail = req.decoded.email;
      const query = { email: tokenEmail };
      const participant = await userCollection.findOne(query);

      const organizer = participant?.role === "organizer";
      if (!organizer) {
        return res.status(403).send({ message: "forbidden access!" });
      }

      next();
    };

    // user relate working
    app.post("/users", verifyToken, organizerVerify, async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const exitingUser = await userCollection.findOne(query);
      if (exitingUser) {
        return res.send({ message: "user already exited", insertedId: null });
      }
      const result = await userCollection.insertOne(user);
      res.send(user);
    });

    app.get("/users", verifyToken, organizerVerify, async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    // organize relate work
    app.patch(
      "/users/organizer/:id",
      verifyToken,
      organizerVerify,
      async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };

        const updateRole = {
          $set: {
            role: "organizer",
          },
        };
        const result = await userCollection.updateOne(query, updateRole);
        res.send(result);
      }
    );

    app.get(
      "/users/organizer/:email",
      verifyToken,
      organizerVerify,
      async (req, res) => {
        const email = req.params.email;
        const query = { email: email };

        const participant = await userCollection.findOne(query);
        let organizer = false;
        if (participant) {
          organizer = participant?.role === "organizer";
        }
        res.send({ organizer });
      }
    );

    app.delete(
      "/users/participant/:id",
      verifyToken,
      organizerVerify,
      async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await userCollection.deleteOne(query);
        res.send(result);
      }
    );

    // camps relate
    app.post("/camps", verifyToken, organizerVerify, async (req, res) => {
      const camp = req.body;
      const result = await campCollection.insertOne(camp);
      res.send(result);
    });

    app.get("/camps", async (req, res) => {
      const page = parseInt(req.query.page);
      const size = parseInt(req.query.size);

      const result = await campCollection
        .find()
        .skip(page * size)
        .limit(size)
        .toArray();
      res.send(result);
    });
    app.get("/campsCount", async (req, res) => {
      const count = await campCollection.estimatedDocumentCount();
      res.send({ count });
    });
    // camps relate
    app.get("/camps/popular", async (req, res) => {
      const result = await campCollection
        .find()
        .sort({ ParticipantCount: -1 })
        .limit(6)
        .toArray();
      res.send(result);
    });
    app.delete("/camps/:id", verifyToken, organizerVerify, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await campCollection.deleteOne(query);
      res.send(result);
    });

    app.put(
      "/update-camp/:id",
      verifyToken,
      organizerVerify,
      async (req, res) => {
        const updateId = req.params.id;
        const updateData = req.body;
        const query = { _id: new ObjectId(updateId) };
        const option = { upsert: true };
        const updateCamp = {
          $set: {
            CampName: updateData.CampName,
            Image: updateData.Image,
            CampFees: updateData.CampFees,
            DateAndTime: updateData.DateAndTime,
            Location: updateData.Location,
            HealthcareProfessional: updateData.HealthcareProfessional,
            ParticipantCount: updateData.ParticipantCount,
            Description: updateData.Description,
          },
        };
        const result = await campCollection.updateOne(
          query,
          updateCamp,
          option
        );
        res.send(result);
      }
    );

    app.get("/search", async (req, res) => {
      const search = req.query.search;
      const sorting = req.query.sort;
      let query = {
        CampName: {
          $regex: search,
          $options: "i",
        },
      };

      let options;
      if (sorting === "m-des") {
        options = { ParticipantCount: -1 };
      } else if (sorting === "camp-free-des") {
        options = { CampFees: -1 };
      } else if (sorting === "camp-free-acs") {
        options = { CampFees: 1 };
      }

      const result = await campCollection.find(query).sort(options).toArray();
      res.send(result);
    });

    app.get("/camp-search", async (req, res) => {
      const search = req.query.search;
      console.log(search);

      let query = {
        CampName: {
          $regex: search,
          $options: "i",
        },
      };

      const result = await campCollection.find(query).toArray();

      res.send(result);
    });

    app.get("/details/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await campCollection.findOne(query);
      res.send(result);
    });

    // feedback relate work
    app.get("/feedbacks", async (req, res) => {
      const result = await feedbackCollection.find().toArray();
      res.send(result);
    });

    app.post("/feedbacks", async (req, res) => {
      const feedbackData = req.body;
      const result = await feedbackCollection.insertOne(feedbackData);
      res.send(result);
    });

    // join Camp relate working
    app.post("/join-camp", async (req, res) => {
      const joinData = req.body;
      const campId = req.body.campId;
      const result = await joinCampCollection.insertOne(joinData);

      // increment participantCount
      let filter = { _id: new ObjectId(campId) };
      let upDateParticipantCount = {
        $inc: {
          ParticipantCount: 1,
        },
      };
      const upCamp = await campCollection.updateOne(
        filter,
        upDateParticipantCount
      );
      res.send(result);
    });

    app.get("/join-camps", async (req, res) => {
      const result = await joinCampCollection.find().toArray();
      res.send(result);
    });
    app.get("/join-camps/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await joinCampCollection.findOne(query);
      res.send(result);
    });
    app.delete("/delete-join-camps/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await joinCampCollection.deleteOne(query);
      res.send(result);
    });
    app.patch("/update-join-camps/:id", async (req, res) => {
      const id = req.params.id;

      const query = { _id: new ObjectId(id) };
      const updateStatus = {
        $set: {
          PaymentStatus: "paid",
          Confirmation: "confirmed",
        },
      };
      const result = await joinCampCollection.updateOne(query, updateStatus);
      res.send(result);
    });

    app.get("/registered-join/:email", async (req, res) => {
      const email = req.params.email;
      const query = { participantEmail: email };

      const result = await joinCampCollection.find(query).toArray();
      res.send(result);
    });

    // profile relate working
    app.post("/profile", async (req, res) => {
      const profile = req.body;
      const result = await profileCollection.insertOne(profile);
      res.send(result);
    });

    app.get("/profile/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await profileCollection.findOne(query);
      res.send(result);
    });

    app.patch("/profile/:email", async (req, res) => {
      const email = req.params.email;
      const data = req.body;

      const query = { email: email };
      const updateProfileInfo = {
        $set: {
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email,
          eduction: data.eduction,
          address: data.address,
          country: data.country,
          state: data.state,
          website: data.website,
          bio: data.bio,
          photo: data.photo,
        },
      };
      const result = await profileCollection.updateOne(
        query,
        updateProfileInfo
      );
      res.send(result);
    });

    // payment relate working
    app.post("/checkout-intent", async (req, res) => {
      const { campFees } = req.body;
      const feesAmount = parseInt(campFees * 100);

      const paymentIntent = await stripe.paymentIntents.create({
        amount: feesAmount,
        currency: "usd",
        payment_method_types: ["card"],
      });

      res.send({ clientSecret: paymentIntent.client_secret });
    });

    app.post("/payment", async (req, res) => {
      const paymentData = req.body;
      const result = await paymentCollection.insertOne(paymentData);

      const joinId = paymentData.joinId;
      const query = { _id: new ObjectId(joinId) };

      const updatePaymentStatus = {
        $set: {
          PaymentStatus: "paid",
          Confirmation: "confirmed",
        },
      };
      const joinCampPay = await joinCampCollection.updateOne(
        query,
        updatePaymentStatus
      );
      res.send({ paymentCreate: result, paymentStatusUpdate: joinCampPay });
    });

    app.get("/payments", async (req, res) => {
      const email = req.query.email;
      const filter = { email: email };
      const result = await paymentCollection.find(filter).toArray();
      res.send(result);
    });

    // dashboard analytics relate work
    app.get("/participant-analytics", async (req, res) => {
      const email = req.query.email;
      console.log(email);

      const join = await joinCampCollection
        .aggregate([
          {
            $match: { participantEmail: email },
          },
        ])
        .toArray();

      const joinPaymentStatus = await joinCampCollection
        .aggregate([
          {
            $match: { participantEmail: email },
          },
          {
            $group: {
              _id: "$PaymentStatus",
              totalQuantity: { $sum: 1 },
            },
          },
        ])
        .toArray();
      const joinConfirmationPending = await joinCampCollection
        .aggregate([
          {
            $match: { participantEmail: email },
          },
          {
            $group: {
              _id: "$Confirmation",
              totalQuantity: { $sum: 1 },
            },
          },
        ])
        .toArray();

      const payment = await paymentCollection
        .aggregate([
          {
            $match: { email: email },
          },
          {
            $group: {
              _id: null,
              totalAmount: {
                $sum: "$campFees",
              },
            },
          },
        ])
        .toArray();

      const totalFess = payment.length > 0 ? payment[0].totalAmount : 0;
      const joinPaymentStatusPaid =
        joinPaymentStatus.length > 0 ? joinPaymentStatus[0].totalQuantity : 0;
      const joinConfirmationPendingCount =
        joinConfirmationPending.length > 0
          ? joinConfirmationPending[0].totalQuantity
          : 0;

      const totalJoin = join.length;

      res.send({
        totalFess,
        totalJoin,
        joinPaymentStatusPaid,
        joinConfirmationPendingCount,
      });
    });

    app.get(
      "/organizer-analytics",
      verifyToken,
      organizerVerify,
      async (req, res) => {
        const users = await userCollection.estimatedDocumentCount();
        const joins = await joinCampCollection.estimatedDocumentCount();
        const feedbacks = await feedbackCollection.estimatedDocumentCount();

        const payment = await paymentCollection
          .aggregate([
            {
              $group: {
                _id: null,
                totalAmount: {
                  $sum: "$campFees",
                },
              },
            },
          ])
          .toArray();
        const totalFess = payment.length > 0 ? payment[0].totalAmount : 0;
        res.send({ users, joins, feedbacks, totalFess });
      }
    );

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("the medical server open.");
});

app.listen(port, () => {
  console.log("the server running port:", port);
});
