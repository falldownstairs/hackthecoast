const { MongoClient } = require('mongodb');
require('dotenv').config({ path: '../.env' });

async function insertBusData() {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db('htc2026');
  const collection = db.collection('carbonLogs');
  
  const documents = [
    { startTime: '10:00:00', endTime: '10:00:42', co2Kg: 0.04 },
    { startTime: '10:03:15', endTime: '10:03:58', co2Kg: 0.04 },
    { startTime: '10:06:30', endTime: '10:07:12', co2Kg: 0.05 },
    { startTime: '10:10:00', endTime: '10:10:45', co2Kg: 0.04 },
    { startTime: '10:15:20', endTime: '10:16:05', co2Kg: 0.05 },
    { startTime: '10:20:10', endTime: '10:20:55', co2Kg: 0.04 },
    { startTime: '10:25:00', endTime: '10:25:42', co2Kg: 0.04 },
    { startTime: '10:30:30', endTime: '10:31:15', co2Kg: 0.05 },
    { startTime: '10:35:45', endTime: '10:36:28', co2Kg: 0.04 },
    { startTime: '10:40:00', endTime: '10:40:40', co2Kg: 0.04 },
    { startTime: '10:45:20', endTime: '10:46:02', co2Kg: 0.05 },
    { startTime: '10:50:10', endTime: '10:50:55', co2Kg: 0.04 },
    { startTime: '10:55:30', endTime: '10:56:12', co2Kg: 0.04 },
    { startTime: '11:00:00', endTime: '11:00:45', co2Kg: 0.05 },
    { startTime: '11:05:15', endTime: '11:05:58', co2Kg: 0.04 },
    { startTime: '11:10:30', endTime: '11:11:15', co2Kg: 0.04 },
    { startTime: '11:15:00', endTime: '11:15:42', co2Kg: 0.05 },
    { startTime: '11:19:20', endTime: '11:20:00', co2Kg: 0.04 },
  ];
  
  const today = new Date().toISOString().split('T')[0];
  
  for (const doc of documents) {
    await collection.insertOne({
      summary: 'I see a 3x4 grid of 12 frames showing the interior of a public transit bus. Passengers are seated and the bus is moving through city streets.',
      activities: [{
        activity: 'Taking public transit (bus)',
        estimatedQuantity: '~0.5km',
        co2Kg: doc.co2Kg
      }],
      totalCO2Kg: doc.co2Kg,
      scoreChange: doc.co2Kg * 7.78,
      startTime: doc.startTime,
      endTime: doc.endTime,
      date: today,
      createdAt: new Date()
    });
  }
  
  console.log('Inserted', documents.length, 'bus trip documents for', today);
  await client.close();
}

insertBusData().catch(console.error);
