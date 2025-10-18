ALTER TABLE contest_participants DROP CONSTRAINT contest_participants_contest_id_fkey;

ALTER TABLE contest_participants
    ADD CONSTRAINT contest_participants_contest_id_fkey
    FOREIGN KEY (contest_id)
    REFERENCES contests(id)
    ON DELETE CASCADE;
