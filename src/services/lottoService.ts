import { collection, doc, setDoc, deleteDoc, writeBatch, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { LottoResult } from "../types";

const COLLECTION_NAME = "lotto_results";

/**
 * Adds or overwrites a single lottery result in Firestore.
 */
export async function addLottoResultToFirestore(result: LottoResult): Promise<void> {
  const docRef = doc(db, COLLECTION_NAME, result.id);
  await setDoc(docRef, result);
}

/**
 * Deletes a single lottery result from Firestore by ID.
 */
export async function deleteLottoResultFromFirestore(id: string): Promise<void> {
  const docRef = doc(db, COLLECTION_NAME, id);
  await deleteDoc(docRef);
}

/**
 * Updates a single lottery result in Firestore.
 */
export async function updateLottoResultInFirestore(result: LottoResult): Promise<void> {
  const docRef = doc(db, COLLECTION_NAME, result.id);
  await setDoc(docRef, result);
}

/**
 * Saves a list of lottery results to Firestore using chunked batch writes
 * to respect the 500-operations limit of Firestore batches.
 */
export async function saveBulkLottoResultsToFirestore(results: LottoResult[]): Promise<void> {
  const chunkSize = 400; // conservative limit
  for (let i = 0; i < results.length; i += chunkSize) {
    const chunk = results.slice(i, i + chunkSize);
    const batch = writeBatch(db);
    for (const r of chunk) {
      const docRef = doc(db, COLLECTION_NAME, r.id);
      batch.set(docRef, r);
    }
    await batch.commit();
  }
}

/**
 * Resets the Firestore collection back to the preloaded set.
 * Deletes all existing documents and inserts the preloaded list in batch.
 */
export async function resetLottoResultsInFirestore(preloaded: LottoResult[]): Promise<void> {
  const colRef = collection(db, COLLECTION_NAME);
  const snapshot = await getDocs(colRef);
  const docs = snapshot.docs;

  // 1. Delete all existing documents in chunks
  const deleteChunkSize = 400;
  for (let i = 0; i < docs.length; i += deleteChunkSize) {
    const chunk = docs.slice(i, i + deleteChunkSize);
    const batch = writeBatch(db);
    chunk.forEach((doc) => {
      batch.delete(doc.ref);
    });
    await batch.commit();
  }

  // 2. Write the preloaded list in chunks
  await saveBulkLottoResultsToFirestore(preloaded);
}
