// db.js — IndexedDB schema via Dexie

const db = new Dexie('GolfSG');

// Version 1: original schema.
db.version(1).stores({
  rounds:        '++id, courseId, date',
  shots:         '++id, roundId, holeNo',
  customCourses: '++id, name',
});

// Version 2: drop the old customCourses table (integer PK) and introduce a new
// `courses` table with a user-supplied string id. Dexie cannot change a table's
// primary key type in-place, so we rename the store instead.
// No data migration needed — v1 customCourses was always empty in this project.
db.version(2).stores({
  rounds:        '++id, courseId, date',
  shots:         '++id, roundId, holeNo',
  customCourses: null,      // drop old table
  courses:       'id, name', // new table: id is a user-supplied string
});

// ── Schema reference ────────────────────────────────────────────────────────
//
// rounds row:
// {
//   id: 1,                        ← auto-assigned
//   courseId:   'te-puke',
//   courseName: 'Te Puke Golf Club',
//   teeName:    'White',          ← snapshot at round start; survives course edits
//   teeRating:  69.5,             ← stored for handicap differential (Phase 4+)
//   teeSlope:   124,
//   date:       '2026-06-01',
//   holes: [
//     { no:1, par:4, si:9, metres:318, score:5, putts:2, firHit:true, gir:false },
//     ...
//   ]
// }
//
// courses row (user-edited overrides for built-in courses, or new courses):
// {
//   id:       'te-puke',           ← matches built-in id → overrides JSON default
//   name:     'Te Puke Golf Club',
//   location: 'Te Puke, Bay of Plenty, NZ',
//   tees: [
//     { name:'Blue', rating:71.2, slope:128, distances:[340,490,...] },  ← 18 values
//     { name:'White', rating:69.5, slope:124, distances:[318,468,...] }
//   ],
//   holes: [
//     { no:1, par:4, si:9 },       ← par and SI are tee-independent
//     ...
//   ]
// }
