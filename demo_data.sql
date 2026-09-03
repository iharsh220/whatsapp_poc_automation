UPDATE doctors SET birthday = '1980-09-02', updatedAt = NOW() WHERE id = 1;
UPDATE doctors SET birthday = '1985-09-02', updatedAt = NOW() WHERE id = 2;
UPDATE doctors SET birthday = '1978-09-02', updatedAt = NOW() WHERE id = 3;
UPDATE doctors SET birthday = '1990-09-02', updatedAt = NOW() WHERE id = 4;
UPDATE doctors SET birthday = '1982-09-02', updatedAt = NOW() WHERE id = 5;

-- Verify
SELECT id, name, phone, birthday,
  CASE WHEN MONTH(birthday) = MONTH(NOW()) AND DAY(birthday) = DAY(NOW()) THEN 'YES' ELSE 'NO' END AS birthday_today
FROM doctors;
