import type { Baseline } from "../schemas/baseline";

export const beginnerPersona: Baseline = {
  id: "baseline_beginner_marco",
  userId: "user_marco_01",
  version: 1,
  validFrom: "2026-10-26T00:00:00.000Z",
  supersededAt: null,
  profile: {
    birthDate: "1992-05-14",
    sex: "male",
    heightCm: 178,
    weightKg: 78,
    athleteBackground: null,
    experienceTier: "novice",
    history: {
      sports: [{ sport: "running", level: "none", yearsRegular: 0, detrainingMonths: 0 }],
    },
    capacity: {
      lastActivityDate: null,
      activeWeeks: 8,
      weeklySessions: 3,
      longestRecentSessionMin: 40,
      recent5kSec: null,
      source: "manual",
      asOf: null,
    },
    sports: ["running", "strength"],
    timezone: "Europe/Rome",
    tone: "direct",
    units: "metric",
  },
  anamnesis: {
    conditions: [],
    medications: [],
    injuries: [],
    redFlags: [],
    parqCleared: true,
    freeText:
      "Ho iniziato a correre 2 mesi fa per rimettermi in forma. Non ho patologie né infortuni.",
  },
  goals: {
    primary: {
      type: "performance",
      sport: "running",
      description: "Completare un 5k in meno di 28 minuti",
      targetDate: "2027-01-20",
      metric: "5k_time_sec",
      targetValue: 1680,
      targetUnit: "seconds",
      priority: "primary",
    },
    secondary: [
      {
        type: "habit",
        description: "Mantenere 3 uscite di allenamento costanti ogni settimana",
        priority: "secondary",
      },
    ],
  },
  availability: {
    days: [
      {
        day: "tue",
        windows: [{ start: "06:30", end: "07:30" }],
        maxDurationMin: 45,
      },
      {
        day: "thu",
        windows: [{ start: "06:30", end: "07:30" }],
        maxDurationMin: 45,
      },
      {
        day: "sat",
        windows: [{ start: "08:00", end: "09:30" }],
        maxDurationMin: 60,
      },
    ],
    blackouts: [],
  },
  equipment: {
    items: ["bodyweight", "resistance_band"],
    gymAccess: false,
    poolAccess: false,
    notes: "Allenamento outdoor e casa",
  },
  preferences: {
    dislikedExercises: ["burpees"],
    dislikedSports: ["swimming"],
    tone: "direct",
    units: "metric",
    audioCues: true,
    reminderMinutesBefore: 30,
  },
  summary:
    "Marco, 34 anni, principiante con anamnesi libera. Obiettivo 5k sub-28 min con 3 allenamenti a settimana da 45 min.",
};

export const intermediatePersona: Baseline = {
  id: "baseline_intermediate_giulia",
  userId: "user_giulia_02",
  version: 1,
  validFrom: "2026-10-26T00:00:00.000Z",
  supersededAt: null,
  profile: {
    birthDate: "1997-09-22",
    sex: "female",
    heightCm: 168,
    weightKg: 60,
    athleteBackground: "consistent",
    experienceTier: "trained",
    history: {
      sports: [{ sport: "running", level: "amateur", yearsRegular: 4, detrainingMonths: 0 }],
    },
    capacity: {
      lastActivityDate: null,
      activeWeeks: 60,
      weeklySessions: 5,
      longestRecentSessionMin: 90,
      recent5kSec: 1500,
      source: "manual",
      asOf: null,
    },
    sports: ["running", "strength", "cycling"],
    timezone: "Europe/Rome",
    tone: "analytical",
    units: "metric",
  },
  anamnesis: {
    conditions: [],
    medications: [],
    injuries: [
      {
        area: "shoulder",
        status: "resolved",
        painLevel: 0,
        restrictions: [],
        notes: "Vecchio fastidio cuffia dei rotatori, risolto 6 mesi fa.",
      },
    ],
    redFlags: [],
    parqCleared: true,
    freeText:
      "Corro regolarmente 3-4 volte a settimana con 2 sedute di forza in palestra. Nessuna limitazione attiva.",
  },
  goals: {
    primary: {
      type: "race",
      sport: "running",
      description: "Mezza maratona sub-1h45 (105 min)",
      targetDate: "2027-03-15",
      metric: "half_marathon_sec",
      targetValue: 6300,
      targetUnit: "seconds",
      priority: "primary",
    },
    secondary: [
      {
        type: "strength",
        description: "Mantenere squat a 1.2x peso corporeo e mobilità arti inferiori",
        priority: "secondary",
      },
    ],
  },
  availability: {
    days: [
      {
        day: "mon",
        windows: [{ start: "18:00", end: "19:30" }],
        maxDurationMin: 60,
      },
      {
        day: "wed",
        windows: [{ start: "18:00", end: "19:30" }],
        maxDurationMin: 60,
      },
      {
        day: "fri",
        windows: [{ start: "18:00", end: "19:30" }],
        maxDurationMin: 60,
      },
      {
        day: "sat",
        windows: [{ start: "09:00", end: "11:00" }],
        maxDurationMin: 90,
      },
      {
        day: "sun",
        windows: [{ start: "09:00", end: "11:30" }],
        maxDurationMin: 120,
      },
    ],
    blackouts: [],
  },
  equipment: {
    items: ["barbell", "dumbbells", "kettlebell", "foam_roller"],
    gymAccess: true,
    poolAccess: false,
    notes: "Abbonamento palestra full",
  },
  preferences: {
    dislikedExercises: [],
    dislikedSports: [],
    tone: "analytical",
    units: "metric",
    audioCues: true,
    reminderMinutesBefore: 45,
  },
  summary:
    "Giulia, 29 anni, atleta intermedia. Obiettivo mezza maratona sub-1h45 e mantenimento forza (5 sedute/settimana).",
};

export const kneePainPersona: Baseline = {
  id: "baseline_injury_luca",
  userId: "user_luca_03",
  version: 1,
  validFrom: "2026-10-26T00:00:00.000Z",
  supersededAt: null,
  profile: {
    birthDate: "1984-11-03",
    sex: "male",
    heightCm: 182,
    weightKg: 84,
    athleteBackground: "consistent",
    experienceTier: "trained",
    history: {
      sports: [{ sport: "running", level: "amateur", yearsRegular: 3, detrainingMonths: 6 }],
    },
    capacity: {
      lastActivityDate: null,
      activeWeeks: 10,
      weeklySessions: 3,
      longestRecentSessionMin: 50,
      recent5kSec: null,
      source: "manual",
      asOf: null,
    },
    sports: ["cycling", "swimming", "strength", "running"],
    timezone: "Europe/Rome",
    tone: "direct",
    units: "metric",
  },
  anamnesis: {
    conditions: [],
    medications: [],
    injuries: [
      {
        area: "right_knee",
        status: "recovering",
        painLevel: 5,
        restrictions: ["no_plyometrics", "no_downhill_running", "no_deep_squat_past_90_deg"],
        notes:
          "Tendinopatia rotulea ginocchio destro con dolore 5/10. Evitare carichi d'impatto ad alta velocità.",
      },
    ],
    redFlags: [],
    parqCleared: true,
    freeText:
      "Tendinopatia rotulea destra attiva. Devo evitare impatti duri e balzi. Ciclismo e nuoto non danno dolore.",
  },
  goals: {
    primary: {
      type: "health",
      sport: "cycling",
      description:
        "Sviluppare capacità aerobica e rinforzare catena cinetica senza dolore al ginocchio",
      targetDate: "2027-02-28",
      metric: "weekly_active_hours",
      targetValue: 5,
      targetUnit: "hours",
      priority: "primary",
    },
    secondary: [
      {
        type: "strength",
        description: "Isometrie quadricipite (Spanish squat/wall sit) e mobilità anche",
        priority: "secondary",
      },
    ],
  },
  availability: {
    days: [
      {
        day: "tue",
        windows: [{ start: "19:00", end: "20:00" }],
        maxDurationMin: 60,
      },
      {
        day: "thu",
        windows: [{ start: "19:00", end: "20:00" }],
        maxDurationMin: 60,
      },
      {
        day: "sat",
        windows: [{ start: "10:00", end: "11:30" }],
        maxDurationMin: 75,
      },
      {
        day: "sun",
        windows: [{ start: "09:30", end: "11:00" }],
        maxDurationMin: 75,
      },
    ],
    blackouts: [],
  },
  equipment: {
    items: ["indoor_bike", "pool", "dumbbells", "resistance_band", "foam_roller"],
    gymAccess: false,
    poolAccess: true,
    notes: "Home bike + piscina comunale",
  },
  preferences: {
    dislikedExercises: ["jump_squats", "box_jumps", "walking_lunges"],
    dislikedSports: ["running"],
    tone: "direct",
    units: "metric",
    audioCues: true,
    reminderMinutesBefore: 30,
  },
  summary:
    "Luca, 42 anni, gestione attiva di tendinopatia rotulea destra (dolore 5/10). Focus su bici, nuoto e isometrie.",
};

/**
 * The case a single "experience" enum cannot represent: twelve years of
 * competitive running, two years completely off, three weeks back. The tier is
 * `returning`, so the plan keeps the volume capped and defers intensity even
 * though the athlete's background is far above a beginner's.
 */
export const returningPersona: Baseline = {
  id: "baseline_returning_sara",
  userId: "user_sara_04",
  version: 1,
  validFrom: "2026-10-26T00:00:00.000Z",
  supersededAt: null,
  profile: {
    birthDate: "1990-03-11",
    sex: "female",
    heightCm: 170,
    weightKg: 62,
    athleteBackground: "amateur_competitive",
    experienceTier: "returning",
    history: {
      sports: [{ sport: "running", level: "competitive", yearsRegular: 12, detrainingMonths: 24 }],
    },
    capacity: {
      lastActivityDate: null,
      activeWeeks: 3,
      weeklySessions: 2,
      longestRecentSessionMin: 35,
      recent5kSec: null,
      source: "manual",
      asOf: null,
    },
    sports: ["running", "strength"],
    timezone: "Europe/Rome",
    tone: "supportive",
    units: "metric",
  },
  anamnesis: {
    conditions: [],
    medications: [],
    injuries: [],
    redFlags: [],
    parqCleared: true,
    freeText:
      "Ex mezzofondista (800m) a livello agonistico fino a due anni fa, poi stop totale. Ho ripreso da tre settimane con due uscite facili.",
  },
  goals: {
    primary: {
      type: "performance",
      sport: "running",
      description: "Tornare sotto i 50 minuti sui 10k dopo due anni di stop",
      targetDate: "2027-02-15",
      metric: "10k_time_sec",
      targetValue: 3000,
      targetUnit: "seconds",
      priority: "primary",
    },
    secondary: [
      {
        type: "strength",
        description: "Ricostruire forza di base e prevenzione infortuni",
        priority: "secondary",
      },
    ],
  },
  availability: {
    days: [
      { day: "mon", windows: [{ start: "07:00", end: "08:00" }], maxDurationMin: 60 },
      { day: "thu", windows: [{ start: "07:00", end: "08:00" }], maxDurationMin: 60 },
      { day: "sat", windows: [{ start: "09:00", end: "10:15" }], maxDurationMin: 75 },
      { day: "sun", windows: [{ start: "09:00", end: "10:00" }], maxDurationMin: 60 },
    ],
    blackouts: [],
  },
  equipment: {
    items: ["treadmill", "dumbbells", "resistance_band", "foam_roller"],
    gymAccess: false,
    poolAccess: false,
    notes: "Tapis roulant e manubri a casa",
  },
  preferences: {
    dislikedExercises: [],
    dislikedSports: [],
    tone: "supportive",
    units: "metric",
    audioCues: true,
    reminderMinutesBefore: 30,
  },
  summary:
    "Sara, 36 anni, ex agonista 800m ferma da 2 anni e ripartita da 3 settimane. Rientro: base nelle prime 2 settimane, intensità dalla terza, volume ridotto fino alla quarta.",
};
