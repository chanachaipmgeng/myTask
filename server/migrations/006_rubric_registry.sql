-- Migration 006: Rubric Registry for Dynamic Scoring & Tolerance Configuration

CREATE TABLE IF NOT EXISTS rubric_registry (
    rubric_id VARCHAR(40) PRIMARY KEY,
    version VARCHAR(20) NOT NULL DEFAULT 'v2026.4',
    category VARCHAR(30) NOT NULL,
    title VARCHAR(150) NOT NULL,
    applicable_track VARCHAR(30) DEFAULT 'ALL',
    params JSONB NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    updated_by VARCHAR(100),
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Seed Default Rubrics
INSERT INTO rubric_registry (rubric_id, category, title, applicable_track, params, description) VALUES
('RUB-SIZE-XS', 'SIZING', 'งานขนาดเล็กมาก (Quick Fix)', 'ALL', '{"story_point": 1, "base_md": 0.25, "focus_hours": 1.5, "tolerance_mode": "ABSOLUTE", "tol_md": 0.5, "min_ratio": 0.5, "max_ratio": 2.0}', 'แก้ UI/CSS เล็กน้อย หรือแก้ Query/Config ไม่เกินครึ่งวัน')
ON CONFLICT (rubric_id) DO NOTHING;

INSERT INTO rubric_registry (rubric_id, category, title, applicable_track, params, description) VALUES
('RUB-SIZE-S', 'SIZING', 'งานขนาดเล็ก (Standard Small)', 'ALL', '{"story_point": 2, "base_md": 0.5, "focus_hours": 3.0, "tolerance_mode": "ABSOLUTE", "tol_md": 0.5, "min_ratio": 0.5, "max_ratio": 2.0}', 'สร้าง Component ย่อย 1 ตัว หรือ CRUD API 1 เส้น')
ON CONFLICT (rubric_id) DO NOTHING;

INSERT INTO rubric_registry (rubric_id, category, title, applicable_track, params, description) VALUES
('RUB-SIZE-M', 'SIZING', 'งานขนาดกลาง (Feature Screen/API)', 'ALL', '{"story_point": 3, "base_md": 1.0, "focus_hours": 6.0, "tolerance_mode": "RATIO", "min_ratio": 0.8, "max_ratio": 1.5}', 'พัฒนาหน้าจอใหม่พร้อมกราฟ หรือออกแบบตาราง DB + API ซับซ้อน')
ON CONFLICT (rubric_id) DO NOTHING;

INSERT INTO rubric_registry (rubric_id, category, title, applicable_track, params, description) VALUES
('RUB-SIZE-L', 'SIZING', 'งานขนาดใหญ่ (Complex Module)', 'ALL', '{"story_point": 5, "base_md": 2.0, "focus_hours": 12.0, "tolerance_mode": "RATIO", "min_ratio": 0.85, "max_ratio": 1.3}', 'โมดูลใหม่เชื่อมหลายหน้าจอ หรือเชื่อม 3rd-Party API')
ON CONFLICT (rubric_id) DO NOTHING;

INSERT INTO rubric_registry (rubric_id, category, title, applicable_track, params, description) VALUES
('RUB-SIZE-XL', 'SIZING', 'งานขนาดใหญ่มาก / R&D Spike', 'ALL', '{"story_point": 8, "base_md": 3.0, "focus_hours": 18.0, "tolerance_mode": "RATIO", "min_ratio": 0.85, "max_ratio": 1.3}', 'Major Refactor หรืองานวิจัย RD-SPIKE ที่คุมด้วย Timebox')
ON CONFLICT (rubric_id) DO NOTHING;

INSERT INTO rubric_registry (rubric_id, category, title, applicable_track, params, description) VALUES
('RUB-TICK-STD', 'TICKET_SCORE', 'สูตรคะแนนรายใบงานมาตรฐาน (100 คะแนน)', 'ALL', '{"ontime_weight": 40, "accuracy_weight": 20, "review_weight": 20, "reopen_weight": 20, "reopen_penalty": 10}', 'โครงสร้างคะแนนใบงาน 4 แกนหลัก')
ON CONFLICT (rubric_id) DO NOTHING;

INSERT INTO rubric_registry (rubric_id, category, title, applicable_track, params, description) VALUES
('RUB-IDX-RD', 'PERSON_INDEX', 'สูตรดัชนีพัฒนาการสาย R&D (เป้า 75)', 'ALL', '{"dod_weight": 0.40, "spike_weight": 0.25, "quota_weight": 0.20, "quality_weight": 0.15, "target_score": 75.0, "spike_band_min": 15.0, "spike_band_max": 40.0}', 'ดัชนีวัดผลรายเดือนของทีม R&D')
ON CONFLICT (rubric_id) DO NOTHING;
