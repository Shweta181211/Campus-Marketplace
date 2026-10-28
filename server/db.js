import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'

let memoryServer = null

export async function connectDB() {
  const preferMemory = process.env.USE_MEMORY_DB === 'true'
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/campus-marketplace'

  if (preferMemory) {
    return startMemoryDB()
  }

  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 2500 })
    console.log(`MongoDB connected: ${uri}`)
    return { mode: 'local', uri }
  } catch (err) {
    if (process.env.USE_MEMORY_DB === 'false') {
      throw err
    }
    console.warn(`Local MongoDB unavailable (${err.message}). Starting in-memory MongoDB...`)
    return startMemoryDB()
  }
}

async function startMemoryDB() {
  memoryServer = await MongoMemoryServer.create()
  const uri = memoryServer.getUri('campus-marketplace')
  await mongoose.connect(uri)
  console.log('MongoDB connected: in-memory (mongodb-memory-server)')
  return { mode: 'memory', uri }
}

export async function disconnectDB() {
  await mongoose.disconnect()
  if (memoryServer) {
    await memoryServer.stop()
    memoryServer = null
  }
}
