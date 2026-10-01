-- CANTUM: target Stage is authoritative after native runtime cutover.
-- Legacy Stage state must no longer overwrite canonical StageSessionState.

drop trigger if exists band_stage_states_target_projection on public.band_stage_states;
