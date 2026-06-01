// db.js — IndexedDB schema via Dexie
//
// Dexie syntax for stores: 'primaryKey, indexedField, anotherIndex'
// ++ means auto-increment integer primary key.
// Only fields you want to query by need to be in the schema string;
// all other object properties are stored but not indexed.

const db = new Dexie('GolfSG');

db.version(1).stores({
  // One row per round played.
  // holes[] is stored as a JSON array inside the row — not indexed, just retrieved.
  rounds: '++id, courseId, date',

  // One row per tracked shot (Phase 2+). Not used in Phase 1.
  shots: '++id, roundId, holeNo',

  // User-added courses beyond the two pre-loaded in courses.json.
  customCourses: '++id, name',
});

// A round row looks like:
// {
//   id: 1,                      ← auto-assigned
//   courseId: 'te-puke',
//   courseName: 'Te Puke Golf Club',
//   date: '2026-06-01',
//   holes: [                    ← 18 entries, one per hole
//     { no: 1, par: 4, score: 5, putts: 2, firHit: true,  gir: false },
//     { no: 2, par: 5, score: 4, putts: 1, firHit: null,  gir: true  },
//     ...                       ← firHit is null for par 3s (no fairway)
//   ]
// }
