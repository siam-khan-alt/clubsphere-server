const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion } = require('mongodb');
const admin = require('firebase-admin');
const app = express();
const port = process.env.PORT || 5000;
app.use(cors(
  {
    origin: [
      'http://localhost:5173',
      'http://localhost:5174',
    ],
    credentials: true,
    optionSuccessStatus: 200,
  }
));
app.use(express.json());
require('dotenv').config();
const decoded = Buffer.from(process.env.FB_SERVICE_KEY, 'base64').toString(
  'utf-8'
)
const serviceAccount = JSON.parse(decoded)
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
})

const verifyToken = async (req, res, next) => {
    const token = req?.headers?.authorization?.split(' ')[1]
    console.log(token)
    if (!token) return res.status(401).send({ message: 'Unauthorized Access!' })
    try {
      const decoded = await admin.auth().verifyIdToken(token)
      req.tokenEmail = decoded.email
      next()
    } catch (err) {
      console.log(err)
      return res.status(401).send({ message: 'Unauthorized Access!', err })
    }
}


const uri = `${process.env.MONGODB_URI}`
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});
async function run() {
  try {
    await client.connect();
    const database = client.db("ClubSphereDB"); 
    const usersCollection = database.collection("users");
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");

    const verifyAdmin = async (req, res, next) => {
    const email = req.tokenEmail; 
    const user = await usersCollection.findOne({ email });

    if (!user || user.role !== 'admin') {
        return res.status(403).send({ message: 'Forbidden access: Not an Admin.' });
    }
    next();
};

    app.post('/users/register', async (req, res) => {
        try {
            const { name, email, photoURL } = req.body;
            
            const existingUser = await usersCollection.findOne({ email });
            if (existingUser) {
                return res.status(200).json({ message: 'User already exists in DB', role: existingUser.role });
            }

            const newUser = { 
                name, 
                email, 
                photoURL, 
                role: 'member',
                createdAt: new Date()
            };

            await usersCollection.insertOne(newUser);
            res.status(201).json({ message: 'User registered in DB successfully', role: 'member' });
        } catch (error) {
            console.error('DB registration error:', error);
            res.status(500).json({ message: 'Failed to register user in DB', error: error.message });
        }
    });
   
    app.get('/users/role', verifyToken,  async (req, res) => {
        try {
            const email = req.tokenEmail; 
            const user = await usersCollection.findOne({ email }, { projection: { role: 1 } }); 

            if (!user) {
                return res.status(404).json({ message: 'User not found in database.' });
            }

            res.json({ role: user.role });

        } catch (error) {
            console.error('Role fetch error:', error);
            res.status(500).json({ message: 'Failed to fetch user role', error: error.message });
        }
    });
     app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
    try {
       const users = await usersCollection.find().toArray();
       res.send(users);
        
    } catch (error) {
        console.error('Fetch all users error:', error);
        res.status(500).send({ message: 'Failed to fetch users from database.' });
    }
});
   
    app.get('/', (req, res) => {
    res.send('Hello World!')
    })

    
    app.listen(port, () => {
  console.log(`Example app listening on port ${port}`) })
  
    
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);




