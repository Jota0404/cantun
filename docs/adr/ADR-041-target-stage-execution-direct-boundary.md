# ADR-041 — Direct Target Stage Execution Boundary

## Status
Accepted.

## Context
The canonical Stage identity is `StageSession.id`. Target Stage RPCs already provide the canonical command surface while the legacy Band runtime remains necessary for realtime compatibility and fallback.

## Decision
`StageExecutionService` executes target Stage commands directly through the target RPCs:

- `target_stage_start`
- `target_stage_end`
- `target_stage_play`
- `target_stage_pause`
- `target_stage_next`
- `target_stage_previous`
- `target_stage_goto`
- `target_stage_set_key`
- `target_stage_prepare_next`
- `target_stage_clear_prepared`
- `target_stage_set_annotation`
- `get_target_stage_snapshot`

The target state is authoritative and is normalized back to the existing Stage UI contract.

The legacy `BandStageService` remains only at the realtime/compatibility boundary for now. New target execution code must not route commands through it.

## Consequences

- Target command execution no longer depends on legacy Band command orchestration.
- Existing Stage UI contracts remain stable during migration.
- Realtime compatibility can be removed independently in a later block.
- Legacy RPCs remain available as compatibility infrastructure and are not deleted.

## Migration boundary

The next removal target is the legacy realtime dependency from the canonical Stage route. Until that boundary is completed, `StageExecutionService.connect()` may continue to use the compatibility realtime runtime.
