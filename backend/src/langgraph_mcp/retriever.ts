/**
 * Manage the configuration of various retrievers.
 *
 * This module creates and manages retrievers for different
 * vector store backends. Currently supported:
 * - Milvus
 *
 * Retrievers are used ONLY for routing (not answering).
 */

import { RunnableConfig } from "@langchain/core/runnables";
import { Embeddings } from "@langchain/core/embeddings";
import { VectorStoreRetriever } from "@langchain/core/vectorstores";

import { Configuration } from "./configuration.js";

/* =========================================================
 * Encoder (Embedding Model) Factory
 * =========================================================
 */

/**
 * Create an embedding model based on provider/model string.
 * Example: "openai/text-embedding-3-large"
 */
export async function makeTextEncoder(model: string): Promise<Embeddings> {
  const [provider, modelName] = model.split("/", 2);

  switch (provider) {
    case "openai": {
      const { OpenAIEmbeddings } = await import("@langchain/openai");
      return new OpenAIEmbeddings({ model: modelName });
    }

    default:
      throw new Error(`Unsupported embedding provider: ${provider}`);
  }
}

/* =========================================================
 * Milvus Retriever
 * =========================================================
 */

/**
 * Create a Milvus-backed retriever.
 *
 * Uses:
 * - HTTP URI → remote Milvus
 * - File URI → Milvus Lite
 */
export async function makeMilvusRetriever(
  configuration: Configuration,
  embeddingModel: Embeddings
): Promise<VectorStoreRetriever> {
  const { Milvus } = await import("@langchain/community/vectorstores/milvus");

  const uri = process.env.MILVUS_DB;
  const token = process.env.MILVUS_TOKEN;

  if (!uri) {
    throw new Error("MILVUS_DB environment variable is not set");
  }

  if (!token) {
    throw new Error("MILVUS_TOKEN environment variable is not set");
  }

  const vectorStore = new Milvus(embeddingModel, {
    url: uri,
    collectionName: "routing_vectors",
    clientConfig: {
      address: uri,
      token,
    },
  });

  return vectorStore.asRetriever();
}

/* =========================================================
 * Unified Retriever Factory
 * =========================================================
 */

/**
 * Create a retriever based on the current configuration.
 *
 * This is used inside LangGraph nodes like:
 * `with make_retriever(config)`
 */
export async function makeRetriever(
  config: RunnableConfig
): Promise<VectorStoreRetriever> {
  const configuration = Configuration.fromRunnableConfig(config);

  const embeddingModel = await makeTextEncoder(configuration.embeddingModel);

  switch (configuration.retrieverProvider) {
    case "milvus":
      return await makeMilvusRetriever(configuration, embeddingModel);

    default:
      throw new Error(
        `Unrecognized retrieverProvider in configuration. ` +
          `Got: ${configuration.retrieverProvider}`
      );
  }
}
