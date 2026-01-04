import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

// Collections that should be kept
const ALLOWED_COLLECTIONS = ['users', 'sessions'];

async function cleanupDatabase() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    console.log('Database:', mongoose.connection.name);

    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log('\n📋 Current collections:');

    const collectionsToRemove = [];

    for (const col of collections) {
      const count = await mongoose.connection.db.collection(col.name).countDocuments();
      const isAllowed = ALLOWED_COLLECTIONS.includes(col.name);

      if (isAllowed) {
        console.log(`  ✅ ${col.name} (${count} documents) - KEEPING`);
      } else {
        console.log(`  ❌ ${col.name} (${count} documents) - WILL REMOVE`);
        collectionsToRemove.push(col.name);
      }
    }

    if (collectionsToRemove.length > 0) {
      console.log('\n🗑️  Removing unnecessary collections...');
      for (const colName of collectionsToRemove) {
        await mongoose.connection.db.dropCollection(colName);
        console.log(`  Removed: ${colName}`);
      }
      console.log('\n✨ Database cleaned successfully!');
    } else {
      console.log('\n✨ Database is already clean - no unnecessary collections found!');
    }

    console.log('\n📊 Final collections:');
    const finalCollections = await mongoose.connection.db.listCollections().toArray();
    for (const col of finalCollections) {
      const count = await mongoose.connection.db.collection(col.name).countDocuments();
      console.log(`  - ${col.name} (${count} documents)`);
    }

    await mongoose.connection.close();
    console.log('\n✅ Connection closed');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

cleanupDatabase();
