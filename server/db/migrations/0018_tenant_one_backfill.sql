INSERT INTO organizations (name, slug)
SELECT 'Default Organization', 'default'
WHERE NOT EXISTS (SELECT 1 FROM organizations WHERE slug = 'default');

INSERT INTO memberships (user_id, organization_id, role)
SELECT u.id, (SELECT id FROM organizations WHERE slug = 'default'), 'owner'
FROM users u
WHERE u.is_admin = true
  AND NOT EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = u.id);
