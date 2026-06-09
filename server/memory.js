const { ChromaClient } = require('chromadb');
const { getEmbedding } = require('./ollama');
const { v4: uuidv4 } = require('uuid');

const client = new ChromaClient({ path: "http://localhost:8000" });
let collection;

const initMemory = async () => {
  let retries = 5;
  while(retries) {
    try {
      const dummyEmbedder = { generate: async (texts) => texts.map(() => [0]) };
      collection = await client.getOrCreateCollection({
        name: "user_memory",
        embeddingFunction: dummyEmbedder,
        metadata: { "hnsw:space": "cosine" }
      });
      console.log('✅ ChromaDB connected and collection ready');
      break;
    } catch(err) {
      console.error('ChromaDB connection error, retrying...', err.message);
      retries -= 1;
      await new Promise(r => setTimeout(r, 2000));
      if (!retries) {
        console.error('Failed to connect to ChromaDB. Memory features will be disabled.');
      }
    }
  }
};

async function saveMemory(userId, text) {
  if (!collection) return;
  try {
    const embedding = await getEmbedding(text);
    if (!embedding) return;

    await collection.add({
      ids: [uuidv4()],
      embeddings: [embedding],
      metadatas: [{ user_id: userId, timestamp: Date.now() }],
      documents: [text]
    });
  } catch (err) {
    console.error('Error saving memory:', err);
  }
}

async function retrieveMemory(userId, queryText, limit = 3) {
  if (!collection) return [];
  try {
    const embedding = await getEmbedding(queryText);
    if (!embedding) return [];

    const results = await collection.query({
      queryEmbeddings: [embedding],
      nResults: limit,
      where: { user_id: userId }
    });

    return results.documents[0] || [];
  } catch (err) {
    console.error('Error retrieving memory:', err);
    return [];
  }
}

module.exports = { initMemory, saveMemory, retrieveMemory };
