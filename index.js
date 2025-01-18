require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const app = express();

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

    // user relate working
    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const exitingUser = await userCollection.findOne(query);
      if (exitingUser) {
        return res.send({ message: "user already exited", insertedId: null });
      }
      const result = await userCollection.insertOne(user);
      res.send(user);
    });

    app.get("/users", async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    // organize relate work
    app.patch("/users/organizer/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };

      const updateRole = {
        $set: {
          role: "organizer",
        },
      };
      const result = await userCollection.updateOne(query, updateRole);
      res.send(result);
    });

    app.get("/users/organizer/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };

      const participant = await userCollection.findOne(query);
      let organizer = false;
      if (participant) {
        organizer = participant?.role === "organizer";
      }
      res.send({ organizer });
    });

    app.delete("/users/participant/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await userCollection.deleteOne(query);
      res.send(result);
    });

    // camps relate
    app.post("/camps", async (req, res) => {
      const camp = req.body;
      const result = await campCollection.insertOne(camp);
      res.send(result);
    });

    app.get("/camps", async (req, res) => {
      const result = await campCollection.find().toArray();
      res.send(result);
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
    app.delete("/camps/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await campCollection.deleteOne(query);
      res.send(result);
    });

    app.put("/update-camp/:id", async (req, res) => {
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
      const result = await campCollection.updateOne(query, updateCamp, option);
      res.send(result);
    });

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
