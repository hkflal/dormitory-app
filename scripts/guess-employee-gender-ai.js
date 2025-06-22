const admin = require('firebase-admin');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const serviceAccount = require(path.join(__dirname, '..', 'serviceAccountKey.json'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// --- Use Gemini API ---
const API_KEY = 'AIzaSyBoHXiIAyX-8ZYW3oYiAnUkh9nvEnK1pEs';
const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest" });

async function guessGender(name) {
  const prompt = `In a single lowercase word answer "male" or "female". The Chinese name \"${name}\" most likely belongs to which gender?`;
  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const answer = response.text().trim().toLowerCase();
    return answer.includes('female') ? 'female' : 'male';
  } catch (error) {
    console.error(`Could not guess gender for ${name}:`, error.message);
    return 'male'; // Default to male on error
  }
}

(async () => {
  const snap = await db.collection('employees').get();
  let updated = 0;
  const promises = [];

  for (const doc of snap.docs) {
    const data = doc.data();
    // Only process if gender is missing or default 'male'
    if (!data.gender || data.gender === 'male') {
      const name = data.name;
      if (!name) continue;

      const promise = guessGender(name).then(gender => {
        if (gender !== (data.gender || 'male')) {
          updated++;
          console.log(`Setting ${name} -> ${gender}`);
          return doc.ref.update({ gender });
        }
      });
      promises.push(promise);
    }
  }

  await Promise.all(promises);

  console.log(`Updated gender for ${updated} employees using Gemini.`);
  process.exit(0);
})();