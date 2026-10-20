INSERT INTO main_events (id, event_name, start_date, updated_at)
VALUES ('00000000-0000-4000-8000-000000000001', 'Evento histórico de prueba', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
INSERT INTO editions (id, main_event_id, name)
VALUES ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'Edición histórica');
INSERT INTO profiles (id, first_name, last_name, additional_emails, updated_at)
VALUES ('00000000-0000-4000-8000-000000000003', 'Persona', 'Histórica', '["HISTORICO@example.test"]', CURRENT_TIMESTAMP);
INSERT INTO participant_roles (id, main_event_id, name)
VALUES ('00000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000001', 'speaker');
INSERT INTO event_participants (id, edition_id, profile_id, role_id, checked_in)
VALUES ('00000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000004', true);
