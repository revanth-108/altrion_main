import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function checkCollections() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    console.log('Database:', mongoose.connection.name);

    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log('\nCurrent collections:');

    for (const col of collections) {
      const count = await mongoose.connection.db.collection(col.name).countDocuments();
      console.log(`  - ${col.name} (${count} documents)`);
    }

    await mongoose.connection.close();
    console.log('\nConnection closed');
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkCollections();
