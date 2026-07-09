-- Seed demo data for material detail page rendering from backend DB.
-- Idempotent: safe to run multiple times.

INSERT INTO users (id, email, password_hash, role)
VALUES
  ('teacher_demo_detail', 'teacher.detail.demo@test.com', '$2b$10$placeholderhashforseedonly1234567890123456789012', 'teacher'),
  ('parent_demo_detail_1', 'parent.detail.1@test.com', '$2b$10$placeholderhashforseedonly1234567890123456789012', 'parent'),
  ('parent_demo_detail_2', 'parent.detail.2@test.com', '$2b$10$placeholderhashforseedonly1234567890123456789012', 'parent')
ON CONFLICT (id) DO NOTHING;

INSERT INTO materials (
  id,
  title,
  description,
  price,
  category,
  age_range,
  teaching_objective,
  teaching_methods,
  usage_duration,
  activity_steps,
  extension_value,
  short_description,
  material_features,
  cover_image_url,
  demo_video_url,
  teacher_id,
  status,
  file_key,
  ip_declaration_accepted,
  ip_declaration_at
)
VALUES (
  'mat_detail_seed_1',
  '主題圖卡：超市購物配對',
  '透過超市場景與圖卡任務，讓孩子在互動中學習分類、語言表達與觀察能力。',
  299,
  'language',
  '適合 4-8 歲',
  '提升孩子在真實情境中的分類能力與口語表達。',
  '["配對遊戲","搶答活動"]'::jsonb,
  '約 2 堂課',
  E'1. 先帶孩子認識地點與物品圖卡。\n2. 進行配對遊戲，說出原因。\n3. 用搶答活動練習快速辨識與口語描述。',
  '可延伸為角色扮演購物活動。',
  '生活情境圖卡教材，孩子容易投入。',
  ARRAY['圖卡教材','配對遊戲','搶答活動','分類能力','語言表達','觀察能力','小組課','可獨立完成']::text[],
  'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=1200&q=80',
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  'teacher_demo_detail',
  'published',
  'seed/materials/mat_detail_seed_1.pdf',
  TRUE,
  NOW()
)
ON CONFLICT (id) DO UPDATE
SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  price = EXCLUDED.price,
  category = EXCLUDED.category,
  age_range = EXCLUDED.age_range,
  teaching_objective = EXCLUDED.teaching_objective,
  teaching_methods = EXCLUDED.teaching_methods,
  usage_duration = EXCLUDED.usage_duration,
  activity_steps = EXCLUDED.activity_steps,
  extension_value = EXCLUDED.extension_value,
  short_description = EXCLUDED.short_description,
  material_features = EXCLUDED.material_features,
  cover_image_url = EXCLUDED.cover_image_url,
  demo_video_url = EXCLUDED.demo_video_url,
  teacher_id = EXCLUDED.teacher_id,
  status = EXCLUDED.status,
  file_key = EXCLUDED.file_key,
  ip_declaration_accepted = EXCLUDED.ip_declaration_accepted,
  ip_declaration_at = EXCLUDED.ip_declaration_at,
  updated_at = NOW();

DELETE FROM material_contents WHERE material_id = 'mat_detail_seed_1';
INSERT INTO material_contents (id, material_id, type, name, count, description, sort_order)
VALUES
  (gen_random_uuid()::text, 'mat_detail_seed_1', 'location_cards', '地點圖卡', 4, '超市、收銀台、蔬果區、飲料區', 0),
  (gen_random_uuid()::text, 'mat_detail_seed_1', 'item_cards', '物品圖卡', 24, '常見蔬果與日用品圖卡', 1),
  (gen_random_uuid()::text, 'mat_detail_seed_1', 'task_cards', '任務圖卡', 6, '配對與搶答任務提示卡', 2);

DELETE FROM material_images WHERE material_id = 'mat_detail_seed_1';
INSERT INTO material_images (id, material_id, image_url, alt_text, sort_order)
VALUES
  (gen_random_uuid()::text, 'mat_detail_seed_1', 'https://images.unsplash.com/photo-1601599561213-832382fd07ba?auto=format&fit=crop&w=1000&q=80', '教材圖卡近拍', 0),
  (gen_random_uuid()::text, 'mat_detail_seed_1', 'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?auto=format&fit=crop&w=1000&q=80', '孩子進行配對遊戲', 1);

INSERT INTO review (id, material_id, parent_id, rating, comment, created_at)
VALUES
  (gen_random_uuid()::text, 'mat_detail_seed_1', 'parent_demo_detail_1', 5, '孩子很喜歡配對與搶答，專注度比平常好很多。', NOW() - INTERVAL '2 days'),
  (gen_random_uuid()::text, 'mat_detail_seed_1', 'parent_demo_detail_2', 4, '圖卡設計清楚，帶小組活動很好用。', NOW() - INTERVAL '1 day')
ON CONFLICT (material_id, parent_id) DO UPDATE
SET
  rating = EXCLUDED.rating,
  comment = EXCLUDED.comment,
  created_at = EXCLUDED.created_at;
