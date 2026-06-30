import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDocFromServer } from "firebase/firestore";
import firebaseConfig from "../firebase-applet-config.json";

// Initialize Firebase App
const app = initializeApp(firebaseConfig);

// Initialize Firestore using the specific databaseId from the config via getFirestore
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId || "(default)");

// Test the connection as mandated by system security/connectivity specs
async function testConnection() {
  try {
    await getDocFromServer(doc(db, "test", "connection"));
    console.log("Firebase Firestore connected successfully.");
  } catch (error) {
    if (error instanceof Error && error.message.includes("the client is offline")) {
      console.error("Please check your Firebase configuration: Client is offline.");
    } else {
      console.log("Firestore connection check processed:", error);
    }
  }
}

testConnection();
