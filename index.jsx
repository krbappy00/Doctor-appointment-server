const express = require("express")
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require('dotenv').config()
const jwt = require("jsonwebtoken");


const port = process.env.PORT || 5000;

const app = express();

app.use(cors())
app.use(express.json())


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.uiqovdn.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// JWT TOKEN VERIFICATION FUNCTION
function verifyJWT(req,res,next){
    const authToken = req.headers.authorization;
    if(!authToken){
      return res.status(401).send({message:'unauthorized access!'})
    }
    else{
      const token = authToken.split(" ")[1];
      jwt.verify(token, process.env.ACCESS_TOKEN, function (err, decoded) {
        if (err) {
          return res.status(403).send({ message: "unauthorized access!" });
        }
        req.decoded = decoded;
        next();
      });
      
    }
}

async function run() {
  try {
      const usersCollection = client
        .db("doctor-appointment")
        .collection("usersCollection");

//USER COLLECTION POST/GET
      app.post('/api/users',async(req,res)=>{
        const user = req.body;
        const result = await usersCollection.insertOne(user);
        res.send(result);
      })
      app.get('/api/users',async(req,res)=>{
        const users = await usersCollection.find().toArray();
        res.send(users)
      })
      app.put('/api/users/admin/:id',verifyJWT, async(req,res)=>{
        const decoded = req.decoded.email;
        const query = {email:decoded}
        const rightUser = await usersCollection.findOne(query);
        if(rightUser?.role !== 'admin'){
          return res.status(403).json({message:'Forbidden access!'})
        }
        const id = req.params.id;
        console.log(id)
        const filter = {_id:new ObjectId(id)}
        const options = {upsert:true};
        const updateRole = {
          $set:{
            role:"admin",
          }
        }
        const result = await usersCollection.updateOne(filter,updateRole,options);
        res.send(result)
      })
      app.get('/api/users/admin/:email',async(req,res)=>{
        const email = req.params.email;
        const query = {email}
        const user = await usersCollection.findOne(query);
        res.send({isAdmin:user?.role ==='admin'})
      })
// TOTAL COUNT
      app.get('/api/count',async(req,res)=>{
        const query = {}
        const patientCount = await usersCollection.countDocuments(query);
        const bookingCount = await bookingsOrder.countDocuments(query);
        const serviceCount = await bookingOptions.countDocuments(query);
        res.send({totalPatient:patientCount,totalBooking:bookingCount,totalService:serviceCount})
      })


// JWT TOKEN SEND
      app.get('/jwt',async(req,res)=>{
        const userEmail = req.query.email;
        const email = {email:userEmail}
        const token = jwt.sign(email, process.env.ACCESS_TOKEN, {
          expiresIn: "1h",
        });
        res.send({accessToken:token})
       
      })


// OLD API FOR BOOKING OPTION WITHOUT AGGREGATION
    const bookingOptions = client.db("doctor-appointment").collection('booking-options');
    app.get('/api/bookingOptions', async(req,res)=>{
        const date = req.query.date;
        const query = {}
        const options = await bookingOptions.find(query).toArray();
        res.send(options)
    })

// DOCTOR SPECIALTY    
    app.get('/api/specialty',async(req,res)=>{
      const result = await bookingOptions
        .aggregate([
          {
            $project: { name: 1 },
          },
          {
            $addFields: {
              value: "$name",
              label: "$name",
            },
          },
        ])
        .toArray();
      res.send(result);
    })
//DOCTOR POST
    const doctorCollection = client
      .db("doctor-appointment")
      .collection("doctorCollection");
    app.post('/api/addDoctor',async(req,res)=>{
      const doctorInfo = req.body;
      console.log(doctorInfo);
      const result = await doctorCollection.insertOne(doctorInfo);
      res.send(result); 
    })


// BOOKINGS OPTIONS AGGREGATION
    app.get('/api/v2/bookingOptions', async(req,res)=>{
        const date = req.query.date;
        const filterOptions = await bookingOptions
          .aggregate([
            {
              $lookup: {
                from: "bookingOrder",
                localField: "name",
                foreignField: "serviceName",
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $eq: ["$appointmentDate", date],
                      },
                    },
                  },
                ],
                as: "booked",
              },
            },
            {
              $project: {
                name: 1,
                slots: 1,
                booked: {
                  $map: {
                    input: "$booked",
                    as: "book",
                    in: "$$book.slot",
                  },
                },
              },
            },
            {
              $project: {
                name: 1,
                slots: {
                  $setDifference:["$slots","$booked"]
                }
              },
            },
          ])
          .toArray();
        res.send(filterOptions)
      })
      
// BOOKING ORDER POST REQ--
    const bookingsOrder = client
      .db("doctor-appointment")
      .collection("bookingOrder");
    app.post('/api/bookings',async(req,res)=>{
      const booking = req.body;
      const query = {
        appointmentDate: booking.appointmentDate,
        serviceName: booking.serviceName,
        email: booking.email,
      };
      const checkBooking = await bookingsOrder.find(query).toArray();
      if(checkBooking.length){
        const message = `You already have booking on ${booking.appointmentDate}`;
        return res.send({success:false,message})
      }
      const result = await bookingsOrder.insertOne(booking);
      res.send(result);
    })


// GET BOOKINGS BY USER
    app.get('/api/bookings',verifyJWT, async(req,res)=>{
      const decoded = req.decoded;
      const email = req.query.email;
      
      if(decoded === undefined){
        return res.status(401).json({message:"Not found any token"})
      }
      else{
        if (decoded.email !== email) {
          return res.status(403).json({ message: "Unauthorized User!" });
        } else {
          const query = { email: email };
          if (query) {
            const bookingByMember = await bookingsOrder.find(query).toArray();
            res.send(bookingByMember);
          } else {
            const bookings = await bookingsOrder.find(query).toArray();
            res.send(bookings);
          }
        }    
      }
    })
  } 
  finally {
  }
}
run().catch(console.dir);


app.get('/',async(req,res)=>{
    res.send("Doctor portal running..")
})

app.listen(port,()=> console.log(`Doctor portal running on port: ${port}`))