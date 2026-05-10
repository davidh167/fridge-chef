import os

import chromadb
from chromadb.errors import NotFoundError
from dotenv import load_dotenv
from llama_index.core import Settings, StorageContext, VectorStoreIndex
from llama_index.core.node_parser import SentenceSplitter
from llama_index.embeddings.openai import OpenAIEmbedding
from llama_index.llms.openai import OpenAI
from llama_index.readers.file import PyMuPDFReader
from llama_index.vector_stores.chroma import ChromaVectorStore

load_dotenv()

COLLECTION_NAME = "fridge_chef_docs"
CHROMA_PERSIST_DIR = os.environ.get("CHROMA_PERSIST_DIR", "./chroma_store")

Settings.embed_model = OpenAIEmbedding(model="text-embedding-3-small")
Settings.node_parser = SentenceSplitter(chunk_size=512, chunk_overlap=50)
Settings.llm = OpenAI(model="gpt-4o-mini")

_retriever = None


def _chroma_client() -> chromadb.PersistentClient:
    return chromadb.PersistentClient(path=CHROMA_PERSIST_DIR)


def ingest_pdf(filepath: str) -> None:
    global _retriever

    # PyMuPDFReader extracts clean text from real-world PDFs reliably;
    # SimpleDirectoryReader's default pypdf backend returns binary junk on complex layouts
    docs = PyMuPDFReader().load(file_path=filepath)

    client = _chroma_client()
    try:
        client.delete_collection(COLLECTION_NAME)
    except NotFoundError:
        pass

    collection = client.create_collection(COLLECTION_NAME)
    vector_store = ChromaVectorStore(chroma_collection=collection)
    storage_context = StorageContext.from_defaults(vector_store=vector_store)

    VectorStoreIndex.from_documents(docs, storage_context=storage_context)

    _retriever = None


def get_query_engine():
    # kept for backward compatibility (prewarm call in agent.py)
    global _retriever

    if _retriever is not None:
        return _retriever

    client = _chroma_client()
    collection = client.get_collection(COLLECTION_NAME)
    vector_store = ChromaVectorStore(chroma_collection=collection)
    index = VectorStoreIndex.from_vector_store(vector_store)

    # Use a retriever instead of a query engine — returns raw book text
    # rather than an LLM-synthesized summary, so GPT-4o-mini in agent.py
    # works from the actual source material rather than a paraphrase of it
    _retriever = index.as_retriever(similarity_top_k=3)
    return _retriever


def query(question: str) -> str:
    nodes = get_query_engine().retrieve(question)
    # Join the raw chunk text from the book with a separator
    return "\n\n---\n\n".join(node.get_content() for node in nodes)


if __name__ == "__main__":
    ingest_pdf("../data/salt_fat_acid_heat.pdf")
    result = query("What does Nosrat say about the role of salt in cooking?")
    print(result)
