export type RubricCategory = 'SIZING' | 'TICKET_SCORE' | 'EXCEPTION' | 'PERSON_INDEX';

export interface SizingRubricParams {
  story_point: number;
  base_md: number;
  focus_hours: number;
  tolerance_mode: 'ABSOLUTE' | 'RATIO';
  tol_md?: number;
  min_ratio?: number;
  max_ratio?: number;
}

export interface TicketScoringParams {
  ontime_weight: number;
  accuracy_weight: number;
  review_weight: number;
  reopen_weight: number;
  reopen_penalty: number;
}

export interface PersonIndexParams {
  dod_weight: number;
  spike_weight: number;
  quota_weight: number;
  quality_weight: number;
  target_score: number;
  spike_band_min: number;
  spike_band_max: number;
}

export interface RubricDefinition<T = Record<string, unknown>> {
  rubric_id: string;
  version: string;
  category: RubricCategory;
  title: string;
  applicable_track: string;
  params: T;
  description: string;
  is_active: boolean;
  updated_by?: string | null;
  updated_at?: string;
}

export const DEFAULT_RUBRICS: Record<string, RubricDefinition> = {
  'RUB-SIZE-XS': {
    rubric_id: 'RUB-SIZE-XS',
    version: 'v2026.4',
    category: 'SIZING',
    title: 'งานขนาดเล็กมาก (Quick Fix)',
    applicable_track: 'ALL',
    params: {
      story_point: 1,
      base_md: 0.25,
      focus_hours: 1.5,
      tolerance_mode: 'ABSOLUTE',
      tol_md: 0.5,
      min_ratio: 0.5,
      max_ratio: 2.0,
    },
    description: 'แก้ UI/CSS เล็กน้อย หรือแก้ Query/Config ไม่เกินครึ่งวัน',
    is_active: true,
  },
  'RUB-SIZE-S': {
    rubric_id: 'RUB-SIZE-S',
    version: 'v2026.4',
    category: 'SIZING',
    title: 'งานขนาดเล็ก (Standard Small)',
    applicable_track: 'ALL',
    params: {
      story_point: 2,
      base_md: 0.5,
      focus_hours: 3.0,
      tolerance_mode: 'ABSOLUTE',
      tol_md: 0.5,
      min_ratio: 0.5,
      max_ratio: 2.0,
    },
    description: 'สร้าง Component ย่อย 1 ตัว หรือ CRUD API 1 เส้น',
    is_active: true,
  },
  'RUB-SIZE-M': {
    rubric_id: 'RUB-SIZE-M',
    version: 'v2026.4',
    category: 'SIZING',
    title: 'งานขนาดกลาง (Feature Screen/API)',
    applicable_track: 'ALL',
    params: {
      story_point: 3,
      base_md: 1.0,
      focus_hours: 6.0,
      tolerance_mode: 'RATIO',
      min_ratio: 0.8,
      max_ratio: 1.5,
    },
    description: 'พัฒนาหน้าจอใหม่พร้อมกราฟ หรือออกแบบตาราง DB + API ซับซ้อน',
    is_active: true,
  },
  'RUB-SIZE-L': {
    rubric_id: 'RUB-SIZE-L',
    version: 'v2026.4',
    category: 'SIZING',
    title: 'งานขนาดใหญ่ (Complex Module)',
    applicable_track: 'ALL',
    params: {
      story_point: 5,
      base_md: 2.0,
      focus_hours: 12.0,
      tolerance_mode: 'RATIO',
      min_ratio: 0.85,
      max_ratio: 1.3,
    },
    description: 'โมดูลใหม่เชื่อมหลายหน้าจอ หรือเชื่อม 3rd-Party API',
    is_active: true,
  },
  'RUB-SIZE-XL': {
    rubric_id: 'RUB-SIZE-XL',
    version: 'v2026.4',
    category: 'SIZING',
    title: 'งานขนาดใหญ่มาก / R&D Spike',
    applicable_track: 'ALL',
    params: {
      story_point: 8,
      base_md: 3.0,
      focus_hours: 18.0,
      tolerance_mode: 'RATIO',
      min_ratio: 0.85,
      max_ratio: 1.3,
    },
    description: 'Major Refactor หรืองานวิจัย RD-SPIKE ที่คุมด้วย Timebox',
    is_active: true,
  },
  'RUB-TICK-STD': {
    rubric_id: 'RUB-TICK-STD',
    version: 'v2026.4',
    category: 'TICKET_SCORE',
    title: 'สูตรคะแนนรายใบงานมาตรฐาน (100 คะแนน)',
    applicable_track: 'ALL',
    params: {
      ontime_weight: 40,
      accuracy_weight: 20,
      review_weight: 20,
      reopen_weight: 20,
      reopen_penalty: 10,
    },
    description: 'โครงสร้างคะแนนใบงาน 4 แกนหลัก',
    is_active: true,
  },
  'RUB-IDX-RD': {
    rubric_id: 'RUB-IDX-RD',
    version: 'v2026.4',
    category: 'PERSON_INDEX',
    title: 'สูตรดัชนีพัฒนาการสาย R&D (เป้า 75)',
    applicable_track: 'ALL',
    params: {
      dod_weight: 0.4,
      spike_weight: 0.25,
      quota_weight: 0.2,
      quality_weight: 0.15,
      target_score: 75.0,
      spike_band_min: 15.0,
      spike_band_max: 40.0,
    },
    description: 'ดัชนีวัดผลรายเดือนของทีม R&D',
    is_active: true,
  },
};

export function getRubricOrDefault<T = Record<string, unknown>>(
  rubricId: string,
  overrides?: Record<string, RubricDefinition>,
): RubricDefinition<T> {
  const match = overrides?.[rubricId] ?? DEFAULT_RUBRICS[rubricId];
  if (!match) {
    throw new Error(`Rubric with id '${rubricId}' not found.`);
  }
  return match as RubricDefinition<T>;
}
