import mongoose from 'mongoose';
import { 
    NODE_ENV,
    MONGO_URI,
} from "../providers/env.js";


if (!MONGO_URI) {
    throw new Error('Please define the MONGODB_URI environment variable inside .env.<development/production>.local')
}

// Connect to Mongodb

const connectToDatabase = async () => {
    try {
        await mongoose.connect(MONGO_URI);
        console.log(`Connected to database in ${NODE_ENV} mode`);
    } catch (error) {
        console.error('Error connecting to database: ', error);
        process.exit(1);
    }
}

export default connectToDatabase;
